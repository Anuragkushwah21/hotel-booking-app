import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dateKey, formatDateTime, istDayBounds } from '@/lib/format'
import { rangeFromParams, realBookings } from '@/lib/admin-stats'

/** GET /api/admin/reports/export?from=&to= — bookings created in range, as CSV (ADMIN). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { from, to } = rangeFromParams(req.nextUrl.searchParams)
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
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = bookings.map((b) => [
    b.reference, formatDateTime(b.createdAt), b.type, b.source, b.status, b.paymentStatus, b.refundStatus,
    b.guestName, b.guestEmail, b.guestPhone, b.room?.name, b.assignedRoomNo ?? b.room?.roomNo, b.room?.type,
    b.table?.tableNo, b.checkInDate ? dateKey(b.checkInDate) : '', b.checkOutDate ? dateKey(b.checkOutDate) : '',
    b.bookingDate ? formatDateTime(b.bookingDate) : '', b.guestCount,
    b.roomAmount, b.tableAmount, b.addOnsAmount, b.taxAmount, b.totalPrice, b.paidAmount, b.remainingAmount,
    b.refundAmount, b.paymentMode,
  ])

  // BOM so Excel opens the ₹ headers as UTF-8.
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookings-${from}-to-${to}.csv"`,
    },
  })
}
