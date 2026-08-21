import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, code } = body

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 },
      )
    }

    const now = new Date()

    const otpRecord = await prisma.oTPCode.findFirst({
      where: {
        email,
        code,
        expiresAt: { gt: now },
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 400 },
      )
    }

    await prisma.oTPCode.update({
      where: { id: otpRecord.id },
      data: {
        verifiedAt: now,
        attempts: { increment: 1 },
      },
    })

    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    })

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