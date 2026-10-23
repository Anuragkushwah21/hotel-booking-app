import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, isStaff } from '@/lib/auth'
import { hasBookingAccess } from '@/lib/booking-access'
import { getHotelSettings } from '@/lib/settings'
import { guestBookingInclude, toGuestBookingView } from '@/lib/booking-view'

/**
 * GET /api/bookings/[id] — one booking for its owner (confirmation page,
 * booking detail). Staff may read any booking.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id }, include: guestBookingInclude })
  const user = await getCurrentUser()
  const ownsBooking = user?.id === booking?.userId

  // Same 404 for "not yours" as for "doesn't exist", so ids can't be probed.
  if (!booking || (!ownsBooking && !isStaff(user?.role) && !hasBookingAccess(_req, id))) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const settings = await getHotelSettings()
  return NextResponse.json(
    { booking: toGuestBookingView(booking, settings) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
