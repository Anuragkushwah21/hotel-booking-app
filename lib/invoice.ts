/**
 * GST tax invoice for a booking — rendered by app/(site)/invoice/[id].
 *
 * Numbering: INV/<FY>/<6-digit sequence>, e.g. INV/2026-27/000042. The number
 * is assigned the first time an invoice is issued, under a row lock on the
 * booking, from a per-financial-year counter (InvoiceCounter), so numbers are
 * sequential and never reused.
 *
 * Tax lines use the split stored on the booking (Booking.taxBreakdown, written
 * at pricing time). Bookings priced before that field existed fall back to a
 * proportional split of taxAmount. CGST/SGST are shown as an equal split —
 * correct for an intra-state supply, which is what a hotel stay is.
 */

import { prisma } from './prisma'
import { getCurrentUser, isStaff } from './auth'
import { hasBookingAccessCookie } from './booking-access'
import { getHotelSettings } from './settings'
import { HOTEL } from './hotel'
import { ADD_ONS, nightsBetween, priceAddOns } from './booking-engine'
import { dateKey } from './format'
import type { TaxBreakdown } from './pricing'

export type InvoiceLine = {
  description: string
  sac: string
  quantity: number
  rate: number
  taxable: number
  gstPercent: number
  tax: number
  total: number
}

export type InvoiceData = {
  invoiceNo: string
  issuedAt: string
  seller: { name: string; legalName: string | null; gstin: string | null; address: string; phone: string; email: string }
  buyer: { name: string; email: string; phone: string | null }
  booking: {
    reference: string
    type: string
    checkInDate: string | null
    checkOutDate: string | null
    bookingDate: string | null
    roomName: string | null
    roomNo: string | null
    tableNo: string | null
    guestCount: number
  }
  lines: InvoiceLine[]
  totals: { taxable: number; cgst: number; sgst: number; tax: number; grandTotal: number; paid: number; balance: number; refunded: number }
  payments: { date: string; mode: string; kind: string; amount: number }[]
}

/** SAC codes for the services this hotel bills. */
const SAC = {
  ROOM: '996311', // accommodation services
  RESTAURANT: '996331', // food and beverage services
  TRANSPORT: '996601', // rental of vehicles with operator
  SPA: '999722', // beauty & wellness
} as const

const ADD_ON_SAC: Record<string, string> = {
  BREAKFAST: SAC.RESTAURANT,
  AIRPORT_PICKUP: SAC.TRANSPORT,
  AIRPORT_DROP: SAC.TRANSPORT,
  SPA: SAC.SPA,
  EXTRA_BED: SAC.ROOM,
  LATE_CHECKOUT: SAC.ROOM,
}

const INVOICEABLE = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as const

/** "2026-27" for any date from 1 Apr 2026 to 31 Mar 2027 (IST). */
export function fiscalYear(d: Date): string {
  const [y, m] = dateKey(d).split('-').map(Number)
  const start = m >= 4 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** Assign the booking its invoice number if it doesn't have one yet. */
export async function ensureInvoiceNumber(bookingId: string): Promise<{ invoiceNo: string; invoicedAt: Date }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { invoiceNo: true, invoicedAt: true },
    })
    if (booking.invoiceNo && booking.invoicedAt) {
      return { invoiceNo: booking.invoiceNo, invoicedAt: booking.invoicedAt }
    }

    const now = new Date()
    const fy = fiscalYear(now)
    const [{ last }] = await tx.$queryRaw<{ last: number }[]>`
      INSERT INTO "InvoiceCounter" ("fiscalYear", "last") VALUES (${fy}, 1)
      ON CONFLICT ("fiscalYear") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
      RETURNING "last"
    `
    const invoiceNo = `INV/${fy}/${String(Number(last)).padStart(6, '0')}`
    await tx.booking.update({ where: { id: bookingId }, data: { invoiceNo, invoicedAt: now } })
    return { invoiceNo, invoicedAt: now }
  })
}

/** Split `total` across `weights` in whole rupees, putting rounding on the largest share. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return weights.map(() => 0)
  const out = weights.map((w) => Math.floor((total * w) / sum))
  const rest = total - out.reduce((s, v) => s + v, 0)
  const biggest = weights.indexOf(Math.max(...weights))
  out[biggest] += rest
  return out
}

function line(description: string, sac: string, quantity: number, taxable: number, tax: number): InvoiceLine {
  return {
    description,
    sac,
    quantity,
    rate: quantity > 0 ? Math.round(taxable / quantity) : taxable,
    taxable,
    gstPercent: taxable > 0 ? Math.round((tax / taxable) * 1000) / 10 : 0,
    tax,
    total: taxable + tax,
  }
}

/**
 * Invoice for the current viewer: the guest who owns the booking, staff, or a
 * browser holding the booking's access cookie (set after OTP lookup or at
 * checkout). Null for anyone else, and for bookings that aren't confirmed.
 */
export async function getInvoiceForViewer(bookingId: string): Promise<InvoiceData | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      room: { select: { name: true, roomNo: true } },
      table: { select: { tableNo: true } },
      payments: { where: { status: 'SUCCEEDED' }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!booking) return null

  const user = await getCurrentUser()
  const allowed =
    user?.id === booking.userId || isStaff(user?.role) || (await hasBookingAccessCookie(booking.id))
  if (!allowed) return null
  if (!(INVOICEABLE as readonly string[]).includes(booking.status)) return null

  const [{ invoiceNo, invoicedAt }, settings] = await Promise.all([
    ensureInvoiceNumber(booking.id),
    getHotelSettings(),
  ])

  // ---- tax split ----
  const stored = booking.taxBreakdown as TaxBreakdown | null
  const breakdown: TaxBreakdown =
    stored && typeof stored.room === 'number'
      ? stored
      : (() => {
          const [room, table, addOns] = allocate(booking.taxAmount, [
            booking.roomAmount,
            booking.tableAmount,
            booking.addOnsAmount,
          ])
          return { room, table, addOns }
        })()

  // ---- lines ----
  const lines: InvoiceLine[] = []
  const nights =
    booking.checkInDate && booking.checkOutDate ? nightsBetween(booking.checkInDate, booking.checkOutDate) : 0

  if (booking.roomAmount > 0) {
    const roomLabel = booking.room ? `${booking.room.name}${booking.assignedRoomNo ? ` (Room ${booking.assignedRoomNo})` : ''}` : 'Room'
    lines.push(line(`Accommodation — ${roomLabel}`, SAC.ROOM, Math.max(1, nights), booking.roomAmount, breakdown.room))
  }
  if (booking.tableAmount > 0) {
    const guests = booking.tableGuestCount ?? booking.guestCount
    lines.push(
      line(`Restaurant table reservation${booking.table ? ` — Table ${booking.table.tableNo}` : ''}`, SAC.RESTAURANT, guests, booking.tableAmount, breakdown.table),
    )
  }
  if (booking.addOnsAmount > 0 && booking.addOns.length > 0) {
    const n = Math.max(1, nights)
    const amounts = booking.addOns.map((code) => priceAddOns([code], n, booking.guestCount))
    // Catalogue prices may have changed since booking; the stored amount wins.
    const taxable = allocate(booking.addOnsAmount, amounts.map((a) => Math.max(1, a)))
    const taxes = allocate(breakdown.addOns, taxable)
    booking.addOns.forEach((code, i) => {
      const meta = ADD_ONS.find((a) => a.code === code)
      lines.push(line(meta?.label ?? code, ADD_ON_SAC[code] ?? SAC.ROOM, 1, taxable[i], taxes[i]))
    })
  }

  // A negotiated walk-in rate (priceOverride) makes the total differ from the
  // priced lines; show the difference explicitly rather than silently.
  const linesTotal = lines.reduce((s, l) => s + l.total, 0)
  const adjustment = booking.totalPrice - linesTotal
  if (adjustment !== 0) {
    lines.push({
      description: adjustment < 0 ? 'Discount / negotiated rate' : 'Rate adjustment',
      sac: SAC.ROOM,
      quantity: 1,
      rate: adjustment,
      taxable: adjustment,
      gstPercent: 0,
      tax: 0,
      total: adjustment,
    })
  }

  const tax = lines.reduce((s, l) => s + l.tax, 0)
  const taxableTotal = lines.reduce((s, l) => s + l.taxable, 0)
  const cgst = Math.floor(tax / 2)
  const refunded = booking.payments.filter((p) => p.kind === 'REFUND').reduce((s, p) => s + p.amount, 0)

  return {
    invoiceNo,
    issuedAt: invoicedAt.toISOString(),
    seller: {
      name: HOTEL.name,
      legalName: settings.legalName,
      gstin: settings.gstin,
      address: HOTEL.contact.addressLines.join(', '),
      phone: HOTEL.contact.phone,
      email: HOTEL.contact.email,
    },
    buyer: { name: booking.guestName, email: booking.guestEmail, phone: booking.guestPhone },
    booking: {
      reference: booking.reference,
      type: booking.type,
      checkInDate: booking.checkInDate?.toISOString() ?? null,
      checkOutDate: booking.checkOutDate?.toISOString() ?? null,
      bookingDate: booking.bookingDate?.toISOString() ?? null,
      roomName: booking.room?.name ?? null,
      roomNo: booking.assignedRoomNo ?? booking.room?.roomNo ?? null,
      tableNo: booking.table?.tableNo ?? null,
      guestCount: booking.guestCount,
    },
    lines,
    totals: {
      taxable: taxableTotal,
      cgst,
      sgst: tax - cgst,
      tax,
      grandTotal: booking.totalPrice,
      paid: booking.paidAmount,
      balance: Math.max(0, booking.totalPrice - booking.paidAmount),
      refunded,
    },
    payments: booking.payments.map((p) => ({
      date: (p.paidAt ?? p.createdAt).toISOString(),
      mode: p.mode,
      kind: p.kind,
      amount: p.amount,
    })),
  }
}
