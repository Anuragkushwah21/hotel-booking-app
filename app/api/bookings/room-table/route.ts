import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, isStaff } from '@/lib/auth'
import { resolveOrCreateGuest } from '@/lib/guests'
import { grantBookingAccess } from '@/lib/booking-access'
import { BookingError, createRoomBooking, ONLINE_HOLD_MINUTES } from '@/lib/booking-engine'
import { guestDetails, parseJson, dateString, timeString } from '@/lib/validation'
import { z } from 'zod'

/**
 * POST /api/bookings/room-table — book a room and a restaurant table together.
 *
 * Now produces ONE booking (type ROOM_TABLE) with one reference, one payment
 * and one invoice, created atomically in the engine. The table is an add-on:
 * if none is free the room is still booked and `tableSkipped` explains why.
 *
 * Kept for older clients; the room page posts the same thing to
 * /api/bookings/rooms with a `table` object.
 */
const schema = z.object({
  roomId: z.string().min(1),
  checkInDate: dateString,
  checkOutDate: dateString,
  roomGuestCount: z.coerce.number().int().min(1).max(20),
  tableDate: dateString,
  tableTime: timeString,
  tableGuestCount: z.coerce.number().int().min(1).max(50).optional(),
  addOns: z.array(z.string()).optional().default([]),
  ...guestDetails,
})

export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
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

    const { booking, nights, quote, tableSkipped } = await createRoomBooking({
      userId: guest.id,
      roomId: body.roomId,
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate,
      guestCount: body.roomGuestCount,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestPhone: body.guestPhone,
      specialRequest: body.specialRequest,
      addOns: body.addOns,
      table: {
        date: body.tableDate,
        time: body.tableTime,
        guestCount: body.tableGuestCount ?? body.roomGuestCount,
        required: false,
      },
      source: 'ONLINE',
      bookedById: null,
    })

    const response = NextResponse.json(
      {
        bookingId: booking.id,
        reference: booking.reference,
        type: booking.type,
        roomAmount: booking.roomAmount,
        tableAmount: booking.tableAmount,
        taxAmount: booking.taxAmount,
        totalAmount: booking.totalPrice,
        advanceAmount: booking.advanceAmount,
        nights,
        quote,
        tableSkipped,
        holdMinutes: ONLINE_HOLD_MINUTES,
      },
      { status: 201 },
    )
    grantBookingAccess(response, booking.id)
    return response
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings/room-table] POST error:', error)
    return NextResponse.json({ error: 'Failed to create combined booking' }, { status: 500 })
  }
}
