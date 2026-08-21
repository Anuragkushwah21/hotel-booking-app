/**
 * Append-only audit trail for staff actions.
 *
 * Logging must never break the operation it records, so failures are swallowed
 * and reported to the console. Call it inside the same transaction as the
 * mutation when you need the two to be atomic — pass the transaction client.
 */

import type { Prisma, ManagerActionType } from '@prisma/client'
import { prisma } from './prisma'

type Client = Prisma.TransactionClient | typeof prisma

export async function logManagerAction(
  managerId: string,
  action: ManagerActionType,
  opts: {
    bookingId?: string | null
    notes?: string | null
    /** Any JSON-serialisable payload; cast at the boundary. */
    metadata?: unknown
    client?: Client
  } = {},
): Promise<void> {
  const db = opts.client ?? prisma
  try {
    await db.managerAction.create({
      data: {
        managerId,
        action,
        bookingId: opts.bookingId ?? null,
        notes: opts.notes ?? null,
        ...(opts.metadata !== undefined
          ? { metadata: opts.metadata as Prisma.InputJsonValue }
          : {}),
      },
    })
  } catch (error) {
    console.error(`[audit] failed to record ${action} by ${managerId}:`, error)
  }
}

export async function getBookingAuditTrail(bookingId: string) {
  return prisma.managerAction.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'desc' },
    include: { manager: { select: { id: true, name: true, email: true } } },
  })
}
