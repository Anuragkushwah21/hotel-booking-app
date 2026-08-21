import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { startOfDay, endOfDay } from '@/lib/booking-engine'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/admin/bookings
 *
 * One list for both channels. Query params:
 *   source   ONLINE | WALK_IN            (omit for both)
 *   type     ROOM | TABLE
 *   status   PENDING|CONFIRMED|CHECKED_IN|CHECKED_OUT|CANCELLED  (repeatable)
 *   payment  PENDING|PAID|FAILED|REFUNDED
 *   from,to  YYYY-MM-DD — filters on the stay/reservation date, not createdAt
 *   q        guest name / email / phone / booking id
 *   page,limit
 */
export async function GET(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 25))

    const where: Prisma.BookingWhereInput = {}

    const source = sp.get('source')
    if (source === 'ONLINE' || source === 'WALK_IN') where.source = source

    const type = sp.get('type')
    if (type === 'ROOM' || type === 'TABLE') where.type = type

    const statuses = sp.getAll('status').filter(Boolean)
    if (statuses.length) where.status = { in: statuses as any }

    const payment = sp.get('payment')
    if (payment) where.paymentStatus = payment as any

    // Date range applies to when the guest is actually here.
    const from = sp.get('from')
    const to = sp.get('to')
    if (from || to) {
      const gte = from ? startOfDay(new Date(from)) : undefined
      const lte = to ? endOfDay(new Date(to)) : undefined
      where.OR = [
        { type: 'ROOM', checkInDate: { ...(gte && { gte }), ...(lte && { lte }) } },
        { type: 'TABLE', bookingDate: { ...(gte && { gte }), ...(lte && { lte }) } },
      ]
    }

    const q = sp.get('q')?.trim()
    if (q) {
      const search: Prisma.BookingWhereInput[] = [
        { guestName: { contains: q, mode: 'insensitive' } },
        { guestEmail: { contains: q, mode: 'insensitive' } },
        { guestPhone: { contains: q } },
        { reference: { contains: q.toUpperCase() } },
        { id: q },
      ]
      // Combine with the date OR without clobbering it.
      where.AND = [...(where.AND ? (where.AND as Prisma.BookingWhereInput[]) : []), { OR: search }]
    }

    // Type totals ignore the type filter itself, otherwise the inactive tab
    // would always read zero.
    const { type: _type, ...whereAcrossTypes } = where

    const [total, bookings, sourceTotals, typeTotals] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          bookedBy: { select: { id: true, name: true, email: true } },
          room: { select: { id: true, name: true, roomNo: true } },
          table: { select: { id: true, tableNo: true, location: true } },
        },
      }),
      prisma.booking.groupBy({
        by: ['source'],
        where,
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      prisma.booking.groupBy({
        by: ['type'],
        where: whereAcrossTypes,
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
    ])

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        type: b.type,
        source: b.source,
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentMode: b.paymentMode,
        guestName: b.guestName,
        guestEmail: b.guestEmail,
        guestPhone: b.guestPhone,
        guestCount: b.guestCount,
        addOns: b.addOns,
        roomName: b.room?.name ?? null,
        roomNo: b.room?.roomNo ?? null,
        tableNo: b.table?.tableNo ?? null,
        checkInDate: b.checkInDate,
        checkOutDate: b.checkOutDate,
        bookingDate: b.bookingDate,
        checkedInAt: b.checkedInAt,
        checkedOutAt: b.checkedOutAt,
        baseAmount: b.baseAmount,
        addOnsAmount: b.addOnsAmount,
        totalPrice: b.totalPrice,
        refundAmount: b.refundAmount,
        // null for online bookings, the manager for walk-ins
        bookedBy: b.bookedBy ? { id: b.bookedBy.id, name: b.bookedBy.name, email: b.bookedBy.email } : null,
        user: b.user,
        createdAt: b.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      totals: {
        online: sourceTotals.find((s) => s.source === 'ONLINE')?._count._all ?? 0,
        walkIn: sourceTotals.find((s) => s.source === 'WALK_IN')?._count._all ?? 0,
        onlineRevenue: sourceTotals.find((s) => s.source === 'ONLINE')?._sum.totalPrice ?? 0,
        walkInRevenue: sourceTotals.find((s) => s.source === 'WALK_IN')?._sum.totalPrice ?? 0,
        rooms: typeTotals.find((t) => t.type === 'ROOM')?._count._all ?? 0,
        tables: typeTotals.find((t) => t.type === 'TABLE')?._count._all ?? 0,
        roomRevenue: typeTotals.find((t) => t.type === 'ROOM')?._sum.totalPrice ?? 0,
        tableRevenue: typeTotals.find((t) => t.type === 'TABLE')?._sum.totalPrice ?? 0,
      },
    })
  } catch (error) {
    console.error('[admin/bookings] GET error:', error)
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 })
  }
}
