import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getSessionByToken } from '@/lib/auth'

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
        type: 'ROOM',
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
export async function DELETE(
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

    console.log('📥 User cancel booking request:', id)

    // Get current booking
    const booking = await prisma.booking.findUnique({
      where: { 
        id,
        type: 'ROOM',
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            roomNo: true,
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

    // ✅ Only the user who created the booking can cancel it
    if (booking.userId !== session.userId) {
      return NextResponse.json(
        { error: 'You can only cancel your own bookings' },
        { status: 403 }
      )
    }

    // ✅ Check if already cancelled
    if (booking.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Booking is already cancelled' },
        { status: 400 }
      )
    }

    // ✅ Cannot cancel if checked-in
    if (booking.status === 'CHECKED_IN') {
      return NextResponse.json(
        { error: 'Cannot cancel a booking that is already checked-in. Please contact support.' },
        { status: 400 }
      )
    }

    // ✅ Cannot cancel if checked-out
    if (booking.status === 'CHECKED_OUT') {
      return NextResponse.json(
        { error: 'Cannot cancel a completed booking' },
        { status: 400 }
      )
    }

    // ✅ Cancellation policy - 24 hours before check-in
    if (booking.status === 'CONFIRMED' && booking.checkInDate) {
      const checkInDate = new Date(booking.checkInDate)
      const now = new Date()
      const hoursUntilCheckIn = (checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60)

      // Cannot cancel within 24 hours of check-in
      if (hoursUntilCheckIn < 24 && hoursUntilCheckIn > 0) {
        return NextResponse.json(
          { error: 'Cannot cancel booking within 24 hours of check-in. Please contact support.' },
          { status: 400 }
        )
      }

      // Cannot cancel if check-in date has passed
      if (hoursUntilCheckIn < 0) {
        return NextResponse.json(
          { error: 'Cannot cancel a past booking' },
          { status: 400 }
        )
      }
    }

    // ✅ Cancel the booking (soft delete)
    const cancelledBooking = await prisma.booking.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    })

    console.log('✅ Room booking cancelled by user:', cancelledBooking.id)

    return NextResponse.json(
      { 
        message: 'Room booking cancelled successfully',
        booking: {
          id: cancelledBooking.id,
          status: cancelledBooking.status,
          roomName: (booking as any).room?.name || 'N/A',
          roomNo: (booking as any).room?.roomNo || 'N/A',
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[bookings/room/id] DELETE error:', error)

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Room booking not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to cancel room booking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}