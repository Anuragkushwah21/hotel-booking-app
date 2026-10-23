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

export async function processRefund(input: ProcessRefundInput) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { payments: true },
  })
  if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')

  const refundedSoFar = booking.payments
    .filter((p) => p.kind === 'REFUND' && p.status === 'SUCCEEDED')
    .reduce((s, p) => s + p.amount, 0)
  const refundable = booking.paidAmount - refundedSoFar

  if (input.action === 'REJECT') {
    if (booking.refundStatus !== 'REFUND_PENDING') {
      throw new BookingError('There is no pending refund to reject', 409, 'NO_PENDING_REFUND')
    }
    return finishRefund(booking.id, input, {
      refundStatus: 'REFUND_REJECTED',
      refundAmount: refundedSoFar,
    })
  }

  const amount = Math.round(Number(input.amount ?? booking.refundAmount))
  if (!Number.isFinite(amount) || amount <= 0 || amount > refundable) {
    throw new BookingError(
      `Refund must be between ₹1 and ${formatINR(refundable)}`,
      400,
      'INVALID_REFUND',
    )
  }

  // Refund online money through the gateway it came from; desk money is
  // handed back at the desk and only recorded here.
  const online = booking.payments.find(
    (p) =>
      p.status === 'SUCCEEDED' &&
      p.kind !== 'REFUND' &&
      (p.gateway === 'RAZORPAY' || p.gateway === 'MOCK') &&
      p.gatewayPaymentId &&
      p.amount >= amount,
  )
  const gatewayRefundId = online
    ? await refundGatewayPayment(online.gatewayPaymentId!, amount)
    : null

  const totalRefunded = refundedSoFar + amount
  return finishRefund(
    booking.id,
    input,
    {
      refundStatus: 'REFUND_PROCESSED',
      refundAmount: totalRefunded,
      refundProcessedAt: new Date(),
      ...(totalRefunded >= booking.paidAmount ? { paymentStatus: 'REFUNDED' as const } : {}),
    },
    {
      amount,
      mode: online?.mode ?? booking.paymentMode,
      gateway: online?.gateway ?? 'DESK',
      gatewayPaymentId: gatewayRefundId,
    },
  )
}

async function finishRefund(
  bookingId: string,
  input: ProcessRefundInput,
  data: Prisma.BookingUpdateInput,
  ledger?: { amount: number; mode: Booking['paymentMode']; gateway: string; gatewayPaymentId: string | null },
) {
  return prisma.$transaction(async (tx) => {
    if (ledger) {
      await tx.payment.create({
        data: {
          bookingId,
          kind: 'REFUND',
          status: 'SUCCEEDED',
          mode: ledger.mode,
          amount: ledger.amount,
          gateway: ledger.gateway,
          gatewayPaymentId: ledger.gatewayPaymentId,
          recordedById: input.managerId,
          notes: input.note?.trim() || null,
          paidAt: new Date(),
        },
      })
    }
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { ...data, refundNote: input.note?.trim() || null },
    })
    await logManagerAction(input.managerId, 'PROCESS_REFUND', {
      bookingId,
      notes: input.note?.trim() || null,
      metadata: { action: input.action, amount: ledger?.amount ?? 0, gateway: ledger?.gateway ?? null },
      client: tx,
    })
    const notificationIds = await queueBookingNotifications(tx, updated, 'REFUND_UPDATE')
    return { booking: updated, notificationIds }
  })
}
