import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getSessionByToken } from '@/lib/auth'

// ✅ GET single table booking
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tableId: string }> }
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

    const { tableId: id } = await params

    const booking = await prisma.booking.findUnique({
      where: { 
        id,
        type: 'TABLE',
      },
      include: {
        table: {
          select: {
            id: true,
            tableNo: true,
            capacity: true,
            location: true,
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Table booking not found' },
        { status: 404 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })

    if (booking.userId !== session.userId && user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    return NextResponse.json({ booking }, { status: 200 })
  } catch (error) {
    console.error('[bookings/table/id] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch table booking' },
      { status: 500 }
    )
  }
}

// ✅ DELETE/CANCEL table booking (ONLY FOR USERS)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tableId: string }> }
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

    const { tableId: id } = await params

    console.log('📥 User cancel table booking request:', id)

    // Get current booking
    const booking = await prisma.booking.findUnique({
      where: { 
        id,
        type: 'TABLE',
      },
      include: {
        table: {
          select: {
            id: true,
            tableNo: true,
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Table booking not found' },
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

    // Check if already cancelled
    if (booking.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Booking is already cancelled' },
        { status: 400 }
      )
    }

    // Cannot cancel if checked-in
    if (booking.status === 'CHECKED_IN') {
      return NextResponse.json(
        { error: 'Cannot cancel a booking that is already checked-in' },
        { status: 400 }
      )
    }

    // Cannot cancel if checked-out
    if (booking.status === 'CHECKED_OUT') {
      return NextResponse.json(
        { error: 'Cannot cancel a completed booking' },
        { status: 400 }
      )
    }

    // ✅ Cancellation policy - 2 hours before booking time
    if (booking.status === 'CONFIRMED' && booking.bookingDate) {
      const bookingDateTime = new Date(booking.bookingDate)
      const now = new Date()
      const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)

      // Cannot cancel within 2 hours of booking time
      if (hoursUntilBooking < 2 && hoursUntilBooking > 0) {
        return NextResponse.json(
          { error: 'Cannot cancel table booking within 2 hours of reservation time. Please contact support.' },
          { status: 400 }
        )
      }

      // Cannot cancel if booking time has passed
      if (hoursUntilBooking < 0) {
        return NextResponse.json(
          { error: 'Cannot cancel a past booking' },
          { status: 400 }
        )
      }
    }

    // Cancel the booking
    const cancelledBooking = await prisma.booking.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    })

    console.log('✅ Table booking cancelled by user:', cancelledBooking.id)

    return NextResponse.json(
      { 
        message: 'Table booking cancelled successfully',
        booking: {
          id: cancelledBooking.id,
          status: cancelledBooking.status,
          tableNo: (booking as any).table?.tableNo || 'N/A',
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[bookings/table/id] DELETE error:', error)

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Table booking not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to cancel table booking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}