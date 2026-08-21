import { NextRequest, NextResponse } from 'next/server'
import { BookingError, TABLE_SLOT_HOURS, findAvailableTables } from '@/lib/booking-engine'

/**
 * POST /api/tables/available — which tables are free for a date + time.
 *
 * Mirrors /api/rooms/available so both booking forms can answer "is this
 * actually bookable?" the moment the guest picks a slot, instead of finding out
 * when the booking is rejected.
 */
export async function POST(req: NextRequest) {
  try {
    const { date, time, guestCount, excludeBookingId } = await req.json()

    if (!date || !time) {
      return NextResponse.json({ error: 'Date and time are required' }, { status: 400 })
    }

    const seats = Math.max(1, Number(guestCount) || 1)
    const { slotStart, slotEnd, tables } = await findAvailableTables(date, time, seats, {
      excludeBookingId,
    })

    return NextResponse.json({
      available: tables.length > 0,
      slotHours: TABLE_SLOT_HOURS,
      slotStart: slotStart.toISOString(),
      slotEnd: slotEnd.toISOString(),
      tables,
      message: tables.length
        ? `${tables.length} table${tables.length === 1 ? '' : 's'} free for ${seats} ${
            seats === 1 ? 'guest' : 'guests'
          } at this time`
        : 'No table free for that many guests at this time — try another slot',
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[tables/available] POST error:', error)
    return NextResponse.json({ error: 'Could not check table availability' }, { status: 500 })
  }
}
