import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, isStaff } from '@/lib/auth'
import { resolveOrCreateGuest } from '@/lib/guests'
import { grantBookingAccess } from '@/lib/booking-access'
import { BookingError, createTableBooking, ONLINE_HOLD_MINUTES } from '@/lib/booking-engine'
import { parseJson, tableBookingSchema } from '@/lib/validation'

/**
 * POST /api/bookings/tables — public, self-service table reservation.
 *
 * Same pattern as rooms: a short payment hold that confirms itself when the
 * payment succeeds (POST /api/payments/order → /api/payments/verify).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, tableBookingSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const user = await getCurrentUser()
    if (user && isStaff(user.role)) {
      return NextResponse.json({ error: 'Staff accounts book from the admin dashboard.' }, { status: 403 })
    }
    const guest = user ?? (await resolveOrCreateGuest({
      name: body.guestName,
      email: body.guestEmail,
      phone: body.guestPhone,
    }))

    const { booking, computedTotal, quote } = await createTableBooking({
      userId: guest.id,
      date: body.date,
      time: body.time,
      guestCount: body.guestCount,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestPhone: body.guestPhone,
      specialRequest: body.specialRequest,
      addOns: body.addOns,
      source: 'ONLINE',
      bookedById: null,
    })

    const response = NextResponse.json(
      {
        message: 'Table held — complete payment to confirm it',
        bookingId: booking.id,
        reference: booking.reference,
        booking: {
          id: booking.id,
          reference: booking.reference,
          type: booking.type,
          tableNo: booking.table?.tableNo ?? 'N/A',
          location: booking.table?.location ?? null,
          bookingDate: booking.bookingDate,
          guestCount: booking.guestCount,
          tableAmount: booking.tableAmount,
          taxAmount: booking.taxAmount,
          totalPrice: booking.totalPrice,
          advanceAmount: booking.advanceAmount,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          holdExpiresAt: booking.holdExpiresAt,
        },
        quote,
        holdMinutes: ONLINE_HOLD_MINUTES,
        computedTotal,
      },
      { status: 201 },
    )
    grantBookingAccess(response, booking.id)
    return response
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings/tables] POST error:', error)
    return NextResponse.json({ error: 'Failed to create table booking' }, { status: 500 })
  }
}
