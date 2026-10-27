import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, revokeUserSessions } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson } from '@/lib/validation'
import { prisma } from '@/lib/prisma'

/** GET /api/admin/users/[id] — profile plus full booking history (ADMIN). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, phone: true, role: true, status: true,
      emailVerified: true, createdAt: true,
      bookings: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, reference: true, type: true, source: true, status: true, paymentStatus: true,
          refundStatus: true, checkInDate: true, checkOutDate: true, bookingDate: true,
          totalPrice: true, paidAmount: true, remainingAmount: true, refundAmount: true, createdAt: true,
          room: { select: { name: true, roomNo: true } },
          table: { select: { tableNo: true } },
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const live = user.bookings.filter((b) => b.status !== 'CANCELLED')
  return NextResponse.json({
    user,
    summary: {
      bookings: user.bookings.length,
      totalPaid: user.bookings.reduce((s, b) => s + b.paidAmount - b.refundAmount, 0),
      outstanding: live.reduce((s, b) => s + b.remainingAmount, 0),
    },
  })
}

const updateSchema = z.object({
  role: z.enum(['GUEST', 'HOTEL_MANAGER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'DEACTIVE']).optional(),
})

/**
 * PATCH /api/admin/users/[id] { role?, status? } (ADMIN)
 *
 * Any change to role or status signs the user out everywhere, so a demoted or
 * deactivated account loses access immediately rather than at session expiry.
 * An admin can't demote or deactivate themselves (no locking the hotel out),
 * and the last active admin can't be removed.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, updateSchema)
  if (!parsed.ok) return parsed.response
  const { role, status } = parsed.data
  if (!role && !status) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  try {
    const { id } = await params
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (id === auth.user.id && ((role && role !== 'ADMIN') || status === 'DEACTIVE')) {
      return NextResponse.json({ error: "You can't demote or deactivate your own account" }, { status: 400 })
    }
    const losingAdmin = target.role === 'ADMIN' && ((role && role !== 'ADMIN') || status === 'DEACTIVE')
    if (losingAdmin) {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
      if (admins <= 1) {
        return NextResponse.json({ error: 'There must be at least one active admin' }, { status: 400 })
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(role ? { role, isAdmin: role === 'ADMIN' } : {}),
        ...(status ? { status } : {}),
      },
      select: { id: true, email: true, name: true, phone: true, role: true, status: true },
    })
    await revokeUserSessions(id)
    await logManagerAction(auth.user.id, 'UPDATE_STAFF', {
      metadata: { userId: id, from: { role: target.role, status: target.status }, to: { role: user.role, status: user.status } },
    })
    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('[admin/users/id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
