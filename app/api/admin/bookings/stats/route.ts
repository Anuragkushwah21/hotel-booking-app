import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    // type wise count + revenue
    const byType = await prisma.booking.groupBy({
      by: ['type'],
      _count: { _all: true },
      _sum: { totalPrice: true },
    })

    // payment status wise
    const byPaymentStatus = await prisma.booking.groupBy({
      by: ['paymentStatus'],
      _count: { _all: true },
      _sum: { totalPrice: true },
    })

    return NextResponse.json(
      {
        byType,
        byPaymentStatus,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[admin/bookings/stats] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load booking stats' },
      { status: 500 },
    )
  }
}