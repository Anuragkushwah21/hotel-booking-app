import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { blockingBookingFilter, startOfDay, endOfDay } from '@/lib/booking-engine'

/**
 * GET /api/admin/dashboard — today's front-desk picture.
 * Arrivals, departures, in-house, occupancy and revenue split by channel.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)

    const guestSelect = {
      id: true, guestName: true, guestPhone: true, guestCount: true,
      source: true, status: true, paymentStatus: true, totalPrice: true,
      checkInDate: true, checkOutDate: true, bookingDate: true,
      room: { select: { name: true, roomNo: true } },
      table: { select: { tableNo: true } },
    }

    const [
      arrivals,
      departures,
      inHouse,
      totalRooms,
      occupiedNow,
      todayRevenue,
      pendingPayments,
      tablesToday,
    ] = await Promise.all([
      prisma.booking.findMany({
        where: {
          type: 'ROOM',
          status: { in: ['PENDING', 'CONFIRMED'] },
          checkInDate: { gte: todayStart, lte: todayEnd },
        },
        select: guestSelect,
        orderBy: { checkInDate: 'asc' },
      }),
      prisma.booking.findMany({
        where: {
          type: 'ROOM',
          status: 'CHECKED_IN',
          checkOutDate: { gte: todayStart, lte: todayEnd },
        },
        select: guestSelect,
        orderBy: { checkOutDate: 'asc' },
      }),
      prisma.booking.count({ where: { type: 'ROOM', status: 'CHECKED_IN' } }),
      prisma.room.count({ where: { status: { not: 'MAINTENANCE' } } }),
      prisma.booking.count({
        where: {
          type: 'ROOM',
          checkInDate: { lte: todayEnd },
          checkOutDate: { gt: todayStart },
          AND: [blockingBookingFilter(now)],
        },
      }),
      prisma.booking.groupBy({
        by: ['source'],
        where: {
          paymentStatus: 'PAID',
          status: { not: 'CANCELLED' },
          updatedAt: { gte: todayStart, lte: todayEnd },
        },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      prisma.booking.aggregate({
        where: { paymentStatus: 'PENDING', status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      prisma.booking.count({
        where: {
          type: 'TABLE',
          bookingDate: { gte: todayStart, lte: todayEnd },
          status: { not: 'CANCELLED' },
        },
      }),
    ])

    const onlineRevenue = todayRevenue.find((r) => r.source === 'ONLINE')?._sum.totalPrice ?? 0
    const walkInRevenue = todayRevenue.find((r) => r.source === 'WALK_IN')?._sum.totalPrice ?? 0

    return NextResponse.json({
      today: now.toISOString(),
      metrics: {
        arrivals: arrivals.length,
        departures: departures.length,
        inHouse,
        totalRooms,
        occupiedRooms: occupiedNow,
        occupancyRate: totalRooms > 0 ? Math.round((occupiedNow / totalRooms) * 100) : 0,
        tableReservationsToday: tablesToday,
        revenueToday: onlineRevenue + walkInRevenue,
        onlineRevenueToday: onlineRevenue,
        walkInRevenueToday: walkInRevenue,
        pendingPaymentCount: pendingPayments._count._all,
        pendingPaymentAmount: pendingPayments._sum.totalPrice ?? 0,
      },
      arrivals,
      departures,
    })
  } catch (error) {
    console.error('[admin/dashboard] GET error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
