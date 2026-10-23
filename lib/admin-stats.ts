/**
 * Server-side aggregates for the admin dashboard and reports.
 *
 * Two rules every number here follows:
 *  - An unpaid ONLINE booking (still PENDING, or cancelled because its hold
 *    lapsed) is an abandoned checkout, not a booking. `realBookings` filters
 *    them out of every count, list and chart.
 *  - Revenue is money actually moved: the Payment ledger (successful payments
 *    minus refunds), never Booking.totalPrice.
 *
 * Days are IST calendar days (lib/format dateKey).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { addDaysToKey, dateKey, istDayBounds, weekdayOfKey } from './format'
import { ROOM_BOOKING_TYPES, TABLE_BOOKING_TYPES } from './booking-engine'

export const realBookings: Prisma.BookingWhereInput = {
  NOT: { source: 'ONLINE', paidAmount: 0, status: { in: ['PENDING', 'CANCELLED'] } },
}

/** Bookings that occupy (or occupied) their room. */
const STAYING: Prisma.BookingWhereInput = {
  type: { in: ROOM_BOOKING_TYPES },
  status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
}

export function keysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = []
  for (let k = fromKey; k <= toKey && out.length < 400; k = addDaysToKey(k, 1)) out.push(k)
  return out
}

/** Monday of the IST week containing `key`. */
function weekKey(key: string): string {
  const wd = weekdayOfKey(key)
  return addDaysToKey(key, wd === 0 ? -6 : 1 - wd)
}

const shortDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortMonth = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })

export type SeriesPoint = { key: string; label: string; total: number; online: number; walkIn: number; rooms: number; tables: number }

export type Report = {
  from: string
  to: string
  bookings: { daily: SeriesPoint[]; weekly: SeriesPoint[]; monthly: SeriesPoint[] }
  revenue: { key: string; label: string; collected: number; refunded: number; net: number }[]
  occupancy: { key: string; label: string; occupied: number; rate: number }[]
  totals: {
    bookings: number
    cancelled: number
    collected: number
    refunded: number
    net: number
    avgOccupancy: number
    bookedValue: number
  }
  byType: { rooms: number; tables: number; combined: number }
  bySource: { online: number; walkIn: number; onlineValue: number; walkInValue: number }
  byPaymentStatus: { status: string; count: number; amount: number }[]
  topRoomTypes: { name: string; bookings: number; revenue: number }[]
}

/** Everything the reports page charts, for an inclusive IST date range. */
export async function buildReport(fromKey: string, toKey: string): Promise<Report> {
  const start = istDayBounds(fromKey).start
  const end = istDayBounds(toKey).end
  const days = keysBetween(fromKey, toKey)

  const [bookings, payments, totalRooms, stays] = await Promise.all([
    prisma.booking.findMany({
      where: { AND: [realBookings, { createdAt: { gte: start, lt: end } }] },
      select: {
        createdAt: true, source: true, type: true, status: true, paymentStatus: true,
        totalPrice: true, paidAmount: true, room: { select: { type: true, name: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: 'SUCCEEDED', paidAt: { gte: start, lt: end } },
      select: { paidAt: true, amount: true, kind: true },
    }),
    prisma.room.count({ where: { status: { not: 'MAINTENANCE' } } }),
    prisma.booking.findMany({
      where: {
        ...STAYING,
        checkInDate: { lt: end },
        checkOutDate: { gt: start },
      },
      select: { roomId: true, checkInDate: true, checkOutDate: true },
    }),
  ])

  // ---- bookings per day / week / month ----
  const empty = (key: string, label: string): SeriesPoint => ({ key, label, total: 0, online: 0, walkIn: 0, rooms: 0, tables: 0 })
  const daily = new Map(days.map((k) => [k, empty(k, shortDay(k))]))
  const weekly = new Map<string, SeriesPoint>()
  const monthly = new Map<string, SeriesPoint>()
  for (const k of days) {
    const w = weekKey(k)
    if (!weekly.has(w)) weekly.set(w, empty(w, `Wk ${shortDay(w)}`))
    const m = k.slice(0, 7)
    if (!monthly.has(m)) monthly.set(m, empty(m, shortMonth(`${m}-01`)))
  }
  const bump = (p: SeriesPoint | undefined, b: (typeof bookings)[number]) => {
    if (!p) return
    p.total++
    if (b.source === 'ONLINE') p.online++
    else p.walkIn++
    if (b.type !== 'TABLE') p.rooms++
    if (b.type !== 'ROOM') p.tables++
  }
  for (const b of bookings) {
    const k = dateKey(b.createdAt)
    bump(daily.get(k), b)
    bump(weekly.get(weekKey(k)), b)
    bump(monthly.get(k.slice(0, 7)), b)
  }

  // ---- revenue (ledger) ----
  const rev = new Map(days.map((k) => [k, { key: k, label: shortDay(k), collected: 0, refunded: 0, net: 0 }]))
  let collected = 0
  let refunded = 0
  for (const p of payments) {
    const row = rev.get(dateKey(p.paidAt!))
    if (p.kind === 'REFUND') {
      refunded += p.amount
      if (row) row.refunded += p.amount
    } else {
      collected += p.amount
      if (row) row.collected += p.amount
    }
  }
  for (const r of rev.values()) r.net = r.collected - r.refunded

  // ---- occupancy: distinct rooms in-house each night ----
  const occupancy = days.slice(-92).map((k) => {
    const rooms = new Set<string>()
    for (const s of stays) {
      if (!s.roomId || !s.checkInDate || !s.checkOutDate) continue
      if (dateKey(s.checkInDate) <= k && k < dateKey(s.checkOutDate)) rooms.add(s.roomId)
    }
    return {
      key: k,
      label: shortDay(k),
      occupied: rooms.size,
      rate: totalRooms ? Math.round((rooms.size / totalRooms) * 100) : 0,
    }
  })

  // ---- splits ----
  const live = bookings.filter((b) => b.status !== 'CANCELLED')
  const byPaymentStatus = new Map<string, { status: string; count: number; amount: number }>()
  for (const b of live) {
    const row = byPaymentStatus.get(b.paymentStatus) ?? { status: b.paymentStatus, count: 0, amount: 0 }
    row.count++
    row.amount += b.totalPrice
    byPaymentStatus.set(b.paymentStatus, row)
  }

  const roomTypes = new Map<string, { name: string; bookings: number; revenue: number }>()
  for (const b of live) {
    if (b.type === 'TABLE' || !b.room) continue
    const name = b.room.type || b.room.name
    const row = roomTypes.get(name) ?? { name, bookings: 0, revenue: 0 }
    row.bookings++
    row.revenue += b.paidAmount
    roomTypes.set(name, row)
  }

  return {
    from: fromKey,
    to: toKey,
    bookings: {
      daily: [...daily.values()],
      weekly: [...weekly.values()],
      monthly: [...monthly.values()],
    },
    revenue: [...rev.values()],
    occupancy,
    totals: {
      bookings: bookings.length,
      cancelled: bookings.length - live.length,
      collected,
      refunded,
      net: collected - refunded,
      avgOccupancy: occupancy.length
        ? Math.round(occupancy.reduce((s, o) => s + o.rate, 0) / occupancy.length)
        : 0,
      bookedValue: live.reduce((s, b) => s + b.totalPrice, 0),
    },
    byType: {
      rooms: live.filter((b) => b.type === 'ROOM').length,
      tables: live.filter((b) => b.type === 'TABLE').length,
      combined: live.filter((b) => b.type === 'ROOM_TABLE').length,
    },
    bySource: {
      online: live.filter((b) => b.source === 'ONLINE').length,
      walkIn: live.filter((b) => b.source === 'WALK_IN').length,
      onlineValue: live.filter((b) => b.source === 'ONLINE').reduce((s, b) => s + b.totalPrice, 0),
      walkInValue: live.filter((b) => b.source === 'WALK_IN').reduce((s, b) => s + b.totalPrice, 0),
    },
    byPaymentStatus: [...byPaymentStatus.values()].sort((a, b) => b.count - a.count),
    topRoomTypes: [...roomTypes.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 8),
  }
}

/** Default report window: the last `days` IST days, ending today. */
export function lastDays(days: number): { from: string; to: string } {
  const to = dateKey(new Date())
  return { from: addDaysToKey(to, -(days - 1)), to }
}

/** Parse ?from=&to= (YYYY-MM-DD), falling back to the last 30 days; capped at 366 days. */
export function rangeFromParams(sp: URLSearchParams): { from: string; to: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/
  const fallback = lastDays(30)
  let from = sp.get('from') ?? ''
  let to = sp.get('to') ?? ''
  if (!re.test(from)) from = fallback.from
  if (!re.test(to)) to = fallback.to
  if (from > to) [from, to] = [to, from]
  if (keysBetween(from, to).length > 366) from = addDaysToKey(to, -365)
  return { from, to }
}

export { ROOM_BOOKING_TYPES, TABLE_BOOKING_TYPES }
