/**
 * Cancellation & refund rules.
 *
 * Refunds are a percentage of what the guest actually paid, tiered on how long
 * before the stay (or table slot) starts the cancellation lands:
 *
 *   ≥ earlyCancelHours                 → earlyRefundPercent   (default 48h → 50%)
 *   ≥ lateCancelHours, < earlyCancelHours → lateRefundPercent  (default 24h → 50%)
 *   later than that, or a no-show      → nothing
 *
 * A cancellation creates a REFUND_PENDING request; money moves only when an
 * admin processes it (processRefund), which also lets them override the amount
 * or reject it.
 */

import type { Booking, HotelSettings, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getHotelSettings } from './settings'
import { checkInInstant, formatINR } from './format'
import { logManagerAction } from './manager-log'
import { refundGatewayPayment } from './payment-gateway'
import { queueBookingNotifications } from './notifications'
import { BookingError } from './booking-engine'

type RefundSettings = Pick<
  HotelSettings,
  'earlyCancelHours' | 'earlyRefundPercent' | 'lateCancelHours' | 'lateRefundPercent'
>

export function refundPolicyLines(s: RefundSettings): string[] {
  const lines: string[] = []
  if (s.earlyRefundPercent === s.lateRefundPercent) {
    lines.push(
      `Cancel at least ${s.lateCancelHours} hours before check-in for a ${s.lateRefundPercent}% refund of the amount paid.`,
    )
  } else {
    lines.push(
      `Cancel at least ${s.earlyCancelHours} hours before check-in for a ${s.earlyRefundPercent}% refund of the amount paid.`,
      `Cancel ${s.lateCancelHours}–${s.earlyCancelHours} hours before check-in for a ${s.lateRefundPercent}% refund.`,
    )
  }
  lines.push(`Cancellations within ${s.lateCancelHours} hours of check-in, and no-shows, are not refunded.`)
  return lines
}

/** When the booked service starts: check-in time for stays, the slot for tables. */
export function serviceStart(b: Pick<Booking, 'type' | 'checkInDate' | 'bookingDate'>): Date | null {
  if ((b.type === 'ROOM' || b.type === 'ROOM_TABLE') && b.checkInDate) return checkInInstant(b.checkInDate)
  return b.bookingDate ?? null
}

export type RefundQuote = {
  eligible: boolean
  percent: number
  amount: number
  hoursBefore: number | null
  tier: 'EARLY' | 'LATE' | 'NONE'
  message: string
}

export function quoteRefund(
  b: Pick<Booking, 'type' | 'checkInDate' | 'bookingDate' | 'paidAmount'>,
  s: RefundSettings,
  now = new Date(),
): RefundQuote {
  const start = serviceStart(b)
  const hoursBefore = start ? (start.getTime() - now.getTime()) / 3_600_000 : null

  let tier: RefundQuote['tier'] = 'NONE'
  let percent = 0
  if (hoursBefore != null && hoursBefore >= s.earlyCancelHours) {
    tier = 'EARLY'
    percent = s.earlyRefundPercent
  } else if (hoursBefore != null && hoursBefore >= s.lateCancelHours) {
    tier = 'LATE'
    percent = s.lateRefundPercent
  }

  const amount = Math.floor((b.paidAmount * percent) / 100)
  const message =
    b.paidAmount === 0
      ? 'Nothing has been paid, so there is nothing to refund.'
      : amount > 0
        ? `You will be refunded ${formatINR(amount)} (${percent}% of ${formatINR(b.paidAmount)} paid).`
        : hoursBefore != null && hoursBefore < 0
          ? 'This booking has already started, so it is not eligible for a refund.'
          : `Cancellations within ${s.lateCancelHours} hours of check-in are not refunded.`

  return { eligible: amount > 0, percent, amount, hoursBefore, tier, message }
}

// ------------------------------------------------------------------
// Cancel
// ------------------------------------------------------------------

export type CancelInput = {
  bookingId: string
  reason?: string | null
} & (
  | { actor: 'GUEST'; userId: string }
  | { actor: 'STAFF'; managerId: string; refundOverride?: number | null }
)

export async function cancelBooking(input: CancelInput) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } })
    if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')

    if (input.actor === 'GUEST' && booking.userId !== input.userId) {
      throw new BookingError('You can only cancel your own bookings', 403, 'FORBIDDEN')
    }
    if (booking.status === 'CANCELLED') {
      throw new BookingError('Booking is already cancelled', 409, 'ALREADY_CANCELLED')
    }
    if (booking.status === 'CHECKED_OUT') {
      throw new BookingError('A completed booking cannot be cancelled', 409, 'COMPLETED')
    }
    if (booking.status === 'CHECKED_IN' && input.actor === 'GUEST') {
      throw new BookingError(
        'You are already checked in — please speak to the front desk.',
        409,
        'CHECKED_IN',
      )
    }

    const settings = await getHotelSettings(tx)
    const quote = quoteRefund(booking, settings)
    const start = serviceStart(booking)
    if (input.actor === 'GUEST' && start && start.getTime() < Date.now()) {
      throw new BookingError(
        'This booking has already started and can no longer be cancelled online.',
        409,
        'STARTED',
      )
    }

    let refund = quote.amount
    if (input.actor === 'STAFF' && input.refundOverride != null) {
      const n = Math.round(Number(input.refundOverride))
      if (!Number.isFinite(n) || n < 0 || n > booking.paidAmount) {
        throw new BookingError(
          `Refund must be between ₹0 and ${formatINR(booking.paidAmount)}`,
          400,
          'INVALID_REFUND',
        )
      }
      refund = n
    }

    const now = new Date()
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReason:
          input.reason?.trim() ||
          (input.actor === 'GUEST' ? 'Cancelled by guest' : 'Cancelled by hotel staff'),
        holdExpiresAt: null,
        remainingAmount: 0,
        refundAmount: refund,
        refundStatus: refund > 0 ? 'REFUND_PENDING' : 'NONE',
        refundRequestedAt: refund > 0 ? now : null,
      },
    })

    // An unpaid checkout that's being abandoned: close its open order.
    await tx.payment.updateMany({
      where: { bookingId: booking.id, status: 'CREATED' },
      data: { status: 'FAILED', failureReason: 'Booking cancelled before payment' },
    })

    if (input.actor === 'STAFF') {
      await logManagerAction(input.managerId, 'CANCEL_BOOKING', {
        bookingId: booking.id,
        notes: input.reason?.trim() || null,
        metadata: {
          previousStatus: booking.status,
          paidAmount: booking.paidAmount,
          policyRefund: quote.amount,
          refundAmount: refund,
          overridden: refund !== quote.amount,
        },
        client: tx,
      })
    }

    // Unpaid holds don't need a cancellation email — the guest never completed it.
    const notificationIds =
      booking.paidAmount > 0 || booking.source === 'WALK_IN' || booking.status !== 'PENDING'
        ? await queueBookingNotifications(tx, updated, 'BOOKING_CANCELLED')
        : []

    return { booking: updated, refund, quote, notificationIds }
  })
}

// ------------------------------------------------------------------
// Refund processing (admin)
// ------------------------------------------------------------------

export type ProcessRefundInput = {
  bookingId: string
  managerId: string
  action: 'PROCESS' | 'REJECT'
  /** Override the requested amount when processing. */
  amount?: number | null
  note?: string | null
}

/** Refund rows remember which payment they reverse, so each one is refunded at most once. */
const REFUND_OF = /^\[refund-of:([^\]]+)\]/

/**
 * Process or reject a pending refund.
 *
 * Money leaves through the gateway, which can't take part in a database
 * transaction, so the order is:
 *   1. under a row lock on the booking, validate the amount against what has
 *      been paid minus every refund already done OR in flight, and write the
 *      refund rows as CREATED (this is what stops a double click refunding twice);
 *   2. call the gateway for each online slice and mark each row SUCCEEDED / FAILED;
 *   3. only if every slice succeeded, settle the booking.
 * A failure leaves the booking REFUND_PENDING with a FAILED ledger row
 * explaining why, and the admin can retry.
 *
 * Online money is refunded across the original online payments (largest
 * first), so an advance + balance paid online can be refunded in one go.
 * Whatever online payments can't cover was paid at the desk and is handed back
 * there — it is only recorded.
 */
export async function processRefund(input: ProcessRefundInput) {
  if (input.action === 'REJECT') {
    const booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { payments: true },
    })
    if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')
    if (booking.refundStatus !== 'REFUND_PENDING') {
      throw new BookingError('There is no pending refund to reject', 409, 'NO_PENDING_REFUND')
    }
    const refundedSoFar = booking.payments
      .filter((p) => p.kind === 'REFUND' && p.status === 'SUCCEEDED')
      .reduce((s, p) => s + p.amount, 0)
    return finishRefund(booking.id, input, { refundStatus: 'REFUND_REJECTED', refundAmount: refundedSoFar })
  }

  // ---- 1. reserve ----
  const planned = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: { payments: true },
    })
    if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')

    const refunds = booking.payments.filter((p) => p.kind === 'REFUND' && p.status !== 'FAILED')
    if (refunds.some((p) => p.status === 'CREATED')) {
      throw new BookingError('A refund for this booking is already being processed', 409, 'REFUND_IN_FLIGHT')
    }
    const refundedSoFar = refunds.reduce((s, p) => s + p.amount, 0)
    const refundable = booking.paidAmount - refundedSoFar

    const amount = Math.round(Number(input.amount ?? booking.refundAmount - refundedSoFar))
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundable) {
      throw new BookingError(
        `Refund must be between ₹1 and ${formatINR(refundable)}`,
        400,
        'INVALID_REFUND',
      )
    }

    // How much of each online payment is still refundable.
    const alreadyByPayment = new Map<string, number>()
    for (const r of refunds) {
      const of = r.notes?.match(REFUND_OF)?.[1]
      if (of) alreadyByPayment.set(of, (alreadyByPayment.get(of) ?? 0) + r.amount)
    }
    const online = booking.payments
      .filter(
        (p) =>
          p.status === 'SUCCEEDED' &&
          p.kind !== 'REFUND' &&
          (p.gateway === 'RAZORPAY' || p.gateway === 'MOCK') &&
          p.gatewayPaymentId,
      )
      .map((p) => ({ payment: p, left: p.amount - (alreadyByPayment.get(p.id) ?? 0) }))
      .filter((x) => x.left > 0)
      .sort((a, b) => b.left - a.left)

    const note = input.note?.trim() || null
    const rows: { id: string; gatewayPaymentId: string | null; amount: number }[] = []
    let remaining = amount
    for (const { payment, left } of online) {
      if (remaining <= 0) break
      const slice = Math.min(left, remaining)
      const row = await tx.payment.create({
        data: {
          bookingId: booking.id,
          kind: 'REFUND',
          status: 'CREATED',
          mode: payment.mode,
          amount: slice,
          gateway: payment.gateway,
          recordedById: input.managerId,
          notes: [`[refund-of:${payment.id}]`, note].filter(Boolean).join(' '),
        },
      })
      rows.push({ id: row.id, gatewayPaymentId: payment.gatewayPaymentId, amount: slice })
      remaining -= slice
    }
    if (remaining > 0) {
      // Desk money: handed back in person, recorded as done.
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          kind: 'REFUND',
          status: 'SUCCEEDED',
          mode: booking.paymentMode === 'ONLINE' ? 'CASH' : booking.paymentMode,
          amount: remaining,
          gateway: 'DESK',
          recordedById: input.managerId,
          notes: note,
          paidAt: new Date(),
        },
      })
    }
    return { rows, amount, refundedSoFar, paidAmount: booking.paidAmount }
  })

  // ---- 2. move the money ----
  const failures: string[] = []
  for (const row of planned.rows) {
    try {
      const refundId = await refundGatewayPayment(row.gatewayPaymentId!, row.amount)
      await prisma.payment.update({
        where: { id: row.id },
        data: { status: 'SUCCEEDED', gatewayPaymentId: refundId, paidAt: new Date() },
      })
    } catch (error) {
      const reason = (error as Error).message?.slice(0, 500) || 'Gateway refund failed'
      failures.push(reason)
      await prisma.payment.update({ where: { id: row.id }, data: { status: 'FAILED', failureReason: reason } })
    }
  }

  // ---- 3. settle ----
  const settled = await prisma.payment.aggregate({
    where: { bookingId: input.bookingId, kind: 'REFUND', status: 'SUCCEEDED' },
    _sum: { amount: true },
  })
  const totalRefunded = settled._sum.amount ?? 0

  if (failures.length > 0) {
    await prisma.booking.update({ where: { id: input.bookingId }, data: { refundAmount: Math.max(totalRefunded, planned.refundedSoFar) } })
    throw new BookingError(
      `The payment gateway rejected the refund: ${failures[0]}. Nothing more was refunded for the failed part — try again.`,
      502,
      'GATEWAY_REFUND_FAILED',
    )
  }

  return finishRefund(input.bookingId, input, {
    refundStatus: 'REFUND_PROCESSED',
    refundAmount: totalRefunded,
    refundProcessedAt: new Date(),
    ...(totalRefunded >= planned.paidAmount ? { paymentStatus: 'REFUNDED' as const } : {}),
  }, planned.amount)
}

async function finishRefund(
  bookingId: string,
  input: ProcessRefundInput,
  data: Prisma.BookingUpdateInput,
  amount = 0,
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { ...data, refundNote: input.note?.trim() || null },
    })
    await logManagerAction(input.managerId, 'PROCESS_REFUND', {
      bookingId,
      notes: input.note?.trim() || null,
      metadata: { action: input.action, amount },
      client: tx,
    })
    const notificationIds = await queueBookingNotifications(tx, updated, 'REFUND_UPDATE')
    return { booking: updated, notificationIds }
  })
}
