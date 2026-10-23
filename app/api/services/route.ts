import { NextResponse } from 'next/server'
import { ADD_ONS, addOnUnitLabel } from '@/lib/booking-engine'
import { getHotelSettings } from '@/lib/settings'
import { HOTEL } from '@/lib/hotel'

/**
 * GET /api/services — public catalogue.
 *
 * `bookable` items come straight from the booking engine, so the prices a
 * guest sees are the ones the server will actually charge. `included` items
 * are the free facilities from the hotel profile. The table price comes from
 * Admin → Settings.
 */
export async function GET() {
  const settings = await getHotelSettings()
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
    dining: { ...HOTEL.dining, pricePerGuest: settings.tablePricePerGuest },
  })
}
