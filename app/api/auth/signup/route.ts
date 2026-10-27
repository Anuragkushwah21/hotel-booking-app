// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { createAndSendEmailOtp } from '@/lib/email'
import { parseJson } from '@/lib/validation'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
  name: z.string().trim().max(120).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response
  const { email, password, name } = parsed.data

  const rl = await rateLimit(`signup:ip:${clientIp(req)}`, 10, 60 * 60)
  if (!rl.ok) return tooManyRequests(rl)

  try {
    // A guest who booked without an account already has a passwordless GUEST
    // record. Completing signup should claim that record, not block them from
    // creating an account or detach their booking history.
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser && (existingUser.passwordHash || existingUser.role !== 'GUEST')) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 },
      )
    }

    // Create a normal guest, or add credentials to the passwordless guest.
    // The record stays unverified until the OTP proves the email is theirs, so
    // claiming someone else's guest record gets nowhere.
    const passwordHash = await hashPassword(password)

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: { name: existingUser.name ?? name, passwordHash, emailVerified: false },
        })
      : await prisma.user.create({
          data: {
            email,
            name: name || null,
            passwordHash,
            role: 'GUEST',
            status: 'ACTIVE',
            isAdmin: false,
            emailVerified: false,
          },
        })

    const result = await createAndSendEmailOtp(email, name)

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Account created but we could not send the verification code. Use “Resend code” to try again.',
        },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        message: 'User created, OTP sent',
        userId: user.id,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[signup] error:', error)
    return NextResponse.json(
      { error: 'Signup failed' },
      { status: 500 },
    )
  }
}
