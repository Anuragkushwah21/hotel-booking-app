/**
 * Money taken (or reversed) at the front desk.
 *
 * Every change goes through the Payment ledger so Booking.paidAmount /
 * remainingAmount / paymentStatus can always be explained line by line.
 */

import type { PaymentMode, PaymentStatus } from '@prisma/client'
import { prisma } from './prisma'
import { BookingError } from './booking-engine'
import { formatINR } from './format'
import { logManagerAction } from './manager-log'
import { queueBookingNotifications } from './notifications'

export function paymentStatusFor(paid: number, total: number): PaymentStatus {
  if (paid <= 0) return 'PENDING'
  return paid >= total ? 'PAID' : 'PARTIALLY_PAID'
}

/** Collect a balance (or any amount) at the desk. */
export async function recordDeskPayment(input: {
  bookingId: string
  managerId: string
  amount: number
  mode: Exclude<PaymentMode, 'ONLINE'>
  notes?: string | null
}) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } })
    if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')
    if (booking.status === 'CANCELLED') {
      throw new BookingError('Cannot take payment on a cancelled booking', 409, 'CANCELLED')
    }

    const due = booking.totalPrice - booking.paidAmount
    const amount = Math.round(input.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > due) {
      throw new BookingError(`Amount must be between ₹1 and ${formatINR(due)}`, 400, 'INVALID_AMOUNT')
    }

    await tx.payment.create({
      data: {
        bookingId: booking.id,
        kind: booking.paidAmount > 0 ? 'BALANCE' : amount >= booking.totalPrice ? 'FULL' : 'ADVANCE',
        status: 'SUCCEEDED',
        mode: input.mode,
        amount,
        gateway: 'DESK',
        recordedById: input.managerId,
        notes: input.notes?.trim() || null,
        paidAt: new Date(),
      },
    })

    const paid = booking.paidAmount + amount
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        paidAmount: paid,
        remainingAmount: booking.totalPrice - paid,
        paymentStatus: paymentStatusFor(paid, booking.totalPrice),
        // Settling an online booking at the desk also ends its hold.
        holdExpiresAt: null,
        ...(booking.status === 'PENDING' ? { status: 'CONFIRMED', confirmedAt: new Date() } : {}),
      },
    })

    await logManagerAction(input.managerId, 'RECORD_PAYMENT', {
      bookingId: booking.id,
      notes: input.notes?.trim() || null,
      metadata: { amount, mode: input.mode, paidAmount: paid, remaining: updated.remainingAmount },
      client: tx,
    })
    const notificationIds = await queueBookingNotifications(tx, updated, 'PAYMENT_RECEIVED')
    return { booking: updated, notificationIds }
  })
}

/**
 * Admin "mark paid / unpaid" toggle. PAID books a ledger line for whatever is
 * outstanding; PENDING (unpaid) reverses desk payments only — online gateway
 * money must be refunded, not erased.
 */
export async function setPaymentStatus(input: {
  bookingId: string
  managerId: string
  status: 'PAID' | 'PENDING'
  mode?: Exclude<PaymentMode, 'ONLINE'>
  notes?: string | null
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { payments: true },
  })
  if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')

  if (input.status === 'PAID') {
    const due = booking.totalPrice - booking.paidAmount
    if (due <= 0) return { booking, notificationIds: [] as string[] }
    return recordDeskPayment({
      bookingId: booking.id,
      managerId: input.managerId,
      amount: due,
      mode: input.mode ?? (booking.paymentMode === 'ONLINE' ? 'CASH' : booking.paymentMode),
      notes: input.notes ?? 'Marked as paid',
    })
  }

  const onlinePaid = booking.payments.some(
    (p) => p.status === 'SUCCEEDED' && p.kind !== 'REFUND' && p.gateway !== 'DESK' && p.gateway !== 'LEGACY',
  )
  if (onlinePaid) {
    throw new BookingError(
      'This booking was paid online — process a refund instead of marking it unpaid.',
      409,
      'ONLINE_PAID',
    )
  }

  return prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { bookingId: booking.id, gateway: { in: ['DESK', 'LEGACY'] }, status: 'SUCCEEDED', kind: { not: 'REFUND' } },
      data: { status: 'FAILED', failureReason: `Reversed by staff${input.notes ? `: ${input.notes}` : ''}` },
    })
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { paidAmount: 0, remainingAmount: booking.totalPrice, paymentStatus: 'PENDING' },
    })
    await logManagerAction(input.managerId, 'UPDATE_PAYMENT', {
      bookingId: booking.id,
      notes: input.notes?.trim() || null,
      metadata: { from: booking.paymentStatus, to: 'PENDING', reversed: booking.paidAmount },
      client: tx,
    })
    return { booking: updated, notificationIds: [] as string[] }
  })
}
