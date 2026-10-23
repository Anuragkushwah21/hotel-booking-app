/**
 * Shared booking engine.
 *
 * Both the public website (source: ONLINE) and the admin dashboard
 * (source: WALK_IN) create bookings through these functions. There is no
 * second code path, which is what keeps the two channels on one inventory.
 *
 * Double-booking prevention
 * -------------------------
 * Availability check and insert run inside one transaction, and the
 * transaction takes a row lock on the room (or the candidate tables) with
 * SELECT ... FOR UPDATE before it reads bookings. Two concurrent requests for
 * the same room therefore serialise: the second one sees the first one's row
 * and is rejected. A bare read-then-write, which is what the previous code
 * did, lets both succeed.
 *
 * Online bookings and payment
 * ----------------------------
 * An ONLINE booking is created PENDING purely as a payment hold. It becomes
 * CONFIRMED automatically when the gateway reports success
 * (lib/payment-confirmation.ts) — staff never approve online bookings.
 *
 * Auto-release
 * ------------
 * An unpaid ONLINE booking carries `holdExpiresAt`. Expired holds are excluded
 * from the blocking set by `blockingBookingFilter()`, so the room frees itself
 * with no cron job required. `releaseExpiredHolds()` exists to tidy the rows
 * (and to fire cancellation notices), not to make the inventory correct.
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  BookingSource,
  BookingType,
  PaymentMode,
  PaymentStatus,
} from '@prisma/client'
import { prisma } from './prisma'
import { getHotelSettings, getPricingCalendar } from './settings'
import { priceTable, quoteStay, quoteTableOnly } from './pricing'

type Tx = Prisma.TransactionClient

/** How long an unpaid online booking holds inventory. */
export const ONLINE_HOLD_MINUTES = 15

/** A table reservation occupies its table for this long. */
export const TABLE_SLOT_HOURS = 2

/**
 * Default per-guest charge for a table reservation, in whole INR. The live
 * value is HotelSettings.tablePricePerGuest (Admin → Settings).
 */
export const TABLE_PRICE_PER_GUEST = 500

// ------------------------------------------------------------------
// Add-on catalogue
// ------------------------------------------------------------------

export type AddOn = {
  code: string
  label: string
  /** Whole INR. */
  price: number
  /** How `price` multiplies out across the stay. */
  per: 'BOOKING' | 'NIGHT' | 'GUEST_NIGHT'
  /** Shown on the services page and in the booking picker. */
  description: string
  /** lucide-react icon name, resolved client-side. */
  icon: string
}

/**
 * The billable services catalogue. This is the pricing source of truth — the
 * public site and the admin walk-in form both read it through /api/services,
 * and totals are always recomputed here server-side.
 */
export const ADD_ONS: AddOn[] = [
  {
    code: 'BREAKFAST', label: 'Breakfast buffet', price: 350, per: 'GUEST_NIGHT',
    icon: 'Croissant',
    description: 'Full buffet at The Courtyard, 7:00–10:30 AM. Live counters, South Indian and continental.',
  },
  {
    code: 'AIRPORT_PICKUP', label: 'Airport pickup', price: 1200, per: 'BOOKING',
    icon: 'PlaneLanding',
    description: 'A driver meets you at arrivals with a name board. Share your flight number at checkout.',
  },
  {
    code: 'AIRPORT_DROP', label: 'Airport drop', price: 1200, per: 'BOOKING',
    icon: 'PlaneTakeoff',
    description: 'Private car to the airport, timed to your departure.',
  },
  {
    code: 'SPA', label: 'Spa session', price: 2000, per: 'BOOKING',
    icon: 'Flower2',
    description: '60-minute therapeutic massage at our in-house spa. Booked on arrival for a slot that suits you.',
  },
  {
    code: 'EXTRA_BED', label: 'Extra bed', price: 800, per: 'NIGHT',
    icon: 'BedSingle',
    description: 'A comfortable rollaway bed with fresh linen, added to your room.',
  },
  {
    code: 'LATE_CHECKOUT', label: 'Late checkout', price: 1000, per: 'BOOKING',
    icon: 'Clock',
    description: 'Keep the room until 4:00 PM instead of 11:00 AM. Guaranteed when booked in advance.',
  },
]

/** Human-readable pricing unit, e.g. "per guest, per night". */
export function addOnUnitLabel(per: AddOn['per']): string {
  switch (per) {
    case 'BOOKING': return 'one-time'
    case 'NIGHT': return 'per night'
    case 'GUEST_NIGHT': return 'per guest, per night'
  }
}

const ADD_ON_BY_CODE = new Map(ADD_ONS.map((a) => [a.code, a]))

export function priceAddOns(codes: string[], nights: number, guests: number): number {
  return codes.reduce((sum, code) => {
    const addOn = ADD_ON_BY_CODE.get(code)
    if (!addOn) return sum
    switch (addOn.per) {
      case 'BOOKING':
        return sum + addOn.price
      case 'NIGHT':
        return sum + addOn.price * nights
      case 'GUEST_NIGHT':
        return sum + addOn.price * nights * guests
    }
  }, 0)
}

export function validAddOnCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return []
  return codes.filter((c): c is string => typeof c === 'string' && ADD_ON_BY_CODE.has(c))
}

// ------------------------------------------------------------------
// Errors
// ------------------------------------------------------------------

export class BookingError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'BOOKING_ERROR',
  ) {
    super(message)
    this.name = 'BookingError'
  }
}

// ------------------------------------------------------------------
// Date helpers
// ------------------------------------------------------------------

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((startOfDay(checkOut).getTime() - startOfDay(checkIn).getTime()) / MS_PER_DAY)
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function endOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function parseDate(value: unknown, field: string): Date {
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) {
    throw new BookingError(`Invalid ${field}`, 400, 'INVALID_DATE')
  }
  return d
}

// ------------------------------------------------------------------
// Availability
// ------------------------------------------------------------------

/** Booking types that occupy a room / a table. ROOM_TABLE occupies both. */
export const ROOM_BOOKING_TYPES: BookingType[] = ['ROOM', 'ROOM_TABLE']
export const TABLE_BOOKING_TYPES: BookingType[] = ['TABLE', 'ROOM_TABLE']

/** Cancel reasons written when an unpaid online hold lapses (not a real cancellation). */
export const HOLD_EXPIRED_REASONS = [
  'Payment not completed within the hold window',
  'Checkout session expired',
]

/**
 * Bookings that currently hold inventory.
 *
 * CONFIRMED and CHECKED_IN always block. PENDING blocks only while its hold is
 * still live — that is what auto-releases abandoned online checkouts. Walk-in
 * bookings never carry a hold, so `holdExpiresAt IS NULL` keeps them blocking.
 */
export function blockingBookingFilter(now = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      {
        status: 'PENDING',
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
      },
    ],
  }
}

/**
 * Half-open interval overlap: [checkIn, checkOut) vs [existing.in, existing.out).
 * Same-day checkout/check-in is therefore NOT a conflict, which is the correct
 * hotel semantics.
 */
function roomOverlapFilter(checkIn: Date, checkOut: Date): Prisma.BookingWhereInput {
  return {
    checkInDate: { lt: checkOut },
    checkOutDate: { gt: checkIn },
  }
}

/** A table is busy if any live booking starts within a slot-length either side. */
function tableSlotFilter(slotStart: Date): Prisma.BookingWhereInput {
  const slotMs = TABLE_SLOT_HOURS * 60 * 60 * 1000
  return {
    bookingDate: {
      gt: new Date(slotStart.getTime() - slotMs),
      lt: new Date(slotStart.getTime() + slotMs),
    },
  }
}

export type RoomAvailability = {
  available: boolean
  reason?: string
  conflictingBookingId?: string
}

/**
 * Read-only availability probe. Safe to call from a search page.
 * `excludeBookingId` lets a modify-booking flow ignore its own row.
 */
export async function checkRoomAvailability(
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  opts: { excludeBookingId?: string; client?: Tx | PrismaClient } = {},
): Promise<RoomAvailability> {
  const db = (opts.client ?? prisma) as Tx
  const now = new Date()

  const room = await db.room.findUnique({
    where: { id: roomId },
    select: { id: true, status: true },
  })
  if (!room) throw new BookingError('Room not found', 404, 'ROOM_NOT_FOUND')

  if (room.status === 'MAINTENANCE') {
    return { available: false, reason: 'Room is under maintenance' }
  }

  // Date-ranged maintenance block
  const block = await db.roomBlock.findFirst({
    where: { roomId, startDate: { lt: checkOut }, endDate: { gt: checkIn } },
    select: { id: true, reason: true },
  })
  if (block) {
    return {
      available: false,
      reason: block.reason
        ? `Room is blocked for these dates: ${block.reason}`
        : 'Room is blocked for these dates',
    }
  }

  const conflict = await db.booking.findFirst({
    where: {
      roomId,
      type: { in: ROOM_BOOKING_TYPES },
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      AND: [blockingBookingFilter(now), roomOverlapFilter(checkIn, checkOut)],
    },
    select: { id: true },
  })

  if (conflict) {
    return {
      available: false,
      reason: 'Room is already booked for the selected dates',
      conflictingBookingId: conflict.id,
    }
  }

  return { available: true }
}

/** Is this one table free for the slot? Used when confirming a paid booking. */
export async function isTableFree(
  tableId: string,
  slotStart: Date,
  opts: { excludeBookingId?: string; client?: Tx | PrismaClient } = {},
): Promise<boolean> {
  const db = (opts.client ?? prisma) as Tx
  const table = await db.table.findUnique({ where: { id: tableId }, select: { status: true } })
  if (!table || table.status === 'MAINTENANCE') return false
  const conflict = await db.booking.findFirst({
    where: {
      tableId,
      type: { in: TABLE_BOOKING_TYPES },
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      AND: [blockingBookingFilter(), tableSlotFilter(slotStart)],
    },
    select: { id: true },
  })
  return !conflict
}

/** Rooms free for the whole window, honouring both channels' bookings. */
export async function findAvailableRooms(
  checkIn: Date,
  checkOut: Date,
  filters: { minCapacity?: number; acType?: string; type?: string; maxPrice?: number } = {},
) {
  const now = new Date()

  const busyRoomIds = await prisma.booking.findMany({
    where: {
      type: { in: ROOM_BOOKING_TYPES },
      roomId: { not: null },
      AND: [blockingBookingFilter(now), roomOverlapFilter(checkIn, checkOut)],
    },
    select: { roomId: true },
  })

  const blockedRoomIds = await prisma.roomBlock.findMany({
    where: { startDate: { lt: checkOut }, endDate: { gt: checkIn } },
    select: { roomId: true },
  })

  const excluded = [
    ...busyRoomIds.map((b) => b.roomId!),
    ...blockedRoomIds.map((b) => b.roomId),
  ]

  return prisma.room.findMany({
    where: {
      status: 'AVAILABLE',
      ...(excluded.length ? { id: { notIn: excluded } } : {}),
      ...(filters.minCapacity ? { capacity: { gte: filters.minCapacity } } : {}),
      ...(filters.acType ? { acType: filters.acType } : {}),
      ...(filters.type ? { type: { contains: filters.type, mode: 'insensitive' } } : {}),
      ...(filters.maxPrice ? { price: { lte: filters.maxPrice } } : {}),
    },
    orderBy: { price: 'asc' },
  })
}

/**
 * Tables free for the two-hour slot starting at `date`+`time`.
 *
 * Read-only sibling of the allocation inside the create functions, so what a
 * form shows and what the booking accepts can't drift apart.
 */
export async function findAvailableTables(
  date: string,
  time: string,
  guestCount = 1,
  opts: { excludeBookingId?: string } = {},
) {
  const slotStart = parseSlot(date, time)
  const slotEnd = new Date(slotStart.getTime() + TABLE_SLOT_HOURS * 60 * 60 * 1000)
  const seats = Math.max(1, Number(guestCount) || 1)

  const candidates = await prisma.table.findMany({
    where: { status: 'AVAILABLE', capacity: { gte: seats } },
    orderBy: { capacity: 'asc' }, // smallest table that fits comes first
    select: { id: true, tableNo: true, capacity: true, location: true },
  })

  const conflicts = await prisma.booking.findMany({
    where: {
      type: { in: TABLE_BOOKING_TYPES },
      tableId: { in: candidates.map((c) => c.id) },
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      AND: [blockingBookingFilter(), tableSlotFilter(slotStart)],
    },
    select: { tableId: true },
  })

  const taken = new Set(conflicts.map((c) => c.tableId))
  return {
    slotStart,
    slotEnd,
    tables: candidates.filter((c) => !taken.has(c.id)),
  }
}

/**
 * Pick and lock a free table inside a booking transaction. Returns null when
 * nothing fits — the caller decides whether that's fatal (table-only booking)
 * or just means "no table add-on" (room booking).
 */
async function allocateTable(
  tx: Tx,
  slotStart: Date,
  guestCount: number,
  tableId?: string | null,
): Promise<{ id: string; tableNo: string } | null> {
  const candidates = await tx.table.findMany({
    where: {
      status: 'AVAILABLE',
      capacity: { gte: guestCount },
      ...(tableId ? { id: tableId } : {}),
    },
    orderBy: { capacity: 'asc' }, // smallest table that fits
    select: { id: true },
  })
  if (candidates.length === 0) return null

  // Lock every candidate so a concurrent request cannot claim one between
  // our conflict check and our insert.
  await tx.$queryRaw`
    SELECT id FROM "Table"
    WHERE id IN (${Prisma.join(candidates.map((c) => c.id))})
    FOR UPDATE
  `

  const conflicts = await tx.booking.findMany({
    where: {
      type: { in: TABLE_BOOKING_TYPES },
      tableId: { in: candidates.map((c) => c.id) },
      AND: [blockingBookingFilter(), tableSlotFilter(slotStart)],
    },
    select: { tableId: true },
  })

  const taken = new Set(conflicts.map((c) => c.tableId))
  const chosenId = candidates.find((c) => !taken.has(c.id))?.id
  if (!chosenId) return null
  return tx.table.findUniqueOrThrow({ where: { id: chosenId }, select: { id: true, tableNo: true } })
}

function parseSlot(date: string, time: string): Date {
  // Table slots are wall-clock times at the hotel.
  return parseDate(`${date}T${time}:00+05:30`, 'date or time')
}

// ------------------------------------------------------------------
// Quotes
// ------------------------------------------------------------------

export type TableRequest = {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  time: string
  guestCount: number
  tableId?: string | null
}

/** Read-only price + payment-rule quote for a stay, used by /api/quote. */
export async function quoteRoomBooking(input: {
  roomId: string
  checkInDate: string | Date
  checkOutDate: string | Date
  guestCount: number
  addOns?: string[]
  table?: TableRequest | null
}) {
  const checkIn = parseDate(input.checkInDate, 'check-in date')
  const checkOut = parseDate(input.checkOutDate, 'check-out date')
  const nights = nightsBetween(checkIn, checkOut)
  if (nights <= 0) throw new BookingError('Stay must be at least one night', 400, 'INVALID_RANGE')

  const room = await prisma.room.findUnique({ where: { id: input.roomId } })
  if (!room) throw new BookingError('Room not found', 404, 'ROOM_NOT_FOUND')

  const guestCount = Math.max(1, Number(input.guestCount) || 1)
  const [settings, calendar, availability] = await Promise.all([
    getHotelSettings(),
    getPricingCalendar(checkIn, checkOut),
    checkRoomAvailability(room.id, checkIn, checkOut),
  ])

  let table: { available: boolean; tableNo?: string; reason?: string } | null = null
  if (input.table) {
    const tableGuests = Math.max(1, Number(input.table.guestCount) || guestCount)
    const { tables } = await findAvailableTables(input.table.date, input.table.time, tableGuests)
    const pick = input.table.tableId ? tables.find((t) => t.id === input.table!.tableId) : tables[0]
    table = pick
      ? { available: true, tableNo: pick.tableNo }
      : { available: false, reason: 'No table is free at that time' }
  }

  const quote = quoteStay({
    room,
    checkIn,
    nights,
    addOnsAmount: priceAddOns(validAddOnCodes(input.addOns), nights, guestCount),
    table: table?.available
      ? priceTable(input.table!.guestCount || guestCount, settings)
      : null,
    settings,
    calendar,
  })

  return { room, nights, availability, table, quote }
}

// ------------------------------------------------------------------
// Booking creation
// ------------------------------------------------------------------

/** How a walk-in was settled at the desk. Ignored for ONLINE bookings. */
export type DeskSettlement = {
  paymentMode?: PaymentMode
  paymentStatus?: PaymentStatus
  /** Required for PARTIALLY_PAID; whole INR. */
  amountPaid?: number | null
}

export type CreateRoomBookingInput = {
  roomId: string
  /** Guest the booking belongs to. For walk-ins this is the resolved/created guest. */
  userId: string
  checkInDate: string | Date
  checkOutDate: string | Date
  guestCount: number
  guestName: string
  guestEmail: string
  guestPhone?: string | null
  specialRequest?: string | null
  addOns?: string[]
  source: BookingSource
  /** Manager id — required for WALK_IN, must be absent for ONLINE. */
  bookedById?: string | null
  /**
   * Optional table add-on. When `required` is false (the default) and no
   * table is free, the room is still booked and `tableSkipped` explains why.
   */
  table?: (TableRequest & { required?: boolean }) | null
  /** Manager override of the computed grand total (e.g. a negotiated walk-in rate). */
  priceOverride?: number | null
  adminNotes?: string | null
} & DeskSettlement

export async function createRoomBooking(input: CreateRoomBookingInput) {
  const checkIn = parseDate(input.checkInDate, 'check-in date')
  const checkOut = parseDate(input.checkOutDate, 'check-out date')

  if (checkIn >= checkOut) {
    throw new BookingError('Check-out must be after check-in', 400, 'INVALID_RANGE')
  }

  const nights = nightsBetween(checkIn, checkOut)
  if (nights <= 0) {
    throw new BookingError('Stay must be at least one night', 400, 'INVALID_RANGE')
  }

  const guestCount = Math.max(1, Number(input.guestCount) || 1)
  const addOns = validAddOnCodes(input.addOns)

  assertSourceIntegrity(input.source, input.bookedById)

  return prisma.$transaction(
    async (tx) => {
      // Serialise concurrent bookings of this room. Everything below reads a
      // consistent view because no other transaction can hold this row.
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${input.roomId} FOR UPDATE`

      const room = await tx.room.findUnique({ where: { id: input.roomId } })
      if (!room) throw new BookingError('Room not found', 404, 'ROOM_NOT_FOUND')

      if (guestCount > room.capacity) {
        throw new BookingError(
          `Room ${room.roomNo} holds ${room.capacity} guest(s)`,
          400,
          'OVER_CAPACITY',
        )
      }

      const availability = await checkRoomAvailability(input.roomId, checkIn, checkOut, {
        client: tx,
      })
      if (!availability.available) {
        throw new BookingError(availability.reason ?? 'Room unavailable', 409, 'UNAVAILABLE')
      }

      // Optional table leg — never allowed to sink the room booking unless the
      // caller explicitly asked for it to be required.
      let table: { id: string; tableNo: string } | null = null
      let tableSlot: Date | null = null
      let tableGuests: number | null = null
      let tableSkipped: string | null = null
      if (input.table) {
        tableGuests = Math.max(1, Number(input.table.guestCount) || guestCount)
        tableSlot = parseSlot(input.table.date, input.table.time)
        table = await allocateTable(tx, tableSlot, tableGuests, input.table.tableId)
        if (!table) {
          if (input.table.required) {
            throw new BookingError('No table available at the selected time', 409, 'NO_SLOT')
          }
          tableSkipped = 'No table was free at the selected time, so the room was booked on its own.'
        }
      }

      const [settings, calendar] = await Promise.all([
        getHotelSettings(tx),
        getPricingCalendar(checkIn, checkOut, tx),
      ])

      // Price is always computed server-side. A client-supplied total is never
      // trusted; a manager may override, and that override is audited.
      const addOnsAmount = priceAddOns(addOns, nights, guestCount)
      const quote = quoteStay({
        room,
        checkIn,
        nights,
        addOnsAmount,
        table: table ? priceTable(tableGuests!, settings) : null,
        settings,
        calendar,
      })

      const totalPrice =
        input.priceOverride != null && input.priceOverride >= 0
          ? Math.round(input.priceOverride)
          : quote.total

      const money = settle(input, totalPrice, quote.dueNow)

      const booking = await tx.booking.create({
        data: {
          type: table ? 'ROOM_TABLE' : 'ROOM',
          source: input.source,
          bookedById: input.bookedById ?? null,
          userId: input.userId,
          roomId: room.id,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          ...(table ? { tableId: table.id, bookingDate: tableSlot, tableGuestCount: tableGuests } : {}),
          guestCount,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone ?? null,
          specialRequest: input.specialRequest ?? null,
          adminNotes: input.adminNotes ?? null,
          addOns,
          roomAmount: quote.roomAmount,
          tableAmount: quote.tableAmount,
          baseAmount: quote.roomAmount + quote.tableAmount,
          addOnsAmount,
          taxAmount: quote.taxAmount,
          totalPrice,
          paymentRule: input.source === 'ONLINE' ? quote.rule : 'DESK',
          ...money.bookingFields,
          // Walk-ins carry the room number from the moment the desk creates them.
          ...(input.source === 'WALK_IN'
            ? { assignedRoomNo: room.roomNo, confirmedAt: new Date() }
            : {}),
        },
        include: { room: true, table: true },
      })

      await money.recordLedger(tx, booking.id)

      return { booking, nights, computedTotal: quote.total, quote, tableSkipped }
    },
    { timeout: 15000, maxWait: 10000 },
  )
}

export type CreateTableBookingInput = {
  userId: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  time: string
  guestCount: number
  guestName: string
  guestEmail: string
  guestPhone?: string | null
  specialRequest?: string | null
  addOns?: string[]
  source: BookingSource
  bookedById?: string | null
  /** Pin a specific table (walk-in: "seat them at table 7"). */
  tableId?: string | null
  priceOverride?: number | null
  adminNotes?: string | null
} & DeskSettlement

export async function createTableBooking(input: CreateTableBookingInput) {
  const slotStart = parseSlot(input.date, input.time)
  const guestCount = Math.max(1, Number(input.guestCount) || 1)
  const addOns = validAddOnCodes(input.addOns)

  assertSourceIntegrity(input.source, input.bookedById)

  return prisma.$transaction(
    async (tx) => {
      const table = await allocateTable(tx, slotStart, guestCount, input.tableId)
      if (!table) {
        throw new BookingError('No table available at the selected time', 409, 'NO_SLOT')
      }

      const settings = await getHotelSettings(tx)
      const addOnsAmount = priceAddOns(addOns, 1, guestCount)
      const quote = quoteTableOnly(guestCount, addOnsAmount, settings)
      const totalPrice =
        input.priceOverride != null && input.priceOverride >= 0
          ? Math.round(input.priceOverride)
          : quote.total

      const money = settle(input, totalPrice, totalPrice)

      const booking = await tx.booking.create({
        data: {
          type: 'TABLE',
          source: input.source,
          bookedById: input.bookedById ?? null,
          userId: input.userId,
          tableId: table.id,
          bookingDate: slotStart,
          guestCount,
          tableGuestCount: guestCount,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone ?? null,
          specialRequest: input.specialRequest ?? null,
          adminNotes: input.adminNotes ?? null,
          addOns,
          tableAmount: quote.tableAmount,
          baseAmount: quote.tableAmount,
          addOnsAmount,
          taxAmount: quote.taxAmount,
          totalPrice,
          paymentRule: input.source === 'ONLINE' ? quote.rule : 'DESK',
          ...money.bookingFields,
          ...(input.source === 'WALK_IN' ? { confirmedAt: new Date() } : {}),
        },
        include: { table: true, room: true },
      })

      await money.recordLedger(tx, booking.id)

      return { booking, computedTotal: quote.total, quote }
    },
    { timeout: 15000, maxWait: 10000 },
  )
}

/**
 * Money fields for a new booking.
 *
 * ONLINE: nothing is paid yet. The booking is PENDING only as a short payment
 * hold — it confirms itself the moment the gateway reports success (see
 * lib/payment-confirmation.ts). No staff approval is involved.
 *
 * WALK_IN: confirmed on the spot; whatever the desk collected is written to the
 * Payment ledger.
 */
function settle(input: { source: BookingSource } & DeskSettlement, total: number, dueNow: number) {
  if (input.source === 'ONLINE') {
    return {
      bookingFields: {
        status: 'PENDING' as const,
        paymentStatus: 'PENDING' as const,
        paymentMode: 'ONLINE' as const,
        advanceAmount: dueNow,
        paidAmount: 0,
        remainingAmount: total,
        holdExpiresAt: new Date(Date.now() + ONLINE_HOLD_MINUTES * 60 * 1000),
      },
      recordLedger: async () => {},
    }
  }

  const mode = input.paymentMode ?? 'CASH'
  const status = input.paymentStatus ?? 'PENDING'
  let paid = 0
  if (status === 'PAID') paid = total
  else if (status === 'PARTIALLY_PAID') {
    paid = Math.round(Number(input.amountPaid))
    if (!Number.isFinite(paid) || paid <= 0 || paid >= total) {
      throw new BookingError(
        'A part payment must be more than ₹0 and less than the total',
        400,
        'INVALID_AMOUNT',
      )
    }
  }

  return {
    bookingFields: {
      status: 'CONFIRMED' as const,
      paymentStatus: (paid === 0 ? 'PENDING' : paid >= total ? 'PAID' : 'PARTIALLY_PAID') as PaymentStatus,
      paymentMode: mode,
      advanceAmount: paid,
      paidAmount: paid,
      remainingAmount: total - paid,
      holdExpiresAt: null,
    },
    recordLedger: async (tx: Tx, bookingId: string) => {
      if (paid <= 0) return
      await tx.payment.create({
        data: {
          bookingId,
          kind: paid >= total ? 'FULL' : 'ADVANCE',
          status: 'SUCCEEDED',
          mode,
          amount: paid,
          gateway: 'DESK',
          recordedById: input.source === 'WALK_IN' ? (input as any).bookedById ?? null : null,
          paidAt: new Date(),
        },
      })
    },
  }
}

function assertSourceIntegrity(source: BookingSource, bookedById?: string | null) {
  if (source === 'WALK_IN' && !bookedById) {
    throw new BookingError('Walk-in bookings must record the manager', 500, 'MISSING_MANAGER')
  }
  if (source === 'ONLINE' && bookedById) {
    throw new BookingError('Online bookings must not set bookedBy', 500, 'UNEXPECTED_MANAGER')
  }
}

// ------------------------------------------------------------------
// Hold expiry sweep
// ------------------------------------------------------------------

/**
 * Marks abandoned online holds as cancelled. Inventory is already free at this
 * point (see `blockingBookingFilter`); this just stops the rows looking
 * pending forever. Call from a cron / route handler.
 */
export async function releaseExpiredHolds(): Promise<{ released: number }> {
  const result = await prisma.booking.updateMany({
    where: {
      status: 'PENDING',
      source: 'ONLINE',
      paidAmount: 0,
      holdExpiresAt: { lt: new Date() },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: HOLD_EXPIRED_REASONS[0],
    },
  })
  return { released: result.count }
}
