/**
 * Zod schemas for API payloads, plus a tiny helper that turns a failed parse
 * into the `{ error }` 400 response every route in this app returns.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { guestTransferSchema } from './transfers'

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Use a YYYY-MM-DD date')
export const timeString = z.string().regex(/^\d{2}:\d{2}$/, 'Use an HH:MM time')

const trimmed = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null))

export const guestDetails = {
  guestName: trimmed(120).min(1, 'Guest name is required'),
  guestEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
  guestPhone: optionalText(20),
  specialRequest: optionalText(1000),
}

export const tableRequest = z.object({
  date: dateString,
  time: timeString,
  guestCount: z.coerce.number().int().min(1).max(50),
  tableId: z.string().optional().nullable(),
})

export const roomBookingSchema = z
  .object({
    roomId: z.string().min(1),
    checkInDate: dateString,
    checkOutDate: dateString,
    guestCount: z.coerce.number().int().min(1).max(20),
    addOns: z.array(z.string()).optional().default([]),
    table: tableRequest.optional().nullable(),
    transfer: guestTransferSchema.optional().nullable(),
    ...guestDetails,
  })
  .refine(
    (v) => !v.addOns.includes('AIRPORT_PICKUP') || !v.transfer || v.transfer.pickup,
    { message: 'Add your arrival details for the airport pickup', path: ['transfer', 'pickup'] },
  )
  .refine(
    (v) => !v.addOns.includes('AIRPORT_DROP') || !v.transfer || v.transfer.drop,
    { message: 'Add your departure details for the airport drop', path: ['transfer', 'drop'] },
  )
  .refine((v) => v.checkOutDate.slice(0, 10) > v.checkInDate.slice(0, 10), {
    message: 'Check-out must be after check-in',
    path: ['checkOutDate'],
  })

export const tableBookingSchema = z.object({
  date: dateString,
  time: timeString,
  guestCount: z.coerce.number().int().min(1).max(50),
  addOns: z.array(z.string()).optional().default([]),
  ...guestDetails,
})

export const quoteSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ROOM'),
    roomId: z.string().min(1),
    checkInDate: dateString,
    checkOutDate: dateString,
    guestCount: z.coerce.number().int().min(1).max(20),
    addOns: z.array(z.string()).optional().default([]),
    table: tableRequest.optional().nullable(),
  }),
  z.object({
    kind: z.literal('TABLE'),
    guestCount: z.coerce.number().int().min(1).max(50),
  }),
])

export const paymentOrderSchema = z.object({ bookingId: z.string().min(1) })

export const paymentVerifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().default(''),
})

export const cancelSchema = z.object({
  reason: optionalText(500),
})

export const deskModes = z.enum(['CASH', 'CARD', 'UPI'])

export const walkInSchema = z
  .object({
    type: z.enum(['ROOM', 'TABLE', 'ROOM_TABLE']),
    roomId: z.string().optional().nullable(),
    tableId: z.string().optional().nullable(),
    checkInDate: dateString.optional().nullable(),
    checkOutDate: dateString.optional().nullable(),
    date: dateString.optional().nullable(),
    time: timeString.optional().nullable(),
    guestCount: z.coerce.number().int().min(1).max(50),
    tableGuestCount: z.coerce.number().int().min(1).max(50).optional().nullable(),
    addOns: z.array(z.string()).optional().default([]),
    paymentMode: deskModes.default('CASH'),
    paymentStatus: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID']).default('PENDING'),
    amountPaid: z.coerce.number().min(0).optional().nullable(),
    priceOverride: z
      .union([z.coerce.number().min(0), z.literal('')])
      .optional()
      .nullable()
      .transform((v) => (v === '' || v == null ? null : v)),
    notes: optionalText(1000),
    ...guestDetails,
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'TABLE' && (!v.roomId || !v.checkInDate || !v.checkOutDate)) {
      ctx.addIssue({ code: 'custom', message: 'Room and stay dates are required', path: ['roomId'] })
    }
    if (v.type !== 'ROOM' && (!v.date || !v.time)) {
      ctx.addIssue({ code: 'custom', message: 'Table date and time are required', path: ['date'] })
    }
    if (v.paymentStatus === 'PARTIALLY_PAID' && !v.amountPaid) {
      ctx.addIssue({ code: 'custom', message: 'Enter the amount collected', path: ['amountPaid'] })
    }
  })

export const deskPaymentSchema = z.object({
  amount: z.coerce.number().int().min(1),
  mode: deskModes,
  notes: optionalText(500),
})

export const paymentStatusSchema = z.object({
  status: z.enum(['PAID', 'PENDING']),
  mode: deskModes.optional(),
  notes: optionalText(500),
})

export const refundActionSchema = z.object({
  action: z.enum(['PROCESS', 'REJECT']),
  amount: z.coerce.number().int().min(1).optional().nullable(),
  note: optionalText(500),
})

export const settingsSchema = z
  .object({
    advancePercent: z.coerce.number().int().min(0).max(100),
    weekendDays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
    premiumPaymentRule: z.enum(['FULL', 'FIRST_NIGHT']),
    sameDayFullPayment: z.boolean(),
    longStayEnabled: z.boolean(),
    longStayMinNights: z.coerce.number().int().min(2).max(60),
    gstPercent: z.coerce.number().int().min(0).max(28),
    tablePricePerGuest: z.coerce.number().int().min(0).max(100000),
    earlyCancelHours: z.coerce.number().int().min(1).max(720),
    earlyRefundPercent: z.coerce.number().int().min(0).max(100),
    lateCancelHours: z.coerce.number().int().min(0).max(720),
    lateRefundPercent: z.coerce.number().int().min(0).max(100),
    taxMode: z.enum(['FLAT', 'INDIA_SLABS']),
    roomGstThreshold: z.coerce.number().int().min(0).max(1_000_000),
    roomGstLowPercent: z.coerce.number().int().min(0).max(28),
    roomGstHighPercent: z.coerce.number().int().min(0).max(28),
    tableGstPercent: z.coerce.number().int().min(0).max(28),
    addOnGstPercent: z.coerce.number().int().min(0).max(28),
    legalName: optionalText(200),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^$|^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/, 'GSTIN must be 15 characters (e.g. 08ABCDE1234F1Z5)')
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    restaurantOpenTime: timeString,
    restaurantLastSeating: timeString,
  })
  .partial()
  .refine(
    (v) => v.restaurantOpenTime == null || v.restaurantLastSeating == null || v.restaurantOpenTime <= v.restaurantLastSeating,
    { message: 'Last seating must be after opening time', path: ['restaurantLastSeating'] },
  )
  .refine(
    (v) => v.earlyCancelHours == null || v.lateCancelHours == null || v.earlyCancelHours >= v.lateCancelHours,
    { message: 'The early window must be at least as long as the late window', path: ['earlyCancelHours'] },
  )

export const peakSeasonSchema = z
  .object({
    name: trimmed(80).min(1),
    startDate: dateString,
    endDate: dateString,
    active: z.boolean().optional().default(true),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after start', path: ['endDate'] })

export const specialDateSchema = z.object({
  name: trimmed(80).min(1),
  date: dateString,
  active: z.boolean().optional().default(true),
})

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

/** `const p = await parseJson(req, schema); if (!p.ok) return p.response` */
export async function parseJson<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<Parsed<z.infer<S>>> {
  const body = await req.json().catch(() => undefined)
  return parseData(body, schema)
}

export function parseData<S extends z.ZodTypeAny>(body: unknown, schema: S): Parsed<z.infer<S>> {
  const result = schema.safeParse(body ?? {})
  if (result.success) return { ok: true, data: result.data }
  const issue = result.error.issues[0]
  return {
    ok: false,
    response: NextResponse.json(
      { error: issue?.message ?? 'Invalid request', field: issue?.path.join('.') || undefined },
      { status: 400 },
    ),
  }
}
