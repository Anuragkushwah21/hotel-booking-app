/**
 * Zod schemas for admin inventory payloads (rooms). Booking/payment/settings
 * schemas live in lib/validation.ts.
 */

import { z } from 'zod'

const money = z.coerce.number().int().min(0).max(10_000_000)
/** Optional premium rate: '' / null clears it (falls back to the base price). */
const optionalMoney = z
  .union([money, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : v))

export const roomStatusSchema = z.enum(['AVAILABLE', 'MAINTENANCE'])

export const roomCreateSchema = z.object({
  roomNo: z.string().trim().min(1, 'Room number is required').max(20),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  type: z.string().trim().max(60).optional().nullable(),
  acType: z.string().trim().min(1).max(20).optional().default('AC'),
  capacity: z.coerce.number().int().min(1).max(20).optional().default(2),
  price: money,
  weekendPrice: optionalMoney,
  peakPrice: optionalMoney,
  eventPrice: optionalMoney,
  status: roomStatusSchema.optional().default('AVAILABLE'),
  amenities: z.array(z.string()).optional().default([]),
  photos: z.array(z.string()).optional().default([]),
})

export const roomUpdateSchema = roomCreateSchema.partial().extend({
  acType: z.string().trim().min(1).max(20).optional(),
  status: roomStatusSchema.optional(),
  amenities: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
  capacity: z.coerce.number().int().min(1).max(20).optional(),
})

/** Bulk price edit from Admin → Room Types / Pricing. */
export const roomPricesSchema = z.object({
  rooms: z
    .array(
      z.object({
        id: z.string().min(1),
        price: money,
        weekendPrice: optionalMoney,
        peakPrice: optionalMoney,
        eventPrice: optionalMoney,
      }),
    )
    .min(1)
    .max(500),
})
