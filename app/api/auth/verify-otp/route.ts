import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyEmailOtp } from '@/lib/email'
import { otpErrorMessage } from '@/lib/otp'
import { parseJson } from '@/lib/validation'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response

  // Per-code attempts are limited in lib/otp.ts; this caps guessing across
  // many accounts from one client.
  const rl = await rateLimit(`otp-verify:ip:${clientIp(req)}`, 30, 15 * 60)
  if (!rl.ok) return tooManyRequests(rl)

  try {
    const result = await verifyEmailOtp(parsed.data.email, parsed.data.code)
    if (!result.ok) {
      return NextResponse.json(
        { error: otpErrorMessage(result), attemptsLeft: result.attemptsLeft },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { message: 'Email verified successfully' },
      { status: 200 },
    )
  } catch (error) {
    console.error('[verify-otp] error:', error)
    return NextResponse.json(
      { error: 'OTP verification failed' },
      { status: 500 },
    )
  }
}
