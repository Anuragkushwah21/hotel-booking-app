import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasBookingAccess } from '@/lib/booking-access'
import { BookingError } from '@/lib/booking-engine'
import { PaymentGatewayError } from '@/lib/payment-gateway'
import { startOnlinePayment } from '@/lib/payment-confirmation'
import { paymentOrderSchema, parseJson } from '@/lib/validation'

/**
 * POST /api/payments/order  { bookingId }
 *
 * Opens a gateway order for the amount the booking's payment rule requires
 * (computed server-side when the booking was created — the browser never
 * sends an amount). Returns what the checkout widget needs.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, paymentOrderSchema)
  if (!parsed.ok) return parsed.response

  try {
    const bookingOwner = await prisma.booking.findUnique({
      where: { id: parsed.data.bookingId },
      select: { userId: true },
    })
    const user = await getCurrentUser()
    const ownsBooking = user?.id === bookingOwner?.userId
    if (!bookingOwner || (!ownsBooking && !hasBookingAccess(req, parsed.data.bookingId))) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { booking, order, amount } = await startOnlinePayment(parsed.data.bookingId)
    return NextResponse.json({
      gateway: order.gateway,
      orderId: order.orderId,
      amount,
      amountPaise: order.amountPaise,
      currency: order.currency,
      keyId: order.keyId,
      booking: {
        id: booking.id,
        reference: booking.reference,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        guestPhone: booking.guestPhone,
        totalPrice: booking.totalPrice,
      },
      hotelName: process.env.NEXT_PUBLIC_APP_NAME || 'HotelBook',
    })
  } catch (error) {
    if (error instanceof BookingError || error instanceof PaymentGatewayError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[payments/order] POST error:', error)
    return NextResponse.json({ error: 'Could not start payment' }, { status: 500 })
  }
}
