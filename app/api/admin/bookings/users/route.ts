import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        bookings: {
          select: {
            id: true,
            type: true,
            totalPrice: true,
            paymentStatus: true,
            createdAt: true,
          },
        },
      },
    })

    const mapped = users.map(u => {
      const totalPaid = u.bookings
        .filter(b => b.paymentStatus === 'PAID')
        .reduce((sum, b) => sum + b.totalPrice, 0)

      const totalUnpaid = u.bookings
        .filter(b => b.paymentStatus !== 'PAID')
        .reduce((sum, b) => sum + b.totalPrice, 0)

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