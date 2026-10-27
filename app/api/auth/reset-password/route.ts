import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { consumePasswordToken, hashPassword, MIN_PASSWORD_LENGTH, revokeUserSessions } from '@/lib/auth'
import { parseJson } from '@/lib/validation'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
})

/**
 * POST /api/auth/reset-password { token, password }
 *
 * Used for both "forgot password" links and staff invites. Following the link
 * proves control of the inbox, so it also marks the email verified. Every
 * existing session is revoked.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response

  const rl = await rateLimit(`reset:ip:${clientIp(req)}`, 20, 60 * 60)
  if (!rl.ok) return tooManyRequests(rl)

  try {
    const email = await consumePasswordToken(parsed.data.token)
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'This link is invalid or has expired. Please request a new one.' },
        { status: 400 },
      )
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.password), emailVerified: true },
    })
    await revokeUserSessions(user.id)

    return NextResponse.json({ success: true, message: 'Your password has been set. You can now log in.' })
  } catch (error) {
    console.error('[reset-password] error:', error)
    return NextResponse.json({ error: 'Could not reset the password' }, { status: 500 })
  }
}
