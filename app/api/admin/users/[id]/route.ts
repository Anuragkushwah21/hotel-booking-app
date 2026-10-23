import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
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
