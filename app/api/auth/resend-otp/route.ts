import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, getUserByEmail } from '@/lib/auth'
import { createAndSendEmailOtp } from '@/lib/email'
import { parseJson } from '@/lib/validation'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

const schema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') })

const GENERIC = 'If this email needs verifying, a new code has been sent.'

// POST /api/auth/resend-otp
export async function POST(request: NextRequest) {
  const parsed = await parseJson(request, schema)
  if (!parsed.ok) return parsed.response

  const rl = await rateLimit(`otp-resend:ip:${clientIp(request)}`, 10, 60 * 60)
  if (!rl.ok) return tooManyRequests(rl)

  try {
    const user = await getUserByEmail(parsed.data.email)

    // Same answer for unknown and already-verified emails, so this endpoint
    // can't be used to find out who has an account.
    if (!user || user.emailVerified) {
      return NextResponse.json({ success: true, message: GENERIC })
    }

    const result = await createAndSendEmailOtp(user.email, user.name)

    if (!result.success) {
      if (result.reason === 'COOLDOWN' || result.reason === 'TOO_MANY') {
        return NextResponse.json(
          {
            error:
              result.reason === 'COOLDOWN'
                ? `Please wait ${result.retryAfterSeconds}s before requesting another code.`
                : 'Too many codes requested. Please try again later.',
            retryAfterSeconds: result.retryAfterSeconds,
          },
          { status: 429 },
        )
      }
      return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: GENERIC })
  } catch (error) {
    console.error('[resend-otp] error:', error)
    return NextResponse.json({ error: 'Failed to resend verification code' }, { status: 500 })
  }
}

// GET /api/auth/resend-otp — verification status of the signed-in user.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    success: true,
    emailVerified: user.emailVerified,
    email: user.email,
  })
}
