import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction } from '@/lib/manager-log'
import { staffTransferSchema, type TransferDetails } from '@/lib/transfers'
import { parseJson } from '@/lib/validation'

/**
 * PATCH /api/admin/bookings/[id]/transfers  { pickup?: TransferLeg | null, drop?: TransferLeg | null }
 *
 * Desk edits to the pickup / drop legs: travel details, driver, vehicle and
 * status. A leg that is left out stays as it is; `null` removes it.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, staffTransferSchema)
  if (!parsed.ok) return parsed.response

  try {
    const { id } = await params
    const booking = await prisma.booking.findUnique({ where: { id }, select: { transferDetails: true } })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const current = (booking.transferDetails ?? {}) as TransferDetails
    const next: TransferDetails = { ...current }
    for (const leg of ['pickup', 'drop'] as const) {
      const value = parsed.data[leg]
      if (value === undefined) continue
      if (value === null) delete next[leg]
      else next[leg] = { ...value, at: new Date(value.at).toISOString(), passengers: value.passengers ?? null }
    }

    const empty = !next.pickup && !next.drop
    const updated = await prisma.booking.update({
      where: { id },
      data: { transferDetails: empty ? Prisma.DbNull : (next as Prisma.InputJsonValue) },
      select: { transferDetails: true },
    })

    await logManagerAction(auth.user.id, 'UPDATE_TRANSFER', { bookingId: id, metadata: { before: current, after: next } })
    return NextResponse.json({ success: true, transferDetails: updated.transferDetails })
  } catch (error) {
    console.error('[admin/bookings/transfers] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update pickup / drop details' }, { status: 500 })
  }
}
