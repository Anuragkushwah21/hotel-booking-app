import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { addDaysToKey, dateKey, istDayBounds } from '@/lib/format'
import {
  buildReport,
  lastDays,
  realBookings,
  ROOM_BOOKING_TYPES,
  TABLE_BOOKING_TYPES,
} from '@/lib/admin-stats'

/**
 * GET /api/admin/dashboard — today's front-desk picture plus 30-day charts.
 *
 * "Today" is the IST calendar day. Unpaid online checkouts are excluded
 * everywhere: an online booking reaches the dashboard only once its payment
 * has confirmed it.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const todayKey = dateKey(new Date())
    const { start: todayStart, end: todayEnd } = istDayBounds(todayKey)
    const weekEnd = istDayBounds(addDaysToKey(todayKey, 7)).end
    const tomorrowStart = istDayBounds(addDaysToKey(todayKey, 1)).start

    const listSelect = {
      id: true, reference: true, type: true, guestName: true, guestPhone: true, guestCount: true,
      source: true, status: true, paymentStatus: true, totalPrice: true, paidAmount: true,
      remainingAmount: true, refundAmount: true, refundStatus: true, cancelReason: true,
      checkInDate: true, checkOutDate: true, bookingDate: true, createdAt: true, assignedRoomNo: true,
      room: { select: { name: true, roomNo: true } },
      table: { select: { tableNo: true } },
    } as const

    const roomTypes = { type: { in: ROOM_BOOKING_TYPES } }

    const [
      todaysBookings,
      arrivals,
      departures,
      inHouse,
      totalRooms,
      maintenanceRooms,
      occupiedToday,
      blockedToday,
      pending,
      todayPayments,
      allPayments,
      typeSplit,
      sourceSplit,
      tablesToday,
      upcoming,
      recent,
      refundAlerts,
      report,
    ] = await Promise.all([
      prisma.booking.count({ where: { AND: [realBookings, { createdAt: { gte: todayStart, lt: todayEnd } }] } }),
      prisma.booking.findMany({
        where: {
          ...roomTypes,
          AND: [realBookings],
          status: { in: ['PENDING', 'CONFIRMED'] },
          checkInDate: { gte: todayStart, lt: todayEnd },
        },
        select: listSelect,
        orderBy: { checkInDate: 'asc' },
      }),
      prisma.booking.findMany({
        where: { ...roomTypes, status: 'CHECKED_IN', checkOutDate: { lt: todayEnd } },
        select: listSelect,
        orderBy: { checkOutDate: 'asc' },
      }),
      prisma.booking.count({ where: { ...roomTypes, status: 'CHECKED_IN' } }),
      prisma.room.count(),
      prisma.room.count({ where: { status: 'MAINTENANCE' } }),
      prisma.booking.findMany({
        where: {
          ...roomTypes,
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          checkInDate: { lt: todayEnd },
          checkOutDate: { gt: todayStart },
        },
        select: { roomId: true },
        distinct: ['roomId'],
      }),
      prisma.roomBlock.findMany({
        where: { startDate: { lt: todayEnd }, endDate: { gt: todayStart }, room: { status: { not: 'MAINTENANCE' } } },
        select: { roomId: true },
        distinct: ['roomId'],
      }),
      prisma.booking.aggregate({
        where: {
          AND: [realBookings],
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
          remainingAmount: { gt: 0 },
        },
        _sum: { remainingAmount: true },
        _count: { _all: true },
      }),
      // Row-level (not groupBy) so today's money can be split by channel.
      prisma.payment.findMany({
        where: { status: 'SUCCEEDED', paidAt: { gte: todayStart, lt: todayEnd } },
        select: { kind: true, amount: true, booking: { select: { source: true } } },
      }),
      prisma.payment.groupBy({
        by: ['kind'],
        where: { status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      prisma.booking.groupBy({
        by: ['type'],
        where: { AND: [realBookings], status: { not: 'CANCELLED' } },
        _count: { _all: true },
      }),
      prisma.booking.groupBy({
        by: ['source'],
        where: { AND: [realBookings], status: { not: 'CANCELLED' } },
        _count: { _all: true },
      }),
      prisma.booking.count({
        where: {
          type: { in: TABLE_BOOKING_TYPES },
          AND: [realBookings],
          bookingDate: { gte: todayStart, lt: todayEnd },
          status: { not: 'CANCELLED' },
        },
      }),
      prisma.booking.findMany({
        where: {
          ...roomTypes,
          AND: [realBookings],
          status: { in: ['PENDING', 'CONFIRMED'] },
          checkInDate: { gte: tomorrowStart, lt: weekEnd },
        },
        select: listSelect,
        orderBy: { checkInDate: 'asc' },
        take: 20,
      }),
      prisma.booking.findMany({
        where: realBookings,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.booking.findMany({
        where: { refundStatus: 'REFUND_PENDING' },
        select: listSelect,
        orderBy: { refundRequestedAt: 'asc' },
        take: 20,
      }),
      (() => {
        const r = lastDays(30)
        return buildReport(r.from, r.to)
      })(),
    ])

    const net = (rows: { kind: string; _sum: { amount: number | null } }[]) =>
      rows.reduce((s, r) => s + (r.kind === 'REFUND' ? -1 : 1) * (r._sum.amount ?? 0), 0)

    // Refunds count against the day they were paid out.
    const netToday = (source?: 'ONLINE' | 'WALK_IN') =>
      todayPayments
        .filter((p) => !source || p.booking.source === source)
        .reduce((s, p) => s + (p.kind === 'REFUND' ? -1 : 1) * p.amount, 0)

    const sellable = totalRooms - maintenanceRooms
    const blockedOnly = blockedToday.filter((b) => !occupiedToday.some((o) => o.roomId === b.roomId)).length
    const occupied = occupiedToday.length
    const available = Math.max(0, sellable - occupied - blockedOnly)
    const count = <T extends { _count: { _all: number } }>(rows: T[], pick: (r: T) => boolean) =>
      rows.find(pick)?._count._all ?? 0

    return NextResponse.json({
      today: todayKey,
      metrics: {
        todaysBookings,
        arrivals: arrivals.length,
        departures: departures.length,
        inHouse,
        totalRooms: sellable,
        occupiedRooms: occupied,
        availableRooms: available,
        maintenanceRooms,
        occupancyRate: sellable > 0 ? Math.round((occupied / sellable) * 100) : 0,
        tableReservationsToday: tablesToday,
        pendingPaymentCount: pending._count._all,
        pendingPaymentAmount: pending._sum.remainingAmount ?? 0,
        revenueToday: netToday(),
        onlineRevenueToday: netToday('ONLINE'),
        walkInRevenueToday: netToday('WALK_IN'),
        totalRevenue: net(allPayments),
        refundsPending: refundAlerts.length,
      },
      split: {
        rooms: count(typeSplit, (r) => r.type === 'ROOM'),
        tables: count(typeSplit, (r) => r.type === 'TABLE'),
        combined: count(typeSplit, (r) => r.type === 'ROOM_TABLE'),
        online: count(sourceSplit, (r) => r.source === 'ONLINE'),
        walkIn: count(sourceSplit, (r) => r.source === 'WALK_IN'),
      },
      arrivals,
      departures,
      upcoming,
      recent,
      refundAlerts,
      charts: {
        bookings: report.bookings,
        revenue: report.revenue,
        occupancy: report.occupancy.slice(-14),
        paymentStatus: report.byPaymentStatus,
        topRoomTypes: report.topRoomTypes,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[admin/dashboard] GET error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
