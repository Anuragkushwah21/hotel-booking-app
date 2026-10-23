/**
 * Online payment → automatic confirmation.
 *
 * This is what replaced manual admin approval for online bookings:
 *
 *   startOnlinePayment()   guest clicks "Pay now": a Payment row (CREATED) and a
 *                          gateway order for the amount the payment rule set.
 *   confirmOnlinePayment() the gateway says it succeeded (browser callback or
 *                          webhook — whichever arrives first; the other is a
 *                          no-op). In ONE transaction, holding the room/table
 *                          row locks, it re-checks availability, marks the
 *                          payment SUCCEEDED, confirms the booking, snapshots
 *                          the room number and queues the confirmation notices.
 *
 * Edge cases handled inside that transaction:
 *   - Replayed callback/webhook        → idempotent, returns the existing result.
 *   - Paid after the 15-min hold lapsed and the room is still free
 *                                       → confirmed normally.
 *   - Paid after the hold lapsed and someone else took the room
 *                                       → booking cancelled, full refund queued
 *                                         (REFUND_PENDING), guest told why.
 *   - Room still free but the table add-on was taken
 *                                       → room confirmed, table leg dropped, its
 *                                         charge queued for refund.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  BookingError,
  HOLD_EXPIRED_REASONS,
  ONLINE_HOLD_MINUTES,
  checkRoomAvailability,
  isTableFree,
} from './booking-engine'
import { createGatewayOrder, type GatewayOrder } from './payment-gateway'
import { getHotelSettings } from './settings'
import { taxOn } from './pricing'
import { queueBookingNotifications } from './notifications'

type Tx = Prisma.TransactionClient

const isRoomType = (t: string) => t === 'ROOM' || t === 'ROOM_TABLE'
const isTableType = (t: string) => t === 'TABLE' || t === 'ROOM_TABLE'

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------

/**
 * Start payment for an already-authorized online booking. Route handlers must
 * check either the signed-in owner or the booking-specific guest access token
 * before calling this function.
 */
export async function startOnlinePayment(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking) {
    throw new BookingError('Booking not found', 404, 'NOT_FOUND')
  }
  if (booking.source !== 'ONLINE') {
    throw new BookingError('This booking is settled at the front desk', 409, 'NOT_ONLINE')
  }
  if (booking.status !== 'PENDING' || booking.paidAmount > 0) {
    throw new BookingError(
      booking.status === 'CONFIRMED' ? 'This booking is already paid and confirmed' : 'This booking can no longer be paid',
      409,
      'NOT_PAYABLE',
    )
  }

  // A lapsed hold can be resumed only if the inventory is still free.
  if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() < Date.now()) {
    await assertInventoryStillFree(prisma as unknown as Tx, booking)
    await prisma.booking.update({
      where: { id: booking.id },
      data: { holdExpiresAt: new Date(Date.now() + ONLINE_HOLD_MINUTES * 60 * 1000) },
    })
  }

  const amount = booking.advanceAmount > 0 ? booking.advanceAmount : booking.totalPrice
  const order: GatewayOrder = await createGatewayOrder({
    amount,
    receipt: booking.reference,
    notes: { bookingId: booking.id, reference: booking.reference },
  })

  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      kind: amount >= booking.totalPrice ? 'FULL' : 'ADVANCE',
      status: 'CREATED',
      mode: 'ONLINE',
      amount,
      gateway: order.gateway,
      gatewayOrderId: order.orderId,
    },
  })

  return { booking, order, amount }
}

async function assertInventoryStillFree(
  db: Tx,
  b: { id: string; type: string; roomId: string | null; tableId: string | null; checkInDate: Date | null; checkOutDate: Date | null; bookingDate: Date | null },
) {
  if (isRoomType(b.type) && b.roomId && b.checkInDate && b.checkOutDate) {
    const a = await checkRoomAvailability(b.roomId, b.checkInDate, b.checkOutDate, {
      excludeBookingId: b.id,
      client: db,
    })
    if (!a.available) {
      throw new BookingError(
        'Your hold expired and the room has since been booked. Please choose another room.',
        409,
        'HOLD_LOST',
      )
    }
  }
  if (b.type === 'TABLE' && b.tableId && b.bookingDate) {
    if (!(await isTableFree(b.tableId, b.bookingDate, { excludeBookingId: b.id, client: db }))) {
      throw new BookingError('Your hold expired and the table has since been booked.', 409, 'HOLD_LOST')
    }
  }
}

// ------------------------------------------------------------------
// Confirm
// ------------------------------------------------------------------

export type ConfirmOutcome = 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'INVENTORY_LOST'

export async function confirmOnlinePayment(input: {
  orderId: string
  paymentId: string
  /** From the gateway, when known — guards against a tampered order amount. */
  amountPaise?: number
}) {
  const result = await prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUnique({ where: { gatewayOrderId: input.orderId } })
      if (!payment) throw new BookingError('Unknown payment order', 404, 'UNKNOWN_ORDER')

      if (payment.status === 'SUCCEEDED') {
        const booking = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId } })
        return { outcome: 'ALREADY_CONFIRMED' as ConfirmOutcome, booking, notificationIds: [] as string[] }
      }
      if (input.amountPaise != null && input.amountPaise !== payment.amount * 100) {
        throw new BookingError('Payment amount does not match the order', 400, 'AMOUNT_MISMATCH')
      }

      const current = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId } })

      // Same lock order as the booking engine (room, then table) so a payment
      // confirmation and a new booking for the same room serialise.
      if (current.roomId) {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${current.roomId} FOR UPDATE`
      }
      if (current.tableId) {
        await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${current.tableId} FOR UPDATE`
      }
      // Re-read under the locks.
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: payment.bookingId },
        include: { room: { select: { roomNo: true } } },
      })

      const now = new Date()
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED', gatewayPaymentId: input.paymentId, paidAt: now },
      })
      // Other open orders for this booking are now moot.
      await tx.payment.updateMany({
        where: { bookingId: booking.id, status: 'CREATED', id: { not: payment.id } },
        data: { status: 'FAILED', failureReason: 'Superseded by a successful payment' },
      })

      const paid = booking.paidAmount + payment.amount
      const cancelledByGuestOrStaff =
        booking.status === 'CANCELLED' && !HOLD_EXPIRED_REASONS.includes(booking.cancelReason ?? '')

      // ---- re-check inventory inside the transaction ----
      let roomFree = true
      if (isRoomType(booking.type) && booking.roomId && booking.checkInDate && booking.checkOutDate) {
        const a = await checkRoomAvailability(booking.roomId, booking.checkInDate, booking.checkOutDate, {
          excludeBookingId: booking.id,
          client: tx,
        })
        roomFree = a.available
      }
      let tableFree = true
      if (isTableType(booking.type) && booking.tableId && booking.bookingDate) {
        tableFree = await isTableFree(booking.tableId, booking.bookingDate, {
          excludeBookingId: booking.id,
          client: tx,
        })
      }
      const primaryLost =
        cancelledByGuestOrStaff ||
        (isRoomType(booking.type) ? !roomFree : !tableFree)

      if (primaryLost) {
        const updated = await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'PAID',
            paidAmount: paid,
            remainingAmount: 0,
            holdExpiresAt: null,
            cancelledAt: booking.cancelledAt ?? now,
            cancelReason: cancelledByGuestOrStaff
              ? booking.cancelReason
              : 'Inventory was no longer available when payment completed',
            refundAmount: paid,
            refundStatus: 'REFUND_PENDING',
            refundRequestedAt: now,
            adminNotes: appendNote(booking.adminNotes, `Payment ${input.paymentId} received after inventory was lost — full refund due.`),
          },
        })
        const notificationIds = await queueBookingNotifications(tx, updated, 'BOOKING_UNAVAILABLE_REFUND')
        return { outcome: 'INVENTORY_LOST' as ConfirmOutcome, booking: updated, notificationIds }
      }

      // Room is safe; drop the table leg if it was taken meanwhile.
      let tableDrop: Prisma.BookingUpdateInput = {}
      let total = booking.totalPrice
      let refundExcess = 0
      if (booking.type === 'ROOM_TABLE' && !tableFree) {
        const settings = await getHotelSettings(tx)
        const tableTax = taxOn(booking.tableAmount, settings.gstPercent)
        total = booking.totalPrice - booking.tableAmount - tableTax
        refundExcess = Math.max(0, paid - total)
        tableDrop = {
          type: 'ROOM',
          table: { disconnect: true },
          bookingDate: null,
          tableGuestCount: null,
          baseAmount: booking.baseAmount - booking.tableAmount,
          tableAmount: 0,
          taxAmount: booking.taxAmount - tableTax,
          totalPrice: total,
          adminNotes: appendNote(booking.adminNotes, 'Table add-on was taken before payment completed and was removed.'),
          ...(refundExcess > 0
            ? { refundAmount: refundExcess, refundStatus: 'REFUND_PENDING', refundRequestedAt: now }
            : {}),
        }
      }

      const remaining = Math.max(0, total - paid)
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          ...tableDrop,
          status: 'CONFIRMED',
          paymentStatus: remaining === 0 ? 'PAID' : 'PARTIALLY_PAID',
          paidAmount: paid,
          remainingAmount: remaining,
          holdExpiresAt: null,
          confirmedAt: now,
          cancelledAt: null,
          cancelReason: null,
          assignedRoomNo: booking.room?.roomNo ?? null,
        },
      })

      const notificationIds = await queueBookingNotifications(tx, updated, 'BOOKING_CONFIRMED')
      return { outcome: 'CONFIRMED' as ConfirmOutcome, booking: updated, notificationIds }
    },
    { timeout: 15000, maxWait: 10000 },
  )

  return result
}

/** Gateway reported a failure: keep the hold so the guest can retry. */
export async function failOnlinePayment(orderId: string, reason: string) {
  const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: orderId } })
  if (!payment || payment.status !== 'CREATED') return
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
    }),
    prisma.booking.updateMany({
      where: { id: payment.bookingId, paidAmount: 0, status: 'PENDING' },
      data: { paymentStatus: 'FAILED' },
    }),
  ])
}

function appendNote(existing: string | null, note: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return [existing, `[${stamp}] ${note}`].filter(Boolean).join('\n')
}
