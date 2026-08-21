import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { getSessionByToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated', bookings: [] },
        { status: 401 },
      )
    }

    const session = await getSessionByToken(token)
    if (!session) {
      return NextResponse.json(
        { error: 'Session expired', bookings: [] },
        { status: 401 },
      )
    }

    console.log('✅ Fetching bookings for user:', session.userId)

    // Front-desk (WALK_IN) bookings deliberately stay out of "My Bookings":
    // they belong to the admin dashboard. The guest reaches them with their
    // booking number + email at /booking-status instead.
    const bookings = await prisma.booking.findMany({
      where: { userId: session.userId, source: 'ONLINE' },
      orderBy: { createdAt: 'desc' },
      include: {
        room: {
          select: {
            id: true,
            roomNo: true,
            name: true,
            price: true,
            acType: true,
          },
        },
        table: {
          select: {
            id: true,
            tableNo: true,
            location: true,
          },
        },
        review: {
          select: {
            id: true,
            rating: true,
            title: true,
            comment: true,
            createdAt: true,
          },
        },
      },
    })

    console.log('📥 Found bookings:', bookings.length)

    // ✅ Fix: Handle null dates and room
    const mapped = bookings.map(b => ({
      id: b.id,
      reference: b.reference,
      type: b.type,
      roomName: b.room?.name || 'N/A',
      roomNo: b.room?.roomNo || 'N/A',
      tableNo: b.table?.tableNo || null,
      checkInDate: b.checkInDate?.toISOString() || null,
      checkOutDate: b.checkOutDate?.toISOString() || null,
      bookingDate: b.bookingDate?.toISOString() || null,
      guestCount: b.guestCount,
      totalPrice: b.totalPrice || 0,
      status: b.status,
      paymentStatus: b.paymentStatus,
      guestName: b.guestName || 'N/A',
      guestEmail: b.guestEmail || 'N/A',
      guestPhone: b.guestPhone || null,
      specialRequest: b.specialRequest || null,
      checkedOutAt: b.checkedOutAt?.toISOString() || null,
      // Reviews open up only once the front desk has checked the guest out.
      canReview: b.status === 'CHECKED_OUT' && !b.review,
      review: b.review
        ? { ...b.review, createdAt: b.review.createdAt.toISOString() }
        : null,
      createdAt: b.createdAt.toISOString(),
    }))

    return NextResponse.json({ bookings: mapped }, { status: 200 })
  } catch (error: any) {
    console.error('[bookings/me] GET error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to load bookings', 
        bookings: [],
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 },
    )
  }
}
