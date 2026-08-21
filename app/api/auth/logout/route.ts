import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session_token')?.value

    if (sessionToken) {
      await deleteSession(sessionToken)
    }

    cookieStore.delete('session_token')

    return NextResponse.json({
      message: 'Logged out successfully',
    })
  } catch (error) {
    console.error('[v0] Error logging out:', error)
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    )
  }
}
