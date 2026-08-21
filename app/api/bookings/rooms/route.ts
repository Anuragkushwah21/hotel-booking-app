import { NextRequest, NextResponse } from 'next/server'
import { requireGuestAccount } from '@/lib/auth'
import { BookingError, createRoomBooking, ONLINE_HOLD_MINUTES } from '@/lib/booking-engine'
import { notifySafely, sendBookingConfirmation } from '@/lib/notifications'

/**
 * POST /api/bookings/rooms — public, self-service room booking.
 *
 * Goes through the same engine as the admin walk-in route, so online and
 * walk-in bookings contend for one inventory. Price is computed server-side;
 * anything the client sends about money is ignored.
 */
export async function POST(req: NextRequest) {
  // Staff book through the dashboard's walk-in flow, never through here.
  const auth = await requireGuestAccount()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const {
      roomId,
      checkInDate,
      checkOutDate,
      guestCount,
      guestName,
      guestEmail,
      guestPhone,
      specialRequest,
      addOns,
    } = body

    if (!roomId || !checkInDate || !checkOutDate || !guestName || !guestEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { booking, nights, computedTotal } = await createRoomBooking({
      roomId,
      userId: auth.user.id,
      checkInDate,
      checkOutDate,
      guestCount,
      guestName,
      guestEmail,
      guestPhone,
      specialRequest,
      addOns,
      source: 'ONLINE',
      bookedById: null,
    })

    notifySafely(() => sendBookingConfirmation(booking as any))

    return NextResponse.json(
      {
        message: 'Booking created successfully',
        booking: {
          id: booking.id,
          reference: booking.reference,
          roomName: booking.room?.name ?? 'Unknown',
          roomNo: booking.room?.roomNo ?? 'N/A',
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          nights,
          guestCount: booking.guestCount,
          addOns: booking.addOns,
          baseAmount: booking.baseAmount,
          addOnsAmount: booking.addOnsAmount,
          totalPrice: booking.totalPrice,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          holdExpiresAt: booking.holdExpiresAt,
        },
        // The room is held only this long before it is released to others.
        holdMinutes: ONLINE_HOLD_MINUTES,
        computedTotal,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings/rooms] POST error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
