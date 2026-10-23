/**
 * Guest resolution for walk-in bookings.
 *
 * A walk-in guest usually has no account. Bookings still need a `userId`, so we
 * look the guest up by email (or phone) and create a passwordless GUEST record
 * if they're new. If they later sign up with the same email, their walk-in
 * history is already attached to them.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type GuestInput = {
  name: string
  email: string
  phone?: string | null
}

export async function resolveOrCreateGuest(
  input: GuestInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const email = input.email.trim().toLowerCase()
  const phone = input.phone?.trim() || null

  const existing = await client.user.findUnique({ where: { email } })
  if (existing) {
    // Never attach an anonymous public booking to a staff account merely
    // because a visitor typed the same email address.
    if (existing.role !== 'GUEST') {
      throw new Error('This email belongs to a staff account')
    }
    // Backfill a missing phone/name without clobbering what's already there.
    if ((phone && !existing.phone) || (input.name && !existing.name)) {
      return client.user.update({
        where: { id: existing.id },
        data: {
          phone: existing.phone ?? phone,
          name: existing.name ?? input.name,
        },
      })
    }
    return existing
  }

  return client.user.create({
    data: {
      email,
      name: input.name,
      phone,
      role: 'GUEST',
      status: 'ACTIVE',
      // Walk-in guests have no credentials until they choose to sign up.
      passwordHash: null,
      emailVerified: false,
    },
  })
}

/** Typeahead for the walk-in form so repeat guests aren't re-keyed. */
export async function searchGuests(query: string, limit = 8) {
  const q = query.trim()
  if (q.length < 2) return []

  return prisma.user.findMany({
    where: {
      role: 'GUEST',
      OR: [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })
}
