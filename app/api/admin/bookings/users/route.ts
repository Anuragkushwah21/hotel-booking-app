import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { realBookings } from '@/lib/admin-stats'

/** GET — legacy per-user totals. Prefer /api/admin/users. (ADMIN) */
export async function GET(_req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        bookings: {
          where: realBookings,
          select: {
            id: true,
            type: true,
            totalPrice: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
          },
        },
      },
    })

    const mapped = users.map(u => {
      // Money actually received vs still owed, from the ledger-backed columns.
      const totalPaid = u.bookings.reduce((sum, b) => sum + b.paidAmount, 0)
      const totalUnpaid = u.bookings
        .filter(b => b.status !== 'CANCELLED')
        .reduce((sum, b) => sum + b.remainingAmount, 0)

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        totalPaid,
        totalUnpaid,
        bookings: u.bookings,
      }
    })

    return NextResponse.json({ users: mapped }, { status: 200 })
  } catch (error) {
    console.error('[admin/bookings/users] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load users bookings' },
      { status: 500 },
    )
  }
}