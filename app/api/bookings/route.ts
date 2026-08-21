import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireGuestAccount } from '@/lib/auth'
import { BookingError, createRoomBooking } from '@/lib/booking-engine'
import { notifySafely, sendBookingConfirmation } from '@/lib/notifications'

/**
 * GET /api/bookings — the signed-in guest's own bookings.
 * (Same data as /api/bookings/me, kept for the older clients that call this.)
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    // Same rule as /api/bookings/me: walk-ins are front-desk records, not
    // part of the guest's own booking list.
    const bookings = await prisma.booking.findMany({
      where: { userId: auth.user.id, source: 'ONLINE' },
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { id: true, name: true, roomNo: true, type: true, price: true } },
        table: { select: { id: true, tableNo: true, location: true } },
      },
    })

    return NextResponse.json({ success: true, data: bookings })
  } catch (error) {
    console.error('[bookings] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}

/**
 * POST /api/bookings — legacy room-booking entry point.
 *
 * Previously wrote `paymentStatus: 'pending'` and omitted the required `type`
 * field, so every call failed. It now delegates to the shared engine.
 * Prefer POST /api/bookings/rooms for new work.
 */
export async function POST(req: NextRequest) {
  // Staff book through the dashboard's walk-in flow, never through here.
  const auth = await requireGuestAccount()
  if (!auth.ok) return auth.response

  try {
    const {
      roomId, checkInDate, checkOutDate, guestCount,
      guestName, guestEmail, guestPhone, specialRequests, addOns,
    } = await req.json()

    if (!roomId || !checkInDate || !checkOutDate || !guestName || !guestEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { booking } = await createRoomBooking({
      roomId,
      userId: auth.user.id,
      checkInDate,
      checkOutDate,
      guestCount,
      guestName,
      guestEmail,
      guestPhone,
      // old clients spell this "specialRequests"
      specialRequest: specialRequests,
      addOns,
      source: 'ONLINE',
      bookedById: null,
    })

    notifySafely(() => sendBookingConfirmation(booking as any))

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      totalPrice: booking.totalPrice,
      message: 'Booking created successfully',
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings] POST error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
