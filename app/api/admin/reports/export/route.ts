import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dateKey, formatDateTime, istDayBounds } from '@/lib/format'
import { buildReport, rangeFromParams, realBookings } from '@/lib/admin-stats'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// BOM so Excel opens the ₹ headers as UTF-8.
const toCsv = (rows: unknown[][]) => '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n')

const csvResponse = (csv: string, filename: string) =>
  new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })

/**
 * GET /api/admin/reports/export?from=&to=[&kind=summary] (ADMIN)
 *   default        bookings created in range, one row each
 *   kind=summary   one row per IST day (bookings, ledger revenue, occupancy)
 *                  followed by the range KPIs
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { from, to } = rangeFromParams(req.nextUrl.searchParams)

  if (req.nextUrl.searchParams.get('kind') === 'summary') {
    const r = await buildReport(from, to)
    const occ = new Map(r.occupancy.map((o) => [o.key, o]))
    const rows: unknown[][] = [
      ['Date', 'Bookings', 'Online', 'Walk-in', 'Collected ₹', 'Refunded ₹', 'Net ₹', 'Rooms occupied', 'Rooms available', 'Occupancy %'],
      ...r.bookings.daily.map((d, i) => {
        const rev = r.revenueSeries.daily[i]
        const o = occ.get(d.key)
        return [d.key, d.total, d.online, d.walkIn, rev?.collected ?? 0, rev?.refunded ?? 0, rev?.net ?? 0, o?.occupied ?? '', o?.available ?? '', o?.rate ?? '']
      }),
      [],
      ['Metric', 'Value'],
      ['Range', `${from} to ${to}`],
      ['Bookings', r.totals.bookings],
      ['Cancelled', r.totals.cancelled],
      ['Cancellation rate %', r.kpis.cancellationRate],
      ['No-shows (arrivals in range)', r.kpis.noShows],
      ['No-show rate %', r.kpis.noShowRate],
      ['Collected ₹', r.totals.collected],
      ['Refunded ₹', r.totals.refunded],
      ['Net revenue ₹', r.totals.net],
      ['Room-nights sold', r.kpis.roomNightsSold],
      ['Available room-nights', r.kpis.availableRoomNights],
      ['Occupancy %', r.kpis.occupancy],
      ['Room revenue ₹', r.kpis.roomRevenue],
      ['ADR ₹', r.kpis.adr],
      ['RevPAR ₹', r.kpis.revpar],
      ['Add-on revenue ₹', r.kpis.addOnRevenue],
      ...r.sources.flatMap((s) => [
        [`${s.source} bookings`, s.bookings],
        [`${s.source} booked value ₹`, s.bookedValue],
        [`${s.source} collected ₹`, s.collected],
      ]),
    ]
    return csvResponse(toCsv(rows), `summary-${from}-to-${to}.csv`)
  }

  const bookings = await prisma.booking.findMany({
    where: {
      AND: [realBookings],
      createdAt: { gte: istDayBounds(from).start, lt: istDayBounds(to).end },
    },
    orderBy: { createdAt: 'asc' },
    include: { room: { select: { name: true, roomNo: true, type: true } }, table: { select: { tableNo: true } } },
  })

  const header = [
    'Booking', 'Created', 'Type', 'Source', 'Status', 'Payment', 'Refund status', 'Guest', 'Email', 'Phone',
    'Room', 'Room no', 'Room type', 'Table', 'Check-in', 'Check-out', 'Table slot', 'Guests',
    'Room ₹', 'Table ₹', 'Add-ons ₹', 'Tax ₹', 'Total ₹', 'Paid ₹', 'Remaining ₹', 'Refund ₹', 'Mode',
  ]
  const rows = bookings.map((b) => [
    b.reference, formatDateTime(b.createdAt), b.type, b.source, b.status, b.paymentStatus, b.refundStatus,
    b.guestName, b.guestEmail, b.guestPhone, b.room?.name, b.assignedRoomNo ?? b.room?.roomNo, b.room?.type,
    b.table?.tableNo, b.checkInDate ? dateKey(b.checkInDate) : '', b.checkOutDate ? dateKey(b.checkOutDate) : '',
    b.bookingDate ? formatDateTime(b.bookingDate) : '', b.guestCount,
    b.roomAmount, b.tableAmount, b.addOnsAmount, b.taxAmount, b.totalPrice, b.paidAmount, b.remainingAmount,
    b.refundAmount, b.paymentMode,
  ])

  return csvResponse(toCsv([header, ...rows]), `bookings-${from}-to-${to}.csv`)
}
