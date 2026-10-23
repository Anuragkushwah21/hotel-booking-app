import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/bookings — the signed-in guest's own bookings.
 * (Same data as /api/bookings/me, kept for the older clients that call this.)
 *
 * The legacy POST that lived here was removed: it was only used by the old
 * checkout page, and booking now goes through POST /api/bookings/rooms or
 * /api/bookings/tables followed by payment.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    // Same rule as /api/bookings/me: walk-ins are front-desk records, not
    // part of the guest's own booking list.
    const bookings = await prisma.booking.findMany({
      where: { userId: auth.user.id, source: 'ONLINE' },
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { id: true, name: true, roomNo: true, type: true, price: true } },
        table: { select: { id: true, tableNo: true, location: true } },
      },
    })

    return NextResponse.json({ success: true, data: bookings })
  } catch (error) {
    console.error('[bookings] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}
