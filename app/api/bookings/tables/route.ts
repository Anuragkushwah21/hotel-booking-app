import { NextRequest, NextResponse } from 'next/server'
import { requireGuestAccount } from '@/lib/auth'
import { BookingError, createTableBooking, ONLINE_HOLD_MINUTES } from '@/lib/booking-engine'
import { notifySafely, sendBookingConfirmation } from '@/lib/notifications'

/** POST /api/bookings/tables — public, self-service table reservation. */
export async function POST(req: NextRequest) {
  // Staff book through the dashboard's walk-in flow, never through here.
  const auth = await requireGuestAccount()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const { date, time, guestCount, guestName, guestEmail, guestPhone, specialRequest, addOns } = body

    if (!date || !time || !guestCount || !guestName || !guestEmail) {
      return NextResponse.json(
        { error: 'Date, time, guests, name and email are required' },
        { status: 400 },
      )
    }

    const { booking, computedTotal } = await createTableBooking({
      userId: auth.user.id,
      date,
      time,
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
        message: 'Table booking created successfully',
        bookingId: booking.id,
        reference: booking.reference,
        booking: {
          id: booking.id,
          reference: booking.reference,
          tableNo: booking.table?.tableNo ?? 'N/A',
          location: booking.table?.location ?? null,
          bookingDate: booking.bookingDate,
          guestCount: booking.guestCount,
          totalPrice: booking.totalPrice,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          holdExpiresAt: booking.holdExpiresAt,
        },
        holdMinutes: ONLINE_HOLD_MINUTES,
        computedTotal,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings/tables] POST error:', error)
    return NextResponse.json({ error: 'Failed to create table booking' }, { status: 500 })
  }
}
