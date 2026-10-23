import { NextRequest, NextResponse } from 'next/server'
import { BookingError, priceAddOns, quoteRoomBooking, validAddOnCodes } from '@/lib/booking-engine'
import { getHotelSettings } from '@/lib/settings'
import { quoteTableOnly } from '@/lib/pricing'
import { refundPolicyLines } from '@/lib/cancellation'
import { parseJson, quoteSchema } from '@/lib/validation'

/**
 * POST /api/quote — price breakdown and "pay now / pay at check-in" split.
 *
 *   { kind: 'ROOM', roomId, checkInDate, checkOutDate, guestCount, addOns?, table? }
 *   { kind: 'TABLE', guestCount }
 *
 * Public and read-only. Uses exactly the functions the booking engine uses,
 * so the figure shown on the page is the figure charged.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, quoteSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const settings = await getHotelSettings()
    const policy = refundPolicyLines(settings)

    if (body.kind === 'TABLE') {
      return NextResponse.json({ quote: quoteTableOnly(body.guestCount, 0, settings), policy })
    }

    const { room, nights, availability, table, quote } = await quoteRoomBooking({
      roomId: body.roomId,
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate,
      guestCount: body.guestCount,
      addOns: body.addOns,
      table: body.table ?? null,
    })

    return NextResponse.json({
      room: { id: room.id, name: room.name, roomNo: room.roomNo, capacity: room.capacity },
      nights,
      available: availability.available,
      unavailableReason: availability.reason ?? null,
      overCapacity: body.guestCount > room.capacity,
      table,
      quote,
      policy,
      addOnsAmount: priceAddOns(validAddOnCodes(body.addOns), nights, body.guestCount),
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[quote] POST error:', error)
    return NextResponse.json({ error: 'Failed to price this stay' }, { status: 500 })
  }
}
