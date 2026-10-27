import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { startSession, verifyPassword } from '@/lib/auth'
import { parseJson } from '@/lib/validation'
import { rateLimitAll, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(200),
})

// Compared against when the account doesn't exist, so a miss costs the same
// time as a wrong password and response timing doesn't reveal which emails exist.
const DUMMY_HASH = '$2b$12$9yH/78bah7W2WzV7ZSH/RORyEYQaCij2BaoatP5PVQgloBH0EjPz2'

export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response
  const { email, password } = parsed.data

  const rl = await rateLimitAll([
    { key: `login:ip:${clientIp(req)}`, limit: 20, windowSeconds: 15 * 60 },
    { key: `login:email:${email}`, limit: 8, windowSeconds: 15 * 60 },
  ])
  if (!rl.ok) return tooManyRequests(rl, 'Too many login attempts. Please wait a few minutes and try again.')

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    const isValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)

    if (!user || !user.passwordHash || !isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'This account has been deactivated' }, { status: 403 })
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        { error: 'Please verify your email before logging in', code: 'EMAIL_NOT_VERIFIED' },
        { status: 403 },
      )
    }

    const response = NextResponse.json(
      {
        message: 'Logged in successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isAdmin: user.isAdmin,
        },
      },
      { status: 200 },
    )
    if (!(await startSession(response, user))) {
      return NextResponse.json({ error: 'Login failed' }, { status: 500 })
    }
    return response
  } catch (error) {
    console.error('[login] error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
