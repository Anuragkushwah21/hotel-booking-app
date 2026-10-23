import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getSessionByToken } from '@/lib/auth'
import { BookingError } from '@/lib/booking-engine'
import { cancelBooking } from '@/lib/cancellation'
import { dispatchNotifications, notifySafely } from '@/lib/notifications'

// ✅ GET single room booking (for user to view their booking)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const session = await getSessionByToken(token)
    if (!session) {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      )
    }

    const { roomId: id } = await params

    const booking = await prisma.booking.findUnique({
      where: { 
        id,
        type: { in: ['ROOM', 'ROOM_TABLE'] },
      },
      include: {
        room: {
          select: {
            id: true,
            roomNo: true,
            name: true,
            price: true,
            acType: true,
            capacity: true,
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Room booking not found' },
        { status: 404 }
      )
    }

    // ✅ Only owner or admin can view
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })

    if (booking.userId !== session.userId && user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        booking: {
          id: booking.id,
          type: booking.type,
          roomName: (booking as any).room?.name || 'N/A',
          roomNo: (booking as any).room?.roomNo || 'N/A',
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          guestPhone: booking.guestPhone,
          guestCount: booking.guestCount,
          specialRequest: booking.specialRequest,
          totalPrice: booking.totalPrice,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          createdAt: booking.createdAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[bookings/room/id] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch room booking' },
      { status: 500 }
    )
  }
}

// ✅ DELETE/CANCEL room booking (ONLY FOR USERS - their own bookings)
/**
 * DELETE — guest cancels their own room booking.
 * Same policy and refund handling as POST /api/bookings/[id]/cancel.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const token = (await cookies()).get('session_token')?.value
  const session = token ? await getSessionByToken(token) : null
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { roomId: id } = await params
    const { booking, refund, notificationIds } = await cancelBooking({
      actor: 'GUEST',
      userId: session.userId,
      bookingId: id,
    })
    notifySafely(() => dispatchNotifications(notificationIds))

    return NextResponse.json({
      message: refund > 0
        ? `Booking cancelled. A refund of ₹${refund.toLocaleString('en-IN')} has been requested.`
        : 'Booking cancelled successfully',
      booking: { id: booking.id, status: booking.status, refundAmount: booking.refundAmount, refundStatus: booking.refundStatus },
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[bookings/room/id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
