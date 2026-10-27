import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createPasswordToken, RESET_TTL_MS } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { parseJson } from '@/lib/validation'
import { rateLimitAll, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

const schema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') })

const GENERIC = 'If an account exists for that email, we have sent a link to reset the password.'

/** POST /api/auth/forgot-password { email } — always the same answer. */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response
  const { email } = parsed.data

  const rl = await rateLimitAll([
    { key: `forgot:ip:${clientIp(req)}`, limit: 10, windowSeconds: 60 * 60 },
    { key: `forgot:email:${email}`, limit: 3, windowSeconds: 60 * 60 },
  ])
  if (!rl.ok) return tooManyRequests(rl)

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (user && user.status === 'ACTIVE' && user.passwordHash) {
      const token = await createPasswordToken(email, RESET_TTL_MS)
      await sendPasswordResetEmail(email, user.name, token, 'RESET')
    }
    return NextResponse.json({ success: true, message: GENERIC })
  } catch (error) {
    console.error('[forgot-password] error:', error)
    return NextResponse.json({ error: 'Could not process the request' }, { status: 500 })
  }
}
