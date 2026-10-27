import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createPasswordToken, INVITE_TTL_MS, requireAdmin, revokeUserSessions } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson } from '@/lib/validation'
import { prisma } from '@/lib/prisma'
import { realBookings } from '@/lib/admin-stats'
import type { Prisma, UserRole } from '@prisma/client'

/**
 * GET /api/admin/users — guests and staff with their booking money (ADMIN).
 *   q        name / email / phone
 *   role     GUEST | HOTEL_MANAGER | ADMIN | STAFF (managers + admins)
 *   balance  due → only users with an outstanding balance
 *   page,limit
 */
const ROLES: UserRole[] = ['GUEST', 'HOTEL_MANAGER', 'ADMIN']

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 25))

    const where: Prisma.UserWhereInput = {}
    const role = sp.get('role') as UserRole | null
    if (role && ROLES.includes(role)) where.role = role
    else if (sp.get('role') === 'STAFF') where.role = { in: ['HOTEL_MANAGER', 'ADMIN'] }
    const q = sp.get('q')?.trim()
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ]
    }
    if (sp.get('balance') === 'due') {
      where.bookings = {
        some: { AND: [realBookings], status: { not: 'CANCELLED' }, remainingAmount: { gt: 0 } },
      }
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, email: true, name: true, phone: true, role: true, status: true,
          emailVerified: true, passwordHash: true, createdAt: true,
        },
      }),
    ])

    const money = await prisma.booking.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) }, AND: [realBookings] },
      _count: { _all: true },
      _sum: { paidAmount: true, refundAmount: true },
      _max: { createdAt: true },
    })
    const due = await prisma.booking.groupBy({
      by: ['userId'],
      where: {
        userId: { in: users.map((u) => u.id) },
        AND: [realBookings],
        status: { not: 'CANCELLED' },
      },
      _sum: { remainingAmount: true },
    })

    return NextResponse.json({
      users: users.map(({ passwordHash, ...u }) => {
        const m = money.find((x) => x.userId === u.id)
        const outstanding = due.find((x) => x.userId === u.id)?._sum.remainingAmount ?? 0
        const paid = (m?._sum.paidAmount ?? 0) - (m?._sum.refundAmount ?? 0)
        return {
          ...u,
          // Walk-in guests are created without a password until they sign up.
          hasAccount: Boolean(passwordHash),
          bookings: m?._count._all ?? 0,
          lastBookingAt: m?._max.createdAt ?? null,
          totalPaid: paid,
          outstanding,
          paymentState: (m?._count._all ?? 0) === 0 ? 'NONE' : outstanding > 0 ? 'DUE' : 'SETTLED',
        }
      }),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[admin/users] GET error:', error)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(20).optional().nullable().transform((v) => (v ? v : null)),
  role: z.enum(['HOTEL_MANAGER', 'ADMIN']),
})

/**
 * POST /api/admin/users — invite a member of staff (ADMIN).
 * { email, name, phone?, role: HOTEL_MANAGER | ADMIN }
 *
 * Creates the account without a password (or promotes an existing guest) and
 * emails a single-use "set your password" link valid for 72 hours.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, inviteSchema)
  if (!parsed.ok) return parsed.response
  const { email, name, phone, role } = parsed.data

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing && existing.role !== 'GUEST') {
      return NextResponse.json({ error: 'This email already belongs to a staff account' }, { status: 409 })
    }
    if (phone) {
      const phoneOwner = await prisma.user.findUnique({ where: { phone } })
      if (phoneOwner && phoneOwner.email !== email) {
        return NextResponse.json({ error: 'That phone number is already used by another account' }, { status: 409 })
      }
    }

    const data = {
      name,
      role,
      isAdmin: role === 'ADMIN',
      status: 'ACTIVE' as const,
      invitedById: auth.user.id,
      invitedAt: new Date(),
      ...(phone ? { phone } : {}),
    }
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({ data: { ...data, email, emailVerified: false, passwordHash: null } })

    // A promoted guest keeps their password but any open sessions were issued
    // with guest permissions — make them sign in again.
    if (existing) await revokeUserSessions(user.id)

    const token = await createPasswordToken(email, INVITE_TTL_MS)
    const sent = await sendPasswordResetEmail(email, name, token, 'INVITE')

    await logManagerAction(auth.user.id, 'INVITE_STAFF', {
      metadata: { userId: user.id, email, role, promotedGuest: Boolean(existing), emailSent: sent },
    })

    return NextResponse.json(
      {
        success: true,
        emailSent: sent,
        message: sent ? `Invitation sent to ${email}` : 'Account created, but the invitation email could not be sent — use “Resend invite”.',
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, status: user.status },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[admin/users] POST error:', error)
    return NextResponse.json({ error: 'Failed to invite staff member' }, { status: 500 })
  }
}
