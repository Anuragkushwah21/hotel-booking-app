import { NextResponse } from 'next/server'
import { ADD_ONS, addOnUnitLabel, TABLE_PRICE_PER_GUEST } from '@/lib/booking-engine'
import { HOTEL } from '@/lib/hotel'

/**
 * GET /api/services — public catalogue.
 *
 * `bookable` items come straight from the booking engine, so the prices a
 * guest sees are the ones the server will actually charge. `included` items
 * are the free facilities from the hotel profile.
 */
export async function GET() {
  return NextResponse.json({
    bookable: ADD_ONS.map((a) => ({
      code: a.code,
      label: a.label,
      description: a.description,
      icon: a.icon,
      price: a.price,
      per: a.per,
      unitLabel: addOnUnitLabel(a.per),
    })),
    included: HOTEL.facilities,
    dining: { ...HOTEL.dining, pricePerGuest: TABLE_PRICE_PER_GUEST },
  })
}
