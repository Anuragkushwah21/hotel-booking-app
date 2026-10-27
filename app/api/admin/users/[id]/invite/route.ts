import { NextRequest, NextResponse } from 'next/server'
import { createPasswordToken, INVITE_TTL_MS, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'

/** POST /api/admin/users/[id]/invite — re-send the "set your password" link (ADMIN). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const rl = await rateLimit(`invite:user:${id}`, 5, 60 * 60)
  if (!rl.ok) return tooManyRequests(rl)

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || user.role === 'GUEST') return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  if (user.status !== 'ACTIVE') return NextResponse.json({ error: 'Reactivate the account first' }, { status: 409 })

  const token = await createPasswordToken(user.email, INVITE_TTL_MS)
  const sent = await sendPasswordResetEmail(user.email, user.name, token, 'INVITE')
  if (!sent) return NextResponse.json({ error: 'The invitation email could not be sent' }, { status: 502 })
  return NextResponse.json({ success: true, message: `Invitation re-sent to ${user.email}` })
}
