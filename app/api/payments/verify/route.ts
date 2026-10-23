import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { hasBookingAccess } from '@/lib/booking-access'
import { BookingError } from '@/lib/booking-engine'
import { verifyCheckoutSignature } from '@/lib/payment-gateway'
import { confirmOnlinePayment, failOnlinePayment } from '@/lib/payment-confirmation'
import { dispatchNotifications, notifySafely } from '@/lib/notifications'
import { parseJson, paymentVerifySchema } from '@/lib/validation'

/**
 * POST /api/payments/verify  { orderId, paymentId, signature }
 *
 * Called by the browser when the checkout widget reports success. The
 * signature proves the gateway issued this payment for this order; once it
 * checks out the booking is CONFIRMED automatically — no admin step.
 *
 * The webhook does the same thing server-to-server, so a guest who closes the
 * tab mid-redirect still ends up confirmed. Whichever arrives second is a no-op.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, paymentVerifySchema)
  if (!parsed.ok) return parsed.response
  const { orderId, paymentId, signature } = parsed.data

  const payment = await prisma.payment.findUnique({
    where: { gatewayOrderId: orderId },
    include: { booking: { select: { userId: true } } },
  })
  const user = await getCurrentUser()
  const ownsBooking = user?.id === payment?.booking.userId
  if (!payment || (!ownsBooking && !hasBookingAccess(req, payment.bookingId))) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (!verifyCheckoutSignature({ gateway: payment.gateway, orderId, paymentId, signature })) {
    await failOnlinePayment(orderId, 'Signature verification failed')
    return NextResponse.json({ error: 'Payment could not be verified' }, { status: 400 })
  }

  try {
    const { outcome, booking, notificationIds } = await confirmOnlinePayment({ orderId, paymentId })
    notifySafely(() => dispatchNotifications(notificationIds))

    return NextResponse.json({
      outcome,
      booking: {
        id: booking.id,
        reference: booking.reference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paidAmount: booking.paidAmount,
        remainingAmount: booking.remainingAmount,
        roomNo: booking.assignedRoomNo,
        refundAmount: booking.refundAmount,
      },
      message:
        outcome === 'INVENTORY_LOST'
          ? 'Your payment arrived after the hold expired and the room was taken. A full refund is on its way.'
          : 'Payment successful — your booking is confirmed.',
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[payments/verify] POST error:', error)
    return NextResponse.json({ error: 'Payment received but confirmation failed — we will retry automatically.' }, { status: 500 })
  }
}
