// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createAndSendEmailOtp } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const { password, name } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      )
    }

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

    // 2) Create a normal guest, or add credentials to the passwordless guest.
    const passwordHash = await bcrypt.hash(password, 10)

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: { name: existingUser.name ?? name, passwordHash, emailVerified: false },
        })
      : await prisma.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: 'GUEST',
            status: 'ACTIVE',
            isAdmin: false,
            emailVerified: false,
          },
        })

    // 3) generate OTP + save + send (all inside helper)
    const result = await createAndSendEmailOtp(email, name)

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'User created but failed to send verification code',
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
