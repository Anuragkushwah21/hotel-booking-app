import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJson } from '@/lib/validation'
import { lookupDestinations, parseLookupQuery } from '@/lib/booking-lookup'
import { sendBookingLookupOtp } from '@/lib/email'
import { OTP_RESEND_COOLDOWN_SECONDS } from '@/lib/otp'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { clientIp, maskEmail } from '@/lib/security'

/**
 * POST /api/bookings/lookup  { query }   — step 1 of the guest lookup.
 *
 * Accepts a booking number, email address or mobile number and emails a
 * 6-digit code to the address on the matching booking(s). It never returns
 * booking data: that only comes back from /api/bookings/lookup/verify once
 * the code is entered. See lib/booking-lookup.ts.
 */

const schema = z.object({
  // `bookingId` is the field name older forms used.
  query: z.string().trim().max(120).optional(),
  bookingId: z.string().trim().max(120).optional(),
})

const MESSAGE =
  'If we found a booking with those details, we have emailed a 6-digit code to the address on the booking.'

export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response
  const raw = parsed.data.query || parsed.data.bookingId || ''

  if (!raw) {
    return NextResponse.json(
      { error: 'Enter a booking number, email address, or mobile number.' },
      { status: 400 },
    )
  }

  const rl = await rateLimit(`lookup:ip:${clientIp(req)}`, 10, 10 * 60)
  if (!rl.ok) return tooManyRequests(rl, 'Too many lookups. Please wait a few minutes and try again.')

  const lookup = parseLookupQuery(raw)
  if (!lookup) {
    return NextResponse.json(
      { error: 'Enter a booking number (e.g. HB-7K4M2Q), an email address, or a mobile number.' },
      { status: 400 },
    )
  }

  try {
    const destinations = await lookupDestinations(lookup)
    if (destinations.length === 0) {
      return NextResponse.json({
        success: true,
        message: MESSAGE,
        destinationHint: null,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      })
    }

    const issued = await sendBookingLookupOtp(lookup.subject, destinations)
    if (!issued.ok && issued.reason === 'TOO_MANY') {
      return NextResponse.json(
        { error: 'Too many codes requested. Please try again later.', retryAfterSeconds: issued.retryAfterSeconds },
        { status: 429 },
      )
    }

    return NextResponse.json({
      success: true,
      message: MESSAGE,
      destinationHint: destinations.map(maskEmail).join(', '),
      // On a cooldown the previous code is still valid; just say when a new one can be sent.
      resendAfterSeconds: issued.ok ? OTP_RESEND_COOLDOWN_SECONDS : issued.retryAfterSeconds,
    })
  } catch (error) {
    console.error('[bookings/lookup] POST error:', error)
    return NextResponse.json({ error: 'Failed to look up booking' }, { status: 500 })
  }
}
