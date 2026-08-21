import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getSessionByToken } from '@/lib/auth'

// ✅ ADMIN: Update booking status
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

    // ✅ Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true },
    })

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { status, paymentStatus } = body

    console.log('📥 Admin update booking:', { id, status, paymentStatus })

    // Validate status
    const validStatuses = ['PENDING', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Valid values: ' + validStatuses.join(', ') },
        { status: 400 }
      )
    }

    // Validate payment status
    const validPaymentStatuses = ['PENDING', 'PAID', 'FAILED', 'REFUNDED']
    if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
      return NextResponse.json(
        { error: 'Invalid payment status. Valid values: ' + validPaymentStatuses.join(', ') },
        { status: 400 }
      )
    }

    // Get current booking
    const currentBooking = await prisma.booking.findUnique({
      where: { id },
    })

    if (!currentBooking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = { updatedAt: new Date() }
    if (status) updateData.status = status
    if (paymentStatus) updateData.paymentStatus = paymentStatus

    // Update booking
    const booking = await prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        room: {
          select: {
            id: true,
            roomNo: true,
            name: true,
          },
        },
        table: {
          select: {
            id: true,
            tableNo: true,
          },
        },
      },
    })

    console.log('✅ Booking updated by admin:', booking.id)

    return NextResponse.json(
      {
        message: 'Booking updated successfully',
        booking: {
          id: booking.id,
          type: booking.type,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          roomName: (booking as any).room?.name || null,
          roomNo: (booking as any).room?.roomNo || null,
          tableNo: (booking as any).table?.tableNo || null,
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[admin/bookings/id] PUT error:', error)

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to update booking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}

// ✅ ADMIN: Delete/Cancel booking
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    })

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    const { id } = await params

    console.log('📥 Admin delete booking:', id)

    const booking = await prisma.booking.findUnique({
      where: { id },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Soft delete - mark as cancelled
    await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    })

    console.log('✅ Booking cancelled by admin:', id)

    return NextResponse.json(
      { message: 'Booking cancelled successfully' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[admin/bookings/id] DELETE error:', error)

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to cancel booking' },
      { status: 500 }
    )
  }
}