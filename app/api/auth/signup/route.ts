// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { createAndSendEmailOtp } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, name } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      )
    }

    // 1) check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 },
      )
    }

    // 2) create user
    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
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