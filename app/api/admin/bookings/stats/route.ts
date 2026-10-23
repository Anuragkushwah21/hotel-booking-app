import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { realBookings } from '@/lib/admin-stats'

/** GET /api/admin/bookings/stats — counts and value by type and payment status (abandoned checkouts excluded). */
export async function GET(_req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const [byType, byPaymentStatus] = await Promise.all([
      prisma.booking.groupBy({
        by: ['type'],
        where: realBookings,
        _count: { _all: true },
        _sum: { totalPrice: true, paidAmount: true },
      }),
      prisma.booking.groupBy({
        by: ['paymentStatus'],
        where: realBookings,
        _count: { _all: true },
        _sum: { totalPrice: true, paidAmount: true },
      }),
    ])

    return NextResponse.json({ byType, byPaymentStatus }, { status: 200 })
  } catch (error) {
    console.error('[admin/bookings/stats] GET error:', error)
    return NextResponse.json({ error: 'Failed to load booking stats' }, { status: 500 })
  }
}
