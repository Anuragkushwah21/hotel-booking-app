/**
 * Pickup / drop details for the AIRPORT_PICKUP and AIRPORT_DROP add-ons.
 *
 * Stored on Booking.transferDetails as `{ pickup?: TransferLeg, drop?: TransferLeg }`.
 * The guest fills in travel details at checkout; the desk adds the driver,
 * vehicle and status from the dashboard.
 */

import { z } from 'zod'

const text = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null))

/** What the guest provides at checkout. */
export const guestTransferLeg = z.object({
  mode: z.enum(['FLIGHT', 'TRAIN', 'OTHER']).default('FLIGHT'),
  number: text(30),
  at: z
    .string()
    .min(1, 'Pickup / drop time is required')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Enter a valid date and time'),
  location: z.string().trim().min(2, 'Location is required').max(200),
  passengers: z.coerce.number().int().min(1).max(20).optional().nullable(),
  notes: text(500),
})

/** Staff can also assign a driver and move the leg through its states. */
export const staffTransferLeg = guestTransferLeg.extend({
  driverName: text(80),
  driverPhone: text(20),
  vehicleNo: text(20),
  status: z.enum(['REQUESTED', 'ASSIGNED', 'COMPLETED', 'CANCELLED']).default('REQUESTED'),
})

export type TransferLeg = z.infer<typeof staffTransferLeg>
export type TransferDetails = { pickup?: TransferLeg | null; drop?: TransferLeg | null }

export const guestTransferSchema = z.object({
  pickup: guestTransferLeg.optional().nullable(),
  drop: guestTransferLeg.optional().nullable(),
})

export const staffTransferSchema = z.object({
  pickup: staffTransferLeg.optional().nullable(),
  drop: staffTransferLeg.optional().nullable(),
})

export const PICKUP_ADDON = 'AIRPORT_PICKUP'
export const DROP_ADDON = 'AIRPORT_DROP'

/**
 * Keep only the legs the guest actually paid for, normalise `at` to ISO and
 * stamp them REQUESTED. Returns null when there is nothing to store.
 */
export function transfersForBooking(
  addOns: string[],
  input: z.infer<typeof guestTransferSchema> | null | undefined,
): TransferDetails | null {
  const leg = (l: z.infer<typeof guestTransferLeg> | null | undefined): TransferLeg | null =>
    l
      ? {
          ...l,
          at: new Date(l.at).toISOString(),
          passengers: l.passengers ?? null,
          driverName: null,
          driverPhone: null,
          vehicleNo: null,
          status: 'REQUESTED',
        }
      : null

  const pickup = addOns.includes(PICKUP_ADDON) ? leg(input?.pickup) : null
  const drop = addOns.includes(DROP_ADDON) ? leg(input?.drop) : null
  if (!pickup && !drop) return null
  return { ...(pickup ? { pickup } : {}), ...(drop ? { drop } : {}) }
}
