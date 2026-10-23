import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { HOLD_EXPIRED_REASONS } from '@/lib/booking-engine'
import { getHotelSettings } from '@/lib/settings'
import { guestBookingInclude, toGuestBookingView } from '@/lib/booking-view'

/**
 * GET /api/bookings/me — the signed-in guest's own bookings.
 *
 * A paid online booking is CONFIRMED the moment payment succeeds, so it shows
 * up here, with its room number, straight after checkout.
 *
 * Front-desk (WALK_IN) bookings stay out of this list: they belong to the
 * admin dashboard and the guest reaches them with their booking number +
 * email at /booking-status. Checkouts abandoned before payment (lapsed holds)
 * are hidden too — they were never real bookings.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not authenticated', bookings: [] }, { status: 401 })

  try {
    const [settings, bookings] = await Promise.all([
      getHotelSettings(),
      prisma.booking.findMany({
        where: {
          userId: auth.user.id,
          source: 'ONLINE',
          NOT: {
            status: 'CANCELLED',
            paidAmount: 0,
            cancelReason: { in: HOLD_EXPIRED_REASONS },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: guestBookingInclude,
      }),
    ])

    // Unpaid holds that lapsed but haven't been swept yet look the same.
    const now = Date.now()
    const live = bookings.filter(
      (b) => !(b.status === 'PENDING' && b.paidAmount === 0 && b.holdExpiresAt && b.holdExpiresAt.getTime() < now),
    )

    return NextResponse.json(
      { bookings: live.map((b) => toGuestBookingView(b, settings)) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error: any) {
    console.error('[bookings/me] GET error:', error)
    return NextResponse.json(
      {
        error: 'Failed to load bookings',
        bookings: [],
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
