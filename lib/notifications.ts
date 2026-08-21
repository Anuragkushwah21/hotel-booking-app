/**
 * Booking notifications (email + SMS).
 *
 * Email uses the existing nodemailer transport from lib/email.ts's config
 * (SMTP_* / EMAIL_* env vars). SMS is behind a provider-shaped interface with
 * a console fallback so nothing crashes when credentials are absent — wire
 * `sendSms` to Twilio/MSG91 when you have an account.
 *
 * Every function here is fire-and-forget by design: a failed notification must
 * never fail the booking that triggered it.
 */

import nodemailer from 'nodemailer'
import type { Booking, Room, Table } from '@prisma/client'

type BookingWithInventory = Booking & {
  room?: Pick<Room, 'name' | 'roomNo'> | null
  table?: Pick<Table, 'tableNo' | 'location'> | null
}

// ------------------------------------------------------------------
// Transports
// ------------------------------------------------------------------

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }
  return transporter
}

const FROM = () =>
  `"${process.env.NEXT_PUBLIC_APP_NAME || 'HotelBook'}" <${
    process.env.SMTP_FROM_EMAIL || process.env.EMAIL_USER
  }>`

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('[notify] email credentials missing; skipping mail to', to)
    return false
  }
  try {
    await getTransporter().sendMail({ from: FROM(), to, subject, html })
    return true
  } catch (error) {
    console.error('[notify] email failed:', error)
    return false
  }
}

/**
 * SMS hook. Replace the body with your provider's SDK call.
 * Kept async and boolean-returning so callers don't change when you do.
 */
export async function sendSms(to: string, message: string): Promise<boolean> {
  const sid = process.env.SMS_ACCOUNT_SID
  const token = process.env.SMS_AUTH_TOKEN
  const from = process.env.SMS_FROM_NUMBER

  if (!sid || !token || !from) {
    console.info(`[notify] SMS (not configured) → ${to}: ${message}`)
    return false
  }

  // TODO: swap for the real provider, e.g.
  //   await twilio(sid, token).messages.create({ to, from, body: message })
  console.info(`[notify] SMS → ${to}: ${message}`)
  return true
}

// ------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
const day = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const dayTime = (d: Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : '—'

function shell(heading: string, body: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f6f6f6;padding:24px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">
      <div style="font-size:20px;font-weight:700;color:#D97706;margin-bottom:4px">
        ${process.env.NEXT_PUBLIC_APP_NAME || 'HotelBook'}
      </div>
      <h1 style="font-size:19px;margin:12px 0 20px;color:#111">${heading}</h1>
      ${body}
      <p style="color:#999;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:14px">
        This is an automated message. Please do not reply.
      </p>
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

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || ''

/** Big, copyable booking number — what the guest quotes at the desk or types into /booking-status. */
function bookingNumberBlock(b: BookingWithInventory): string {
  const url = `${appUrl()}/booking-status?ref=${encodeURIComponent(b.reference)}`
  return `
  <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin:16px 0">
    <div style="color:#92400E;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Your booking number</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:.06em;color:#111;margin-top:4px">${b.reference}</div>
    <div style="margin-top:10px">
      <a href="${url}" style="display:inline-block;background:#D97706;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Check your booking</a>
    </div>
    <div style="color:#92400E;font-size:12px;margin-top:8px">
      Keep this number handy — you can track your booking any time with it and the email address on this booking.
    </div>
  </div>`
}

function bookingRows(b: BookingWithInventory): [string, string][] {
  const rows: [string, string][] = [['Booking number', b.reference]]

  if (b.type === 'ROOM') {
    rows.push(['Room', b.room ? `${b.room.name} (${b.room.roomNo})` : '—'])
    rows.push(['Check-in', day(b.checkInDate)])
    rows.push(['Check-out', day(b.checkOutDate)])
  } else {
    rows.push(['Table', b.table ? `Table ${b.table.tableNo}` : '—'])
    rows.push(['When', dayTime(b.bookingDate)])
  }

  rows.push(['Guests', String(b.guestCount)])
  if (b.addOns.length) rows.push(['Add-ons', b.addOns.join(', ')])
  rows.push(['Total', inr(b.totalPrice)])
  rows.push(['Payment', `${b.paymentStatus} (${b.paymentMode})`])
  return rows
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export async function sendBookingConfirmation(b: BookingWithInventory): Promise<void> {
  const walkIn = b.source === 'WALK_IN'
  const heading = walkIn ? 'Your booking is confirmed' : 'Booking confirmed'
  const intro = walkIn
    ? `<p>Hi ${b.guestName}, your booking has been created at our front desk. Details below.</p>`
    : `<p>Hi ${b.guestName}, thanks for booking with us. Details below.</p>`

  await sendEmail(
    b.guestEmail,
    `Booking confirmed — ${b.reference}`,
    shell(heading, intro + bookingNumberBlock(b) + detailRows(bookingRows(b))),
  )

  if (b.guestPhone) {
    const when = b.type === 'ROOM' ? day(b.checkInDate) : dayTime(b.bookingDate)
    await sendSms(
      b.guestPhone,
      `Booking ${b.reference} confirmed for ${when}. Total ${inr(b.totalPrice)}. Track it: ${appUrl()}/booking-status`,
    )
  }
}

export async function sendBookingCancellation(
  b: BookingWithInventory,
  refundAmount = 0,
): Promise<void> {
  const rows = bookingRows(b)
  if (refundAmount > 0) rows.push(['Refund', inr(refundAmount)])

  await sendEmail(
    b.guestEmail,
    `Booking cancelled — ${b.reference}`,
    shell(
      'Booking cancelled',
      `<p>Hi ${b.guestName}, your booking has been cancelled.${
        refundAmount > 0
          ? ` A refund of ${inr(refundAmount)} will reach your original payment method in 5–7 business days.`
          : ''
      }</p>` +
        (b.cancelReason ? `<p style="color:#666">Reason: ${b.cancelReason}</p>` : '') +
        detailRows(rows),
    ),
  )

  if (b.guestPhone) {
    await sendSms(b.guestPhone, `Booking ${b.reference} has been cancelled.`)
  }
}

export async function sendBookingModified(b: BookingWithInventory): Promise<void> {
  await sendEmail(
    b.guestEmail,
    `Booking updated — ${b.reference}`,
    shell(
      'Your booking was updated',
      `<p>Hi ${b.guestName}, here are your revised booking details.</p>` +
        bookingNumberBlock(b) +
        detailRows(bookingRows(b)),
    ),
  )
}

export async function sendCheckInReminder(b: BookingWithInventory): Promise<void> {
  await sendEmail(
    b.guestEmail,
    `See you tomorrow — ${b.reference}`,
    shell(
      'Your stay starts tomorrow',
      `<p>Hi ${b.guestName}, we're looking forward to hosting you. Check-in opens at 2:00 PM.</p>` +
        detailRows(bookingRows(b)),
    ),
  )

  if (b.guestPhone) {
    await sendSms(b.guestPhone, `Reminder: check-in for booking ${b.reference} is tomorrow from 2 PM.`)
  }
}

export async function sendCheckOutFollowUp(b: BookingWithInventory): Promise<void> {
  // Walk-in guests have no password on their account, so send them to the
  // booking-number lookup rather than the signed-in bookings list.
  const url =
    b.source === 'WALK_IN'
      ? `${appUrl()}/booking-status?ref=${encodeURIComponent(b.reference)}`
      : `${appUrl()}/bookings`
  await sendEmail(
    b.guestEmail,
    `Thanks for staying with us — ${b.reference}`,
    shell(
      'How was your stay?',
      `<p>Hi ${b.guestName}, thanks for staying with us. We'd love to hear how it went.</p>
       <p><a href="${url}" style="display:inline-block;background:#D97706;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none">Leave a review</a></p>`,
    ),
  )
}

/**
 * Notifications are best-effort: never let one fail its caller.
 * Usage: `void notifySafely(() => sendBookingConfirmation(booking))`
 */
export function notifySafely(fn: () => Promise<void>): void {
  fn().catch((error) => console.error('[notify] delivery failed:', error))
}
