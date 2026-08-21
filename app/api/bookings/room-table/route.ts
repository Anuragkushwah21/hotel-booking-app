import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireGuestAccount } from '@/lib/auth'
import { BookingError, createRoomBooking, createTableBooking } from '@/lib/booking-engine'
import { notifySafely, sendBookingConfirmation } from '@/lib/notifications'

/**
 * POST /api/bookings/room-table — book a room and a restaurant table together.
 *
 * Produces two Booking rows (one ROOM, one TABLE) so both appear correctly in
 * inventory and reporting. The two engine calls each run their own
 * transaction, so if the table leg fails the room leg is compensated away —
 * a guest never ends up paying for half a package.
 */
export async function POST(req: NextRequest) {
  // Staff book through the dashboard's walk-in flow, never through here.
  const auth = await requireGuestAccount()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const {
      roomId, checkInDate, checkOutDate, roomGuestCount,
      tableDate, tableTime, tableGuestCount,
      guestName, guestEmail, guestPhone, specialRequest, addOns,
    } = body

    if (
      !roomId || !checkInDate || !checkOutDate ||
      !tableDate || !tableTime ||
      !guestName?.trim() || !guestEmail?.trim()
    ) {
      return NextResponse.json(
        { error: 'Room, stay dates, table date & time, guest name and email are required' },
        { status: 400 },
      )
    }

    const shared = {
      userId: auth.user.id,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestPhone: guestPhone?.trim() || null,
      specialRequest: specialRequest?.trim() || null,
      source: 'ONLINE' as const,
      bookedById: null,
    }

    const roomResult = await createRoomBooking({
      ...shared,
      roomId,
      checkInDate,
      checkOutDate,
      guestCount: Number(roomGuestCount) || 1,
      addOns,
    })

    let tableResult
    try {
      tableResult = await createTableBooking({
        ...shared,
        date: tableDate,
        time: tableTime,
        guestCount: Number(tableGuestCount) || Number(roomGuestCount) || 1,
      })
    } catch (tableError) {
      // Compensate: release the room we just took.
      await prisma.booking
        .update({
          where: { id: roomResult.booking.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'Combined booking failed at the table step',
          },
        })
        .catch((e) => console.error('[room-table] compensation failed:', e))
      throw tableError
    }

    notifySafely(() => sendBookingConfirmation(roomResult.booking as any))
    notifySafely(() => sendBookingConfirmation(tableResult.booking as any))

    return NextResponse.json(
      {
        roomBookingId: roomResult.booking.id,
        tableBookingId: tableResult.booking.id,
        roomReference: roomResult.booking.reference,
        tableReference: tableResult.booking.reference,
        roomAmount: roomResult.booking.totalPrice,
        tableAmount: tableResult.booking.totalPrice,
        totalAmount: roomResult.booking.totalPrice + tableResult.booking.totalPrice,
        nights: roomResult.nights,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[bookings/room-table] POST error:', error)
    return NextResponse.json({ error: 'Failed to create combined booking' }, { status: 500 })
  }
}
