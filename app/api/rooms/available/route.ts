import { NextRequest, NextResponse } from 'next/server'
import { BookingError, checkRoomAvailability, findAvailableRooms } from '@/lib/booking-engine'

/**
 * POST /api/rooms/available — live availability probe for one room.
 *
 * Uses the engine's half-open interval comparison, so a same-day
 * checkout/check-in is correctly treated as available. (The previous
 * implementation used lte/gte here and lt/gt in the booking route, which meant
 * this endpoint refused stays the booking endpoint would happily accept.)
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, checkInDate, checkOutDate, excludeBookingId } = await req.json()

    if (!roomId || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { error: 'Room ID, check-in date, and check-out date are required' },
        { status: 400 },
      )
    }

    const checkIn = new Date(checkInDate)
    const checkOut = new Date(checkOutDate)

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (checkIn >= checkOut) {
      return NextResponse.json(
        { error: 'Check-out date must be after check-in date' },
        { status: 400 },
      )
    }

    const result = await checkRoomAvailability(roomId, checkIn, checkOut, { excludeBookingId })

    return NextResponse.json({
      available: result.available,
      message: result.available
        ? 'Room is available for booking'
        : result.reason ?? 'Room is unavailable',
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[rooms/available] POST error:', error)
    return NextResponse.json({ error: 'Failed to check room availability' }, { status: 500 })
  }
}

/**
 * GET /api/rooms/available?checkIn=&checkOut=&guests= — every room free for a
 * date range.
 *
 * The POST above answers "is this one room free?", which only helps once a room
 * is already chosen. Booking forms need the other direction: the moment the
 * dates are known, show what can actually be booked.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const checkInParam = sp.get('checkIn')
    const checkOutParam = sp.get('checkOut')

    if (!checkInParam || !checkOutParam) {
      return NextResponse.json(
        { error: 'checkIn and checkOut are required' },
        { status: 400 },
      )
    }

    const checkIn = new Date(checkInParam)
    const checkOut = new Date(checkOutParam)

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (checkIn >= checkOut) {
      return NextResponse.json(
        { error: 'Check-out date must be after check-in date' },
        { status: 400 },
      )
    }

    const guests = Number(sp.get('guests'))
    const rooms = await findAvailableRooms(checkIn, checkOut, {
      ...(Number.isFinite(guests) && guests > 0 ? { minCapacity: guests } : {}),
      ...(sp.get('acType') ? { acType: sp.get('acType')! } : {}),
      ...(sp.get('type') ? { type: sp.get('type')! } : {}),
    })

    return NextResponse.json({
      available: rooms.length > 0,
      count: rooms.length,
      rooms: rooms.map((r) => ({
        id: r.id,
        roomNo: r.roomNo,
        name: r.name,
        type: r.type,
        acType: r.acType,
        capacity: r.capacity,
        price: r.price,
      })),
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[rooms/available] GET error:', error)
    return NextResponse.json({ error: 'Could not check availability' }, { status: 500 })
  }
}
