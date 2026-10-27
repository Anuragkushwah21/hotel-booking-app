import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { istDayBounds } from '@/lib/format'
import { realBookings } from '@/lib/admin-stats'
import type { BookingStatus, BookingType, PaymentStatus, Prisma, RefundStatus } from '@prisma/client'

/**
 * GET /api/admin/bookings
 *
 * One list for both channels. Query params:
 *   source   ONLINE | WALK_IN            (omit for both)
 *   type     ROOM | TABLE | ROOM_TABLE
 *   status   PENDING|CONFIRMED|CHECKED_IN|CHECKED_OUT|CANCELLED  (repeatable)
 *   payment  PENDING|PARTIALLY_PAID|PAID|FAILED|REFUNDED
 *   refund   REFUND_PENDING|REFUND_PROCESSED|REFUND_REJECTED
 *   addOn    add-on code, e.g. AIRPORT_PICKUP
 *   from,to  YYYY-MM-DD (IST) — filters on the stay/reservation date, not createdAt
 *   q        guest name / email / phone / booking number / id
 *   holds    1 → include unpaid online checkouts (hidden by default: they are
 *            in-progress payments, not bookings)
 *   page,limit
 */
const TYPES: BookingType[] = ['ROOM', 'TABLE', 'ROOM_TABLE']
const STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW']
const PAYMENTS: PaymentStatus[] = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED']
const REFUNDS: RefundStatus[] = ['REFUND_PENDING', 'REFUND_PROCESSED', 'REFUND_REJECTED']

export async function GET(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 25))

    const and: Prisma.BookingWhereInput[] = []
    if (sp.get('holds') !== '1') and.push(realBookings)

    const source = sp.get('source')
    if (source === 'ONLINE' || source === 'WALK_IN') and.push({ source })

    const statuses = sp.getAll('status').filter((s): s is BookingStatus => STATUSES.includes(s as BookingStatus))
    if (statuses.length) and.push({ status: { in: statuses } })

    const payment = sp.get('payment') as PaymentStatus | null
    if (payment && PAYMENTS.includes(payment)) and.push({ paymentStatus: payment })

    const refund = sp.get('refund') as RefundStatus | null
    if (refund && REFUNDS.includes(refund)) and.push({ refundStatus: refund })

    // Add-on filter, e.g. addOn=AIRPORT_PICKUP for the pickups board.
    const addOn = sp.get('addOn')
    if (addOn && /^[A-Z_]{2,40}$/.test(addOn)) and.push({ addOns: { has: addOn } })

    // Date range applies to when the guest is actually here (IST days).
    const from = sp.get('from')
    const to = sp.get('to')
    if (from || to) {
      const gte = from ? istDayBounds(from.slice(0, 10)).start : undefined
      const lt = to ? istDayBounds(to.slice(0, 10)).end : undefined
      const range = { ...(gte && { gte }), ...(lt && { lt }) }
      and.push({
        OR: [
          { type: { in: ['ROOM', 'ROOM_TABLE'] }, checkInDate: range },
          { type: 'TABLE', bookingDate: range },
        ],
      })
    }

    const q = sp.get('q')?.trim()
    if (q) {
      and.push({
        OR: [
          { guestName: { contains: q, mode: 'insensitive' } },
          { guestEmail: { contains: q, mode: 'insensitive' } },
          { guestPhone: { contains: q } },
          { reference: { contains: q.toUpperCase() } },
          { assignedRoomNo: q },
          { id: q },
        ],
      })
    }

    const whereAcrossTypes: Prisma.BookingWhereInput = { AND: and }
    const type = sp.get('type') as BookingType | null
    const where: Prisma.BookingWhereInput =
      type && TYPES.includes(type) ? { AND: [...and, { type }] } : whereAcrossTypes

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
        _sum: { totalPrice: true, paidAmount: true },
      }),
      // Type totals ignore the type filter itself, otherwise the inactive tab
      // would always read zero.
      prisma.booking.groupBy({
        by: ['type'],
        where: whereAcrossTypes,
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
    ])

    const src = (s: string) => sourceTotals.find((t) => t.source === s)
    const typ = (t: string) => typeTotals.find((x) => x.type === t)

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        type: b.type,
        source: b.source,
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentMode: b.paymentMode,
        refundStatus: b.refundStatus,
        guestName: b.guestName,
        guestEmail: b.guestEmail,
        guestPhone: b.guestPhone,
        guestCount: b.guestCount,
        tableGuestCount: b.tableGuestCount,
        addOns: b.addOns,
        roomName: b.room?.name ?? null,
        roomNo: b.assignedRoomNo ?? b.room?.roomNo ?? null,
        tableNo: b.table?.tableNo ?? null,
        checkInDate: b.checkInDate,
        checkOutDate: b.checkOutDate,
        bookingDate: b.bookingDate,
        checkedInAt: b.checkedInAt,
        checkedOutAt: b.checkedOutAt,
        baseAmount: b.baseAmount,
        addOnsAmount: b.addOnsAmount,
        totalPrice: b.totalPrice,
        paidAmount: b.paidAmount,
        remainingAmount: b.remainingAmount,
        refundAmount: b.refundAmount,
        holdExpiresAt: b.holdExpiresAt,
        // null for online bookings, the manager for walk-ins
        bookedBy: b.bookedBy ? { id: b.bookedBy.id, name: b.bookedBy.name, email: b.bookedBy.email } : null,
        user: b.user,
        createdAt: b.createdAt,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      totals: {
        online: src('ONLINE')?._count._all ?? 0,
        walkIn: src('WALK_IN')?._count._all ?? 0,
        onlineRevenue: src('ONLINE')?._sum.totalPrice ?? 0,
        walkInRevenue: src('WALK_IN')?._sum.totalPrice ?? 0,
        collected: sourceTotals.reduce((s, t) => s + (t._sum.paidAmount ?? 0), 0),
        rooms: typ('ROOM')?._count._all ?? 0,
        tables: typ('TABLE')?._count._all ?? 0,
        combined: typ('ROOM_TABLE')?._count._all ?? 0,
        roomRevenue: typ('ROOM')?._sum.totalPrice ?? 0,
        tableRevenue: typ('TABLE')?._sum.totalPrice ?? 0,
        combinedRevenue: typ('ROOM_TABLE')?._sum.totalPrice ?? 0,
      },
    })
  } catch (error) {
    console.error('[admin/bookings] GET error:', error)
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 })
  }
}
