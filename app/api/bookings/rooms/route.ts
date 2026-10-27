import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, isStaff } from '@/lib/auth'
import { resolveOrCreateGuest } from '@/lib/guests'
import { grantBookingAccess } from '@/lib/booking-access'
import { BookingError, createRoomBooking, ONLINE_HOLD_MINUTES } from '@/lib/booking-engine'
import { parseJson, roomBookingSchema } from '@/lib/validation'

/**
 * POST /api/bookings/rooms — public, self-service room booking (optionally
 * with a restaurant table add-on).
 *
 * Creates the booking as a short payment hold. It is NOT waiting for staff:
 * the guest is sent straight to payment (POST /api/payments/order) and the
 * booking confirms itself when the payment succeeds. The confirmation email
 * goes out at that point, not here.
 *
 * If a table was requested but none is free, the room is still booked and
 * `tableSkipped` says why.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, roomBookingSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    // Public guests can book without an account. Staff must use the audited
    // walk-in flow so the booking records the manager who created it.
    const user = await getCurrentUser()
    if (user && isStaff(user.role)) {
      return NextResponse.json({ error: 'Staff accounts book from the admin dashboard.' }, { status: 403 })
    }
    const guest = user ?? (await resolveOrCreateGuest({
      name: body.guestName,
      email: body.guestEmail,
      phone: body.guestPhone,
    }))

    const { booking, nights, computedTotal, quote, tableSkipped } = await createRoomBooking({
      roomId: body.roomId,
      userId: guest.id,
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate,
      guestCount: body.guestCount,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestPhone: body.guestPhone,
      specialRequest: body.specialRequest,
      addOns: body.addOns,
      table: body.table ? { ...body.table, required: false } : null,
      transfer: body.transfer,
      source: 'ONLINE',
      bookedById: null,
    })

    const response = NextResponse.json(
      {
        message: 'Booking held — complete payment to confirm it',
        booking: {
          id: booking.id,
          reference: booking.reference,
          type: booking.type,
          roomName: booking.room?.name ?? 'Unknown',
          roomNo: booking.room?.roomNo ?? 'N/A',
          tableNo: booking.table?.tableNo ?? null,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          bookingDate: booking.bookingDate,
          nights,
          guestCount: booking.guestCount,
          addOns: booking.addOns,
          roomAmount: booking.roomAmount,
          tableAmount: booking.tableAmount,
          addOnsAmount: booking.addOnsAmount,
          taxAmount: booking.taxAmount,
          totalPrice: booking.totalPrice,
          advanceAmount: booking.advanceAmount,
          remainingAmount: booking.remainingAmount,
          paymentRule: booking.paymentRule,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          holdExpiresAt: booking.holdExpiresAt,
        },
        quote,
        tableSkipped,
        // The room is held only this long before it is released to others.
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
    console.error('[bookings/rooms] POST error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}
