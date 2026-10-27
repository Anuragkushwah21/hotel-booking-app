import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

/** GET /api/auth/me — the signed-in user, or null (expired, deactivated, signed out). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.role === 'ADMIN',
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
