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
import { ADD_ONS, ROOM_BOOKING_TYPES, TABLE_BOOKING_TYPES } from './booking-engine'

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
export type RevenuePoint = { key: string; label: string; collected: number; refunded: number; net: number }
export type SourceKey = 'ONLINE' | 'WALK_IN'

export type Report = {
  from: string
  to: string
  bookings: { daily: SeriesPoint[]; weekly: SeriesPoint[]; monthly: SeriesPoint[] }
  /** Ledger revenue per IST day (kept flat for the dashboard). */
  revenue: RevenuePoint[]
  revenueSeries: { daily: RevenuePoint[]; weekly: RevenuePoint[]; monthly: RevenuePoint[] }
  /** Last 92 nights of the range: distinct rooms in-house vs sellable rooms that night. */
  occupancy: { key: string; label: string; occupied: number; available: number; rate: number }[]
  totals: {
    bookings: number
    cancelled: number
    noShows: number
    collected: number
    refunded: number
    net: number
    /** Whole-range occupancy %, room-nights sold ÷ available room-nights. */
    avgOccupancy: number
    bookedValue: number
  }
  /**
   * Hotel KPIs over the stay nights that fall inside the range.
   * Room revenue is Booking.roomAmount (pre-tax room charge, excl. add-ons)
   * spread evenly over the booking's nights, so a stay straddling the range
   * edge only contributes the nights inside it.
   */
  kpis: {
    roomNightsSold: number
    availableRoomNights: number
    blockedRoomNights: number
    occupancy: number
    roomRevenue: number
    adr: number
    revpar: number
    addOnRevenue: number
    addOnBookings: number
    cancellationRate: number
    /** Arrivals dated inside the range that ended NO_SHOW. */
    noShows: number
    noShowRate: number
    arrivals: number
  }
  byType: { rooms: number; tables: number; combined: number }
  bySource: { online: number; walkIn: number; onlineValue: number; walkInValue: number }
  sources: {
    source: SourceKey
    bookings: number
    bookedValue: number
    /** Ledger money in the range for bookings of this source, net of refunds. */
    collected: number
    roomNights: number
    roomRevenue: number
    cancelled: number
    noShows: number
  }[]
  addOns: { code: string; label: string; bookings: number }[]
  byPaymentStatus: { status: string; count: number; amount: number }[]
  byStatus: { status: string; count: number }[]
  topRoomTypes: { name: string; bookings: number; revenue: number }[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const keyDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)

/** Nights of [inKey, outKey) that fall inside the inclusive range [fromKey, toKey]. */
function nightsInside(inKey: string, outKey: string, fromKey: string, toKey: string): number {
  const lo = inKey > fromKey ? inKey : fromKey
  const endExclusive = addDaysToKey(toKey, 1)
  const hi = outKey < endExclusive ? outKey : endExclusive
  return Math.max(0, keyDiff(lo, hi))
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

/** Everything the reports page charts, for an inclusive IST date range. */
export async function buildReport(fromKey: string, toKey: string): Promise<Report> {
  const start = istDayBounds(fromKey).start
  const end = istDayBounds(toKey).end
  const days = keysBetween(fromKey, toKey)

  // Every query is bounded by the range — nothing scans all history.
  const [bookings, payments, totalRooms, stays, blocks, arrivals] = await Promise.all([
    prisma.booking.findMany({
      where: { AND: [realBookings, { createdAt: { gte: start, lt: end } }] },
      select: {
        createdAt: true, source: true, type: true, status: true, paymentStatus: true,
        totalPrice: true, paidAmount: true, addOns: true, addOnsAmount: true,
        room: { select: { type: true, name: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: 'SUCCEEDED', paidAt: { gte: start, lt: end } },
      select: { paidAt: true, amount: true, kind: true, booking: { select: { source: true } } },
    }),
    prisma.room.count({ where: { status: { not: 'MAINTENANCE' } } }),
    prisma.booking.findMany({
      where: {
        ...STAYING,
        checkInDate: { lt: end },
        checkOutDate: { gt: start },
      },
      select: { roomId: true, checkInDate: true, checkOutDate: true, roomAmount: true, source: true },
    }),
    prisma.roomBlock.findMany({
      where: {
        startDate: { lt: end },
        endDate: { gt: start },
        room: { status: { not: 'MAINTENANCE' } },
      },
      select: { roomId: true, startDate: true, endDate: true },
    }),
    // Arrivals dated in the range, by outcome — for the no-show rate.
    prisma.booking.groupBy({
      by: ['status', 'source'],
      where: {
        AND: [realBookings],
        type: { in: ROOM_BOOKING_TYPES },
        checkInDate: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
      _count: { _all: true },
    }),
  ])

  // ---- bookings per day / week / month ----
  const empty = (key: string, label: string): SeriesPoint => ({ key, label, total: 0, online: 0, walkIn: 0, rooms: 0, tables: 0 })
  const emptyRev = (key: string, label: string): RevenuePoint => ({ key, label, collected: 0, refunded: 0, net: 0 })
  const daily = new Map(days.map((k) => [k, empty(k, shortDay(k))]))
  const weekly = new Map<string, SeriesPoint>()
  const monthly = new Map<string, SeriesPoint>()
  const rev = new Map(days.map((k) => [k, emptyRev(k, shortDay(k))]))
  const revWeekly = new Map<string, RevenuePoint>()
  const revMonthly = new Map<string, RevenuePoint>()
  for (const k of days) {
    const w = weekKey(k)
    if (!weekly.has(w)) {
      weekly.set(w, empty(w, `Wk ${shortDay(w)}`))
      revWeekly.set(w, emptyRev(w, `Wk ${shortDay(w)}`))
    }
    const m = k.slice(0, 7)
    if (!monthly.has(m)) {
      monthly.set(m, empty(m, shortMonth(`${m}-01`)))
      revMonthly.set(m, emptyRev(m, shortMonth(`${m}-01`)))
    }
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
  let collected = 0
  let refunded = 0
  const collectedBySource: Record<SourceKey, number> = { ONLINE: 0, WALK_IN: 0 }
  for (const p of payments) {
    const k = dateKey(p.paidAt!)
    const rows = [rev.get(k), revWeekly.get(weekKey(k)), revMonthly.get(k.slice(0, 7))]
    const sign = p.kind === 'REFUND' ? -1 : 1
    collectedBySource[p.booking.source] += sign * p.amount
    if (p.kind === 'REFUND') {
      refunded += p.amount
      for (const r of rows) if (r) r.refunded += p.amount
    } else {
      collected += p.amount
      for (const r of rows) if (r) r.collected += p.amount
    }
  }
  for (const m of [rev, revWeekly, revMonthly]) for (const r of m.values()) r.net = r.collected - r.refunded

  // ---- room-nights, room revenue, blocks ----
  let roomNightsSold = 0
  let roomRevenue = 0
  const nightsBySource: Record<SourceKey, number> = { ONLINE: 0, WALK_IN: 0 }
  const roomRevBySource: Record<SourceKey, number> = { ONLINE: 0, WALK_IN: 0 }
  const stayKeys: { roomId: string; inKey: string; outKey: string }[] = []
  for (const s of stays) {
    if (!s.roomId || !s.checkInDate || !s.checkOutDate) continue
    const inKey = dateKey(s.checkInDate)
    const outKey = dateKey(s.checkOutDate)
    stayKeys.push({ roomId: s.roomId, inKey, outKey })
    const total = Math.max(1, keyDiff(inKey, outKey))
    const inside = nightsInside(inKey, outKey, fromKey, toKey)
    if (!inside) continue
    const share = Math.round((s.roomAmount * inside) / total)
    roomNightsSold += inside
    roomRevenue += share
    nightsBySource[s.source] += inside
    roomRevBySource[s.source] += share
  }

  const blockKeys = blocks.map((b) => ({ roomId: b.roomId, inKey: dateKey(b.startDate), outKey: dateKey(b.endDate) }))
  const blockedRoomNights = blockKeys.reduce((s, b) => s + nightsInside(b.inKey, b.outKey, fromKey, toKey), 0)
  const availableRoomNights = Math.max(roomNightsSold, totalRooms * days.length - blockedRoomNights)

  // ---- occupancy series: distinct rooms in-house each night ----
  const occupancy = days.slice(-92).map((k) => {
    const rooms = new Set<string>()
    for (const s of stayKeys) if (s.inKey <= k && k < s.outKey) rooms.add(s.roomId)
    const blocked = new Set<string>()
    for (const b of blockKeys) if (b.inKey <= k && k < b.outKey && !rooms.has(b.roomId)) blocked.add(b.roomId)
    const available = Math.max(rooms.size, totalRooms - blocked.size)
    return {
      key: k,
      label: shortDay(k),
      occupied: rooms.size,
      available,
      rate: available ? Math.round((rooms.size / available) * 100) : 0,
    }
  })

  // ---- splits ----
  // NO_SHOW keeps its booking but never stayed; count it apart from live business.
  const live = bookings.filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW')
  const cancelled = bookings.filter((b) => b.status === 'CANCELLED').length
  const byPaymentStatus = new Map<string, { status: string; count: number; amount: number }>()
  for (const b of live) {
    const row = byPaymentStatus.get(b.paymentStatus) ?? { status: b.paymentStatus, count: 0, amount: 0 }
    row.count++
    row.amount += b.totalPrice
    byPaymentStatus.set(b.paymentStatus, row)
  }

  const byStatus = new Map<string, number>()
  for (const b of bookings) byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1)

  const roomTypes = new Map<string, { name: string; bookings: number; revenue: number }>()
  for (const b of live) {
    if (b.type === 'TABLE' || !b.room) continue
    const name = b.room.type || b.room.name
    const row = roomTypes.get(name) ?? { name, bookings: 0, revenue: 0 }
    row.bookings++
    row.revenue += b.paidAmount
    roomTypes.set(name, row)
  }

  const addOnCounts = new Map<string, number>()
  let addOnRevenue = 0
  let addOnBookings = 0
  for (const b of live) {
    addOnRevenue += b.addOnsAmount
    if (b.addOns.length) addOnBookings++
    for (const code of new Set(b.addOns)) addOnCounts.set(code, (addOnCounts.get(code) ?? 0) + 1)
  }
  const addOnLabel = new Map(ADD_ONS.map((a) => [a.code, a.label]))

  const arrivalCount = (pick: (r: (typeof arrivals)[number]) => boolean) =>
    arrivals.filter(pick).reduce((s, r) => s + r._count._all, 0)
  const totalArrivals = arrivalCount(() => true)
  const noShows = arrivalCount((r) => r.status === 'NO_SHOW')

  const sources = (['ONLINE', 'WALK_IN'] as const).map((source) => {
    const mine = bookings.filter((b) => b.source === source)
    const mineLive = mine.filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW')
    return {
      source,
      bookings: mineLive.length,
      bookedValue: mineLive.reduce((s, b) => s + b.totalPrice, 0),
      collected: collectedBySource[source],
      roomNights: nightsBySource[source],
      roomRevenue: roomRevBySource[source],
      cancelled: mine.filter((b) => b.status === 'CANCELLED').length,
      noShows: arrivalCount((r) => r.status === 'NO_SHOW' && r.source === source),
    }
  })

  const occupancyPct = pct(roomNightsSold, availableRoomNights)

  return {
    from: fromKey,
    to: toKey,
    bookings: {
      daily: [...daily.values()],
      weekly: [...weekly.values()],
      monthly: [...monthly.values()],
    },
    revenue: [...rev.values()],
    revenueSeries: {
      daily: [...rev.values()],
      weekly: [...revWeekly.values()],
      monthly: [...revMonthly.values()],
    },
    occupancy,
    totals: {
      bookings: bookings.length,
      cancelled,
      noShows,
      collected,
      refunded,
      net: collected - refunded,
      avgOccupancy: Math.round(occupancyPct),
      bookedValue: live.reduce((s, b) => s + b.totalPrice, 0),
    },
    kpis: {
      roomNightsSold,
      availableRoomNights,
      blockedRoomNights,
      occupancy: occupancyPct,
      roomRevenue,
      adr: roomNightsSold ? Math.round(roomRevenue / roomNightsSold) : 0,
      revpar: availableRoomNights ? Math.round(roomRevenue / availableRoomNights) : 0,
      addOnRevenue,
      addOnBookings,
      cancellationRate: pct(cancelled, bookings.length),
      noShows,
      noShowRate: pct(noShows, totalArrivals),
      arrivals: totalArrivals,
    },
    byType: {
      rooms: live.filter((b) => b.type === 'ROOM').length,
      tables: live.filter((b) => b.type === 'TABLE').length,
      combined: live.filter((b) => b.type === 'ROOM_TABLE').length,
    },
    bySource: {
      online: sources[0].bookings,
      walkIn: sources[1].bookings,
      onlineValue: sources[0].bookedValue,
      walkInValue: sources[1].bookedValue,
    },
    sources,
    addOns: [...addOnCounts.entries()]
      .map(([code, n]) => ({ code, label: addOnLabel.get(code) ?? code, bookings: n }))
      .sort((a, b) => b.bookings - a.bookings),
    byPaymentStatus: [...byPaymentStatus.values()].sort((a, b) => b.count - a.count),
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
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
