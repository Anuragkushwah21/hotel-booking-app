/**
 * Booking notifications: email now, WhatsApp when a provider is connected.
 *
 * Every message is a NotificationLog row (PENDING → SENT | FAILED), so the
 * admin can see what reached the guest and a failed send can be retried.
 *
 *   queueBookingNotifications(tx, booking, event)   inside a transaction
 *   dispatchNotifications(ids)                      after it commits
 *   notifyBooking(bookingId, event)                 both, for non-tx callers
 *
 * Delivery is best-effort by design: nothing here throws into the booking or
 * payment that triggered it. Use `notifySafely(() => …)` to fire and forget.
 */

import type { NotificationChannel, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getMailer, mailConfigured, mailFrom } from './mailer'
import { getWhatsAppProvider, normalizeWhatsAppNumber } from './whatsapp'
import { HOTEL } from './hotel'
import { getHotelSettings } from './settings'
import { refundPolicyLines } from './cancellation'
import { formatDate, formatDateTime, formatINR } from './format'
import { PAYMENT_RULE_LABELS } from './pricing'

type Client = Prisma.TransactionClient | typeof prisma

export type NotificationEvent =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_MODIFIED'
  | 'PAYMENT_RECEIVED'
  | 'REFUND_UPDATE'
  | 'BOOKING_UNAVAILABLE_REFUND'
  | 'CHECKIN_REMINDER'
  | 'CHECKOUT_FOLLOWUP'

const MAX_ATTEMPTS = 3

// ------------------------------------------------------------------
// Queue & dispatch
// ------------------------------------------------------------------

export async function queueBookingNotifications(
  client: Client,
  booking: { id: string; guestEmail: string; guestPhone: string | null },
  event: NotificationEvent,
): Promise<string[]> {
  const rows: { channel: NotificationChannel; recipient: string }[] = [
    { channel: 'EMAIL', recipient: booking.guestEmail },
  ]
  const wa = booking.guestPhone ? normalizeWhatsAppNumber(booking.guestPhone) : null
  if (wa) rows.push({ channel: 'WHATSAPP', recipient: wa })

  const created = await Promise.all(
    rows.map((r) =>
      client.notificationLog.create({
        data: { bookingId: booking.id, event, channel: r.channel, recipient: r.recipient },
        select: { id: true },
      }),
    ),
  )
  return created.map((c) => c.id)
}

const bookingForNotice = {
  room: { select: { name: true, roomNo: true, type: true } },
  table: { select: { tableNo: true, location: true } },
} satisfies Prisma.BookingInclude

type NoticeBooking = Prisma.BookingGetPayload<{ include: typeof bookingForNotice }>

export async function dispatchNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const logs = await prisma.notificationLog.findMany({
    where: { id: { in: ids }, status: { not: 'SENT' }, attempts: { lt: MAX_ATTEMPTS } },
  })
  if (logs.length === 0) return

  const [settings, bookings] = await Promise.all([
    getHotelSettings(),
    prisma.booking.findMany({
      where: { id: { in: logs.map((l) => l.bookingId).filter((x): x is string => !!x) } },
      include: bookingForNotice,
    }),
  ])
  const byId = new Map(bookings.map((b) => [b.id, b]))
  const policy = refundPolicyLines(settings)

  for (const log of logs) {
    const booking = log.bookingId ? byId.get(log.bookingId) : undefined
    if (!booking) {
      await markLog(log.id, 'FAILED', 'Booking no longer exists')
      continue
    }
    const event = log.event as NotificationEvent

    if (log.channel === 'EMAIL') {
      if (!mailConfigured()) {
        await markLog(log.id, 'FAILED', 'Email credentials not configured')
        continue
      }
      try {
        const { subject, html } = renderEmail(event, booking, policy)
        await getMailer().sendMail({ from: mailFrom(), to: log.recipient, subject, html })
        await markLog(log.id, 'SENT')
      } catch (error) {
        await markLog(log.id, 'FAILED', error instanceof Error ? error.message : 'Send failed')
      }
    } else if (log.channel === 'WHATSAPP') {
      const provider = getWhatsAppProvider()
      if (!provider) {
        // Left PENDING on purpose: it goes out once a provider is connected.
        await prisma.notificationLog.update({
          where: { id: log.id },
          data: { error: 'WhatsApp provider not configured' },
        })
        continue
      }
      const result = await provider.sendText(log.recipient, renderWhatsApp(event, booking))
      await markLog(log.id, result.ok ? 'SENT' : 'FAILED', result.ok ? undefined : result.error)
    }
  }
}

async function markLog(id: string, status: 'SENT' | 'FAILED', error?: string) {
  await prisma.notificationLog
    .update({
      where: { id },
      data: {
        status,
        error: error ?? null,
        attempts: { increment: 1 },
        ...(status === 'SENT' ? { sentAt: new Date() } : {}),
      },
    })
    .catch((e) => console.error('[notify] could not update log', id, e))
}

/** Queue + dispatch in one go, for callers outside a transaction. */
export async function notifyBooking(bookingId: string, event: NotificationEvent): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, guestEmail: true, guestPhone: true },
  })
  if (!booking) return
  const ids = await queueBookingNotifications(prisma, booking, event)
  await dispatchNotifications(ids)
}

/** Re-send everything still PENDING/FAILED for a booking (admin "retry"). */
export async function retryBookingNotifications(bookingId: string): Promise<void> {
  const logs = await prisma.notificationLog.findMany({
    where: { bookingId, status: { not: 'SENT' }, attempts: { lt: MAX_ATTEMPTS } },
    select: { id: true },
  })
  await dispatchNotifications(logs.map((l) => l.id))
}

/**
 * Notifications are best-effort: never let one fail its caller.
 * Usage: `notifySafely(() => notifyBooking(id, 'BOOKING_CONFIRMED'))`
 */
export function notifySafely(fn: () => Promise<void>): void {
  fn().catch((error) => console.error('[notify] delivery failed:', error))
}

// Older call sites pass a booking object; they keep working unchanged.
export const sendBookingConfirmation = (b: { id: string }) => notifyBooking(b.id, 'BOOKING_CONFIRMED')
export const sendBookingCancellation = (b: { id: string }, _refund?: number) =>
  notifyBooking(b.id, 'BOOKING_CANCELLED')
export const sendBookingModified = (b: { id: string }) => notifyBooking(b.id, 'BOOKING_MODIFIED')
export const sendCheckInReminder = (b: { id: string }) => notifyBooking(b.id, 'CHECKIN_REMINDER')
export const sendCheckOutFollowUp = (b: { id: string }) => notifyBooking(b.id, 'CHECKOUT_FOLLOWUP')

// ------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || ''
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function shell(heading: string, body: string): string {
  const c = HOTEL.contact
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f6f6f6;padding:24px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">
      <div style="font-size:20px;font-weight:700;color:#D97706;margin-bottom:4px">${esc(HOTEL.name)}</div>
      <h1 style="font-size:19px;margin:12px 0 20px;color:#111">${heading}</h1>
      ${body}
      <div style="color:#555;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:14px;line-height:1.6">
        <strong>${esc(HOTEL.name)}</strong><br/>
        ${c.addressLines.map(esc).join(', ')}<br/>
        Phone ${esc(c.phone)} · WhatsApp ${esc(c.whatsapp)} · ${esc(c.email)}<br/>
        Check-in from ${HOTEL.policies.checkIn} · Check-out by ${HOTEL.policies.checkOut}
      </div>
      <p style="color:#999;font-size:12px;margin-top:14px">This is an automated message. Please do not reply.</p>
    </div>
  </div>`
}

function detailRows(rows: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows
    .map(
      ([k, v]) => `<tr>
        <td style="padding:8px 0;color:#666;border-bottom:1px solid #eee">${k}</td>
        <td style="padding:8px 0;color:#111;text-align:right;font-weight:600;border-bottom:1px solid #eee">${v}</td>
      </tr>`,
    )
    .join('')}</table>`
}

function bookingNumberBlock(b: NoticeBooking): string {
  const url = `${appUrl()}/booking-status?ref=${encodeURIComponent(b.reference)}`
  return `
  <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin:16px 0">
    <div style="color:#92400E;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Booking ID</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:.06em;color:#111;margin-top:4px">${b.reference}</div>
    <div style="margin-top:10px">
      <a href="${url}" style="display:inline-block;background:#D97706;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">View booking</a>
    </div>
  </div>`
}

const hasRoom = (b: NoticeBooking) => b.type === 'ROOM' || b.type === 'ROOM_TABLE'
const hasTable = (b: NoticeBooking) => b.type === 'TABLE' || b.type === 'ROOM_TABLE'
const roomNo = (b: NoticeBooking) => b.assignedRoomNo ?? b.room?.roomNo ?? null

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Unpaid',
  PARTIALLY_PAID: 'Advance paid',
  PAID: 'Paid in full',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
}

function bookingRows(b: NoticeBooking): [string, string][] {
  const rows: [string, string][] = [
    ['Booking ID', b.reference],
    ['Guest', esc(b.guestName)],
  ]
  if (hasRoom(b)) {
    rows.push(['Room', b.room ? `${esc(b.room.name)}${b.room.type ? ` · ${esc(b.room.type)}` : ''}` : '—'])
    if (roomNo(b)) rows.push(['Room number', esc(roomNo(b)!)])
    rows.push(['Check-in', `${formatDate(b.checkInDate)}, from ${HOTEL.policies.checkIn}`])
    rows.push(['Check-out', `${formatDate(b.checkOutDate)}, by ${HOTEL.policies.checkOut}`])
    rows.push(['Guests', String(b.guestCount)])
  }
  if (hasTable(b)) {
    rows.push(['Table', b.table ? `Table ${esc(b.table.tableNo)}${b.table.location ? ` · ${esc(b.table.location)}` : ''}` : '—'])
    rows.push(['Reservation', formatDateTime(b.bookingDate)])
    rows.push(['Diners', String(b.tableGuestCount ?? b.guestCount)])
  }
  if (b.addOns.length) rows.push(['Add-ons', b.addOns.map(esc).join(', ')])
  return rows
}

function moneyRows(b: NoticeBooking): [string, string][] {
  const rows: [string, string][] = []
  if (b.roomAmount) rows.push(['Room charges', formatINR(b.roomAmount)])
  if (b.tableAmount) rows.push(['Table charges', formatINR(b.tableAmount)])
  if (b.addOnsAmount) rows.push(['Add-ons', formatINR(b.addOnsAmount)])
  if (b.taxAmount) rows.push(['Taxes (GST)', formatINR(b.taxAmount)])
  rows.push(['Total', formatINR(b.totalPrice)])
  rows.push(['Amount paid', formatINR(b.paidAmount)])
  if (b.remainingAmount > 0) rows.push(['Balance due at check-in', formatINR(b.remainingAmount)])
  rows.push(['Payment status', PAYMENT_LABEL[b.paymentStatus] ?? b.paymentStatus])
  if (b.paymentRule && b.paymentRule in PAYMENT_RULE_LABELS) {
    rows.push(['Payment plan', PAYMENT_RULE_LABELS[b.paymentRule as keyof typeof PAYMENT_RULE_LABELS]])
  }
  return rows
}

function policyBlock(lines: string[]): string {
  return `<div style="margin-top:12px;font-size:13px;color:#444">
    <strong>Cancellation policy</strong>
    <ul style="margin:6px 0 0 18px;padding:0">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
  </div>`
}

function renderEmail(
  event: NotificationEvent,
  b: NoticeBooking,
  policy: string[],
): { subject: string; html: string } {
  const hi = `<p>Hi ${esc(b.guestName)},</p>`
  const details = detailRows(bookingRows(b))
  const money = detailRows(moneyRows(b))

  switch (event) {
    case 'BOOKING_CONFIRMED':
      return {
        subject: `Booking confirmed — ${b.reference}`,
        html: shell(
          'Your booking is confirmed',
          `${hi}<p>${
            b.source === 'WALK_IN'
              ? 'Your booking has been created at our front desk.'
              : 'Thank you — your payment was received and your booking is confirmed.'
          }${roomNo(b) ? ` You are in <strong>room ${esc(roomNo(b)!)}</strong>.` : ''}</p>` +
            bookingNumberBlock(b) + details + money + policyBlock(policy),
        ),
      }
    case 'PAYMENT_RECEIVED':
      return {
        subject: `Payment received — ${b.reference}`,
        html: shell('Payment received', `${hi}<p>We've recorded a payment on your booking.</p>` + details + money),
      }
    case 'BOOKING_CANCELLED':
      return {
        subject: `Booking cancelled — ${b.reference}`,
        html: shell(
          'Booking cancelled',
          `${hi}<p>Your booking has been cancelled.${
            b.refundAmount > 0
              ? ` A refund of <strong>${formatINR(b.refundAmount)}</strong> ${
                  b.refundStatus === 'REFUND_PROCESSED'
                    ? 'has been processed to your original payment method.'
                    : 'will be processed to your original payment method within 5–7 business days.'
                }`
              : b.paidAmount > 0
                ? ' Under our cancellation policy this booking is not eligible for a refund.'
                : ''
          }</p>` +
            (b.cancelReason ? `<p style="color:#666">Reason: ${esc(b.cancelReason)}</p>` : '') +
            details,
        ),
      }
    case 'REFUND_UPDATE':
      return {
        subject: `Refund update — ${b.reference}`,
        html: shell(
          b.refundStatus === 'REFUND_REJECTED' ? 'Refund request declined' : 'Your refund has been processed',
          `${hi}<p>${
            b.refundStatus === 'REFUND_REJECTED'
              ? 'After review, this booking is not eligible for a refund.'
              : `We have refunded <strong>${formatINR(b.refundAmount)}</strong> to your original payment method. It can take 5–7 business days to appear.`
          }</p>` + (b.refundNote ? `<p style="color:#666">${esc(b.refundNote)}</p>` : '') + details,
        ),
      }
    case 'BOOKING_UNAVAILABLE_REFUND':
      return {
        subject: `We couldn't hold your room — ${b.reference}`,
        html: shell(
          'Your room was no longer available',
          `${hi}<p>Your payment reached us after the room hold had expired, and the room had been booked in the meantime. We're sorry. A full refund of <strong>${formatINR(b.refundAmount)}</strong> is being processed — no action is needed from you.</p>` +
            details,
        ),
      }
    case 'BOOKING_MODIFIED':
      return {
        subject: `Booking updated — ${b.reference}`,
        html: shell('Your booking was updated', `${hi}<p>Here are your revised booking details.</p>` + bookingNumberBlock(b) + details + money),
      }
    case 'CHECKIN_REMINDER':
      return {
        subject: `See you tomorrow — ${b.reference}`,
        html: shell(
          'Your stay starts tomorrow',
          `${hi}<p>We're looking forward to hosting you. Check-in opens at ${HOTEL.policies.checkIn}.${
            b.remainingAmount > 0 ? ` A balance of ${formatINR(b.remainingAmount)} is payable at check-in.` : ''
          }</p>` + details,
        ),
      }
    case 'CHECKOUT_FOLLOWUP': {
      // Walk-in guests have no password on their account, so send them to the
      // booking-number lookup rather than the signed-in bookings list.
      const url =
        b.source === 'WALK_IN'
          ? `${appUrl()}/booking-status?ref=${encodeURIComponent(b.reference)}`
          : `${appUrl()}/bookings`
      return {
        subject: `Thanks for staying with us — ${b.reference}`,
        html: shell(
          'How was your stay?',
          `${hi}<p>Thanks for staying with us. We'd love to hear how it went.</p>
           <p><a href="${url}" style="display:inline-block;background:#D97706;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none">Leave a review</a></p>`,
        ),
      }
    }
  }
}

function renderWhatsApp(event: NotificationEvent, b: NoticeBooking): string {
  const when = hasRoom(b)
    ? `${formatDate(b.checkInDate)} – ${formatDate(b.checkOutDate)}`
    : formatDateTime(b.bookingDate)
  const room = roomNo(b) ? `, room ${roomNo(b)}` : ''
  switch (event) {
    case 'BOOKING_CONFIRMED':
      return `${HOTEL.name}: booking ${b.reference} confirmed for ${when}${room}. Paid ${formatINR(b.paidAmount)}${
        b.remainingAmount > 0 ? `, balance ${formatINR(b.remainingAmount)} at check-in` : ''
      }. ${appUrl()}/booking-status?ref=${b.reference}`
    case 'BOOKING_CANCELLED':
      return `${HOTEL.name}: booking ${b.reference} has been cancelled.${
        b.refundAmount > 0 ? ` Refund of ${formatINR(b.refundAmount)} is on its way.` : ''
      }`
    case 'REFUND_UPDATE':
      return b.refundStatus === 'REFUND_REJECTED'
        ? `${HOTEL.name}: the refund request for ${b.reference} was declined.`
        : `${HOTEL.name}: refund of ${formatINR(b.refundAmount)} for ${b.reference} has been processed.`
    case 'BOOKING_UNAVAILABLE_REFUND':
      return `${HOTEL.name}: sorry — the room for ${b.reference} was no longer available. A full refund of ${formatINR(b.refundAmount)} is being processed.`
    case 'PAYMENT_RECEIVED':
      return `${HOTEL.name}: payment received for ${b.reference}. Paid so far ${formatINR(b.paidAmount)}.`
    case 'BOOKING_MODIFIED':
      return `${HOTEL.name}: booking ${b.reference} was updated — ${when}${room}.`
    case 'CHECKIN_REMINDER':
      return `${HOTEL.name}: see you tomorrow! Check-in for ${b.reference} opens at ${HOTEL.policies.checkIn}.`
    case 'CHECKOUT_FOLLOWUP':
      return `${HOTEL.name}: thanks for staying with us. We'd love your review: ${appUrl()}/bookings`
  }
}
