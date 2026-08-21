import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail, getSessionByToken, getUserById } from '@/lib/auth'
import { createAndSendEmailOtp } from '@/lib/email'
import { cookies } from 'next/headers'

// POST /api/auth/resend-otp
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 },
      )
    }

    // Get user by email
    const user = await getUserByEmail(email)

    if (!user) {
      // Security: don't reveal whether email exists
      return NextResponse.json({
        success: true,
        message: 'If this email exists, a verification code has been sent.',
      })
    }

    // Already verified?
    if (user.emailVerified) {
      return NextResponse.json({
        success: false,
        message: 'This email is already verified',
      })
    }

    // Create new OTP and send email
    const result = await createAndSendEmailOtp(user.email, user.name)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to send verification code' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code has been sent. Please check your inbox.',
    })
  } catch (error) {
    console.error('[v0] Error resending verification code:', error)
    return NextResponse.json(
      { error: 'Failed to resend verification code' },
      { status: 500 },
    )
  }
}

// GET /api/auth/resend-otp
// Check current user's verification status (for logged-in users)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session_token')?.value

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const session = await getSessionByToken(sessionToken)
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const user = await getUserById(session.userId)

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      emailVerified: user.emailVerified,
      email: user.email,
    })
  } catch (error) {
    console.error('[v0] Error checking verification status:', error)
    return NextResponse.json(
      { error: 'Failed to check verification status' },
      { status: 500 },
    )
  }
}