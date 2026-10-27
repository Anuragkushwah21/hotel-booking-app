/**
 * Guest booking lookup (no account needed), shared by the two steps of
 * /api/bookings/lookup:
 *
 *   1. POST /api/bookings/lookup         { query }        → code emailed
 *   2. POST /api/bookings/lookup/verify  { query, code }  → bookings + access cookies
 *
 * Nothing about a booking is returned until step 2 succeeds. The code always
 * goes to the email address stored ON the booking — never to an address the
 * visitor typed — so knowing someone's phone number or booking number isn't
 * enough to see their stay.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { normalizeBookingRef } from './booking-reference'
import { guestBookingInclude } from './booking-view'

export const LOOKUP_MAX_RESULTS = 20

export function phoneCandidates(value: string): string[] {
  const digits = value.replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  const out = [value.trim(), value.replace(/[\s-]/g, ''), digits, digits ? `+${digits}` : '']
  if (local.length === 10) {
    out.push(local, `91${local}`, `+91${local}`, `+91 ${local}`, `0${local}`)
  }
  return [...new Set(out)].filter(Boolean)
}

export type LookupQuery = {
  /** Stable key the OTP is bound to, e.g. "ref:HB-7K4M2Q" or "phone:9829000000". */
  subject: string
  where: Prisma.BookingWhereInput
}

/** Classify what the guest typed. Returns null when it can't be a lookup at all. */
export function parseLookupQuery(raw: string): LookupQuery | null {
  const query = raw.trim()
  if (!query || query.length > 120) return null

  const reference = normalizeBookingRef(query)
  if (reference) return { subject: `ref:${reference}`, where: { reference } }

  const email = query.toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      subject: `email:${email}`,
      where: {
        OR: [
          { guestEmail: { equals: email, mode: 'insensitive' } },
          { user: { is: { email: { equals: email, mode: 'insensitive' } } } },
        ],
      },
    }
  }

  const phones = phoneCandidates(query)
  const digits = query.replace(/\D/g, '')
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(query)) {
    const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
    return {
      subject: `phone:${local}`,
      where: {
        OR: [{ guestPhone: { in: phones } }, { user: { is: { phone: { in: phones } } } }],
      },
    }
  }

  // Raw booking id (links in old emails).
  if (/^c[a-z0-9]{20,32}$/.test(query)) return { subject: `id:${query}`, where: { id: query } }

  return null
}

export function findLookupBookings(q: LookupQuery) {
  return prisma.booking.findMany({
    where: q.where,
    include: guestBookingInclude,
    orderBy: { createdAt: 'desc' },
    take: LOOKUP_MAX_RESULTS,
  })
}

/** Distinct emails on the matched bookings: where the code is sent. */
export async function lookupDestinations(q: LookupQuery): Promise<string[]> {
  const rows = await prisma.booking.findMany({
    where: q.where,
    select: { guestEmail: true },
    orderBy: { createdAt: 'desc' },
    take: LOOKUP_MAX_RESULTS,
  })
  return [...new Set(rows.map((r) => r.guestEmail.trim().toLowerCase()))].slice(0, 3)
}
