/**
 * The guest-facing shape of a booking, shared by My Bookings, the booking
 * detail / confirmation page and the public booking-number lookup so all three
 * show the same numbers.
 */

import type { HotelSettings, Prisma } from '@prisma/client'
import { quoteRefund, serviceStart } from './cancellation'
import { PAYMENT_RULE_LABELS } from './pricing'

export const guestBookingInclude = {
  room: { select: { id: true, name: true, roomNo: true, type: true, acType: true, price: true, photos: true } },
  table: { select: { id: true, tableNo: true, location: true } },
  review: { select: { id: true, rating: true, title: true, comment: true, createdAt: true } },
} satisfies Prisma.BookingInclude

export type GuestBookingRow = Prisma.BookingGetPayload<{ include: typeof guestBookingInclude }>

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null

export function toGuestBookingView(
  b: GuestBookingRow,
  settings: Pick<HotelSettings, 'earlyCancelHours' | 'earlyRefundPercent' | 'lateCancelHours' | 'lateRefundPercent'>,
) {
  const now = new Date()
  const start = serviceStart(b)
  const holdLive = b.status === 'PENDING' && (!b.holdExpiresAt || b.holdExpiresAt > now)
  const confirmed = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status)
  const canCancel =
    (b.status === 'CONFIRMED' || b.status === 'PENDING') && (!start || start.getTime() > now.getTime())
  const refund = canCancel && b.paidAmount > 0 ? quoteRefund(b, settings, now) : null

  return {
    id: b.id,
    reference: b.reference,
    type: b.type,
    source: b.source,
    status: b.status,
    paymentStatus: b.paymentStatus,
    paymentMode: b.paymentMode,
    paymentRule: b.paymentRule,
    paymentRuleLabel:
      b.paymentRule && b.paymentRule in PAYMENT_RULE_LABELS
        ? PAYMENT_RULE_LABELS[b.paymentRule as keyof typeof PAYMENT_RULE_LABELS]
        : null,

    roomId: b.room?.id ?? null,
    roomName: b.room?.name ?? null,
    roomType: b.room?.type ?? null,
    roomPhoto: b.room?.photos?.[0] ?? null,
    // The number is only promised once the booking is confirmed.
    roomNo: confirmed ? (b.assignedRoomNo ?? b.room?.roomNo ?? null) : null,
    tableNo: b.table?.tableNo ?? null,
    tableLocation: b.table?.location ?? null,

    checkInDate: iso(b.checkInDate),
    checkOutDate: iso(b.checkOutDate),
    bookingDate: iso(b.bookingDate),
    guestCount: b.guestCount,
    tableGuestCount: b.tableGuestCount,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    specialRequest: b.specialRequest,
    addOns: b.addOns,

    roomAmount: b.roomAmount,
    tableAmount: b.tableAmount,
    addOnsAmount: b.addOnsAmount,
    taxAmount: b.taxAmount,
    totalPrice: b.totalPrice,
    advanceAmount: b.advanceAmount,
    paidAmount: b.paidAmount,
    remainingAmount: b.remainingAmount,

    refundAmount: b.refundAmount,
    refundStatus: b.refundStatus,
    refundNote: b.refundNote,
    cancelReason: b.cancelReason,

    holdExpiresAt: iso(b.holdExpiresAt),
    /** An unpaid online booking whose hold is still live — show "Complete payment". */
    awaitingPayment: b.source === 'ONLINE' && b.paidAmount === 0 && holdLive,
    canCancel,
    refundPreview: refund ? { amount: refund.amount, percent: refund.percent, message: refund.message } : null,

    confirmedAt: iso(b.confirmedAt),
    checkedInAt: iso(b.checkedInAt),
    checkedOutAt: iso(b.checkedOutAt),
    cancelledAt: iso(b.cancelledAt),
    createdAt: b.createdAt.toISOString(),

    // Reviews open up only once the front desk has checked the guest out.
    canReview: b.status === 'CHECKED_OUT' && !b.review,
    review: b.review ? { ...b.review, createdAt: b.review.createdAt.toISOString() } : null,
  }
}

export type GuestBookingView = ReturnType<typeof toGuestBookingView>
