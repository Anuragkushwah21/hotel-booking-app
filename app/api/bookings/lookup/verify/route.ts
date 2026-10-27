import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJson } from '@/lib/validation'
import { findLookupBookings, parseLookupQuery } from '@/lib/booking-lookup'
import { grantBookingAccess } from '@/lib/booking-access'
import { otpErrorMessage, verifyOtp } from '@/lib/otp'
import { getHotelSettings } from '@/lib/settings'
import { toGuestBookingView } from '@/lib/booking-view'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

/**
 * POST /api/bookings/lookup/verify  { query, code }  — step 2 of the guest lookup.
 *
 * Checks the emailed code and only then returns the bookings. It also sets a
 * signed per-booking access cookie for each one, so cancelling, paying and the
 * invoice work afterwards without an account.
 */

const schema = z.object({
  query: z.string().trim().min(1).max(120),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response

  const rl = await rateLimit(`lookup-verify:ip:${clientIp(req)}`, 20, 15 * 60)
  if (!rl.ok) return tooManyRequests(rl)

  const lookup = parseLookupQuery(parsed.data.query)
  if (!lookup) return NextResponse.json({ error: 'Invalid lookup details' }, { status: 400 })

  try {
    const result = await verifyOtp({ purpose: 'BOOKING_LOOKUP', subject: lookup.subject, code: parsed.data.code })
    if (!result.ok) {
      return NextResponse.json(
        { error: otpErrorMessage(result), attemptsLeft: result.attemptsLeft },
        { status: result.reason === 'LOCKED' ? 429 : 400 },
      )
    }

    const [bookings, settings] = await Promise.all([findLookupBookings(lookup), getHotelSettings()])
    const response = NextResponse.json(
      {
        success: true,
        bookings: bookings.map((b) => ({ ...toGuestBookingView(b, settings), baseAmount: b.baseAmount })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    for (const b of bookings) grantBookingAccess(response, b.id)
    return response
  } catch (error) {
    console.error('[bookings/lookup/verify] POST error:', error)
    return NextResponse.json({ error: 'Failed to verify the code' }, { status: 500 })
  }
}
