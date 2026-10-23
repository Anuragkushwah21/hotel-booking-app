import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { realBookings } from '@/lib/admin-stats'
import type { Prisma, UserRole } from '@prisma/client'

/**
 * GET /api/admin/users — guests and staff with their booking money (ADMIN).
 *   q        name / email / phone
 *   role     GUEST | HOTEL_MANAGER | ADMIN
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
