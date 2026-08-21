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

type Tx = Prisma.TransactionClient

/** How long an unpaid online booking holds inventory. */
export const ONLINE_HOLD_MINUTES = 15

/** A table reservation occupies its table for this long. */
export const TABLE_SLOT_HOURS = 2

/** Per-guest charge for a table reservation, in whole INR. */
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
      type: 'ROOM',
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

/** Rooms free for the whole window, honouring both channels' bookings. */
export async function findAvailableRooms(
  checkIn: Date,
  checkOut: Date,
  filters: { minCapacity?: number; acType?: string; type?: string; maxPrice?: number } = {},
) {
  const now = new Date()

  const busyRoomIds = await prisma.booking.findMany({
    where: {
      type: 'ROOM',
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
 * Read-only sibling of the conflict check inside `createTableBooking`, so what
 * a form shows and what the booking accepts can't drift apart. A table is busy
 * if any live booking starts within a slot-length either side of this one.
 */
export async function findAvailableTables(
  date: string,
  time: string,
  guestCount = 1,
  opts: { excludeBookingId?: string } = {},
) {
  const slotStart = parseDate(`${date}T${time}:00`, 'date or time')
  const slotEnd = new Date(slotStart.getTime() + TABLE_SLOT_HOURS * 60 * 60 * 1000)
  const seats = Math.max(1, Number(guestCount) || 1)

  const candidates = await prisma.table.findMany({
    where: { status: 'AVAILABLE', capacity: { gte: seats } },
    orderBy: { capacity: 'asc' }, // smallest table that fits comes first
    select: { id: true, tableNo: true, capacity: true, location: true },
  })

  const conflicts = await prisma.booking.findMany({
    where: {
      type: 'TABLE',
      tableId: { in: candidates.map((c) => c.id) },
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      AND: [
        blockingBookingFilter(),
        {
          bookingDate: {
            gt: new Date(slotStart.getTime() - TABLE_SLOT_HOURS * 60 * 60 * 1000),
            lt: slotEnd,
          },
        },
      ],
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

// ------------------------------------------------------------------
// Booking creation
// ------------------------------------------------------------------

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
  paymentMode?: PaymentMode
  paymentStatus?: PaymentStatus
  /** Manager override of the computed total (e.g. a negotiated walk-in rate). */
  priceOverride?: number | null
}

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

      // Price is always computed server-side. A client-supplied total is never
      // trusted; a manager may override, and that override is audited.
      const baseAmount = nights * room.price
      const addOnsAmount = priceAddOns(addOns, nights, guestCount)
      const computed = baseAmount + addOnsAmount
      const totalPrice =
        input.priceOverride != null && input.priceOverride >= 0
          ? Math.round(input.priceOverride)
          : computed

      const isOnline = input.source === 'ONLINE'
      const paymentStatus = input.paymentStatus ?? 'PENDING'

      const booking = await tx.booking.create({
        data: {
          type: 'ROOM',
          source: input.source,
          bookedById: input.bookedById ?? null,
          userId: input.userId,
          roomId: room.id,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          guestCount,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone ?? null,
          specialRequest: input.specialRequest ?? null,
          addOns,
          baseAmount,
          addOnsAmount,
          totalPrice,
          paymentMode: input.paymentMode ?? (isOnline ? 'ONLINE' : 'CASH'),
          paymentStatus,
          // Walk-ins are taken at the desk and confirmed immediately.
          status: isOnline ? 'PENDING' : 'CONFIRMED',
          // Only unpaid online bookings expire.
          holdExpiresAt:
            isOnline && paymentStatus !== 'PAID'
              ? new Date(Date.now() + ONLINE_HOLD_MINUTES * 60 * 1000)
              : null,
        },
        include: { room: true },
      })

      return { booking, nights, computedTotal: computed }
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
  paymentMode?: PaymentMode
  paymentStatus?: PaymentStatus
  /** Pin a specific table (walk-in: "seat them at table 7"). */
  tableId?: string | null
  priceOverride?: number | null
}

export async function createTableBooking(input: CreateTableBookingInput) {
  const slotStart = parseDate(`${input.date}T${input.time}:00`, 'date or time')
  const slotEnd = new Date(slotStart.getTime() + TABLE_SLOT_HOURS * 60 * 60 * 1000)
  const guestCount = Math.max(1, Number(input.guestCount) || 1)
  const addOns = validAddOnCodes(input.addOns)

  assertSourceIntegrity(input.source, input.bookedById)

  return prisma.$transaction(
    async (tx) => {
      const candidates = await tx.table.findMany({
        where: {
          status: 'AVAILABLE',
          capacity: { gte: guestCount },
          ...(input.tableId ? { id: input.tableId } : {}),
        },
        orderBy: { capacity: 'asc' }, // smallest table that fits
        select: { id: true },
      })

      if (candidates.length === 0) {
        throw new BookingError('No table with enough capacity', 409, 'NO_TABLE')
      }

      // Lock every candidate so a concurrent request cannot claim one between
      // our conflict check and our insert.
      await tx.$queryRaw`
        SELECT id FROM "Table"
        WHERE id IN (${Prisma.join(candidates.map((c) => c.id))})
        FOR UPDATE
      `

      // One query for all candidates instead of the previous N+1 loop.
      const conflicts = await tx.booking.findMany({
        where: {
          type: 'TABLE',
          tableId: { in: candidates.map((c) => c.id) },
          AND: [
            blockingBookingFilter(),
            {
              bookingDate: {
                gt: new Date(slotStart.getTime() - TABLE_SLOT_HOURS * 60 * 60 * 1000),
                lt: slotEnd,
              },
            },
          ],
        },
        select: { tableId: true },
      })

      const taken = new Set(conflicts.map((c) => c.tableId))
      const chosenId = candidates.find((c) => !taken.has(c.id))?.id
      if (!chosenId) {
        throw new BookingError('No table available at the selected time', 409, 'NO_SLOT')
      }

      const table = await tx.table.findUniqueOrThrow({ where: { id: chosenId } })

      const baseAmount = guestCount * TABLE_PRICE_PER_GUEST
      const addOnsAmount = priceAddOns(addOns, 1, guestCount)
      const computed = baseAmount + addOnsAmount
      const totalPrice =
        input.priceOverride != null && input.priceOverride >= 0
          ? Math.round(input.priceOverride)
          : computed

      const isOnline = input.source === 'ONLINE'
      const paymentStatus = input.paymentStatus ?? 'PENDING'

      const booking = await tx.booking.create({
        data: {
          type: 'TABLE',
          source: input.source,
          bookedById: input.bookedById ?? null,
          userId: input.userId,
          tableId: table.id,
          bookingDate: slotStart,
          guestCount,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone ?? null,
          specialRequest: input.specialRequest ?? null,
          addOns,
          baseAmount,
          addOnsAmount,
          totalPrice,
          paymentMode: input.paymentMode ?? (isOnline ? 'ONLINE' : 'CASH'),
          paymentStatus,
          status: isOnline ? 'PENDING' : 'CONFIRMED',
          holdExpiresAt:
            isOnline && paymentStatus !== 'PAID'
              ? new Date(Date.now() + ONLINE_HOLD_MINUTES * 60 * 1000)
              : null,
        },
        include: { table: true },
      })

      return { booking, computedTotal: computed }
    },
    { timeout: 15000, maxWait: 10000 },
  )
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
      paymentStatus: { in: ['PENDING', 'FAILED'] },
      holdExpiresAt: { lt: new Date() },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: 'Payment not completed within the hold window',
    },
  })
  return { released: result.count }
}
