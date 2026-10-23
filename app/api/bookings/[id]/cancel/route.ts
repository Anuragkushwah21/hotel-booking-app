import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasBookingAccess } from '@/lib/booking-access'
import { BookingError } from '@/lib/booking-engine'
import { cancelBooking } from '@/lib/cancellation'
import { dispatchNotifications, notifySafely } from '@/lib/notifications'
import { cancelSchema, parseJson } from '@/lib/validation'

/**
 * POST /api/bookings/[id]/cancel  { reason? }
 *
 * Guest cancels their own booking. The refund follows the configured policy
 * (Admin → Settings) and is created as REFUND_PENDING for staff to process.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, cancelSchema)
  if (!parsed.ok) return parsed.response

  try {
    const { id } = await params
    const bookingOwner = await prisma.booking.findUnique({ where: { id }, select: { userId: true } })
    const user = await getCurrentUser()
    const ownsBooking = user?.id === bookingOwner?.userId
    if (!bookingOwner || (!ownsBooking && !hasBookingAccess(req, id))) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { booking, refund, quote, notificationIds } = await cancelBooking({
      actor: 'GUEST',
      userId: bookingOwner.userId,
      bookingId: id,
      reason: parsed.data.reason,
    })
    notifySafely(() => dispatchNotifications(notificationIds))

    return NextResponse.json({
      success: true,
      message:
        refund > 0
          ? `Booking cancelled. A refund of ₹${refund.toLocaleString('en-IN')} has been requested.`
          : 'Booking cancelled.',
      booking: {
        id: booking.id,
        status: booking.status,
        refundAmount: booking.refundAmount,
        refundStatus: booking.refundStatus,
      },
      policy: quote.message,
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings/id/cancel] POST error:', error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
