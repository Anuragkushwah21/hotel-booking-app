import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson } from '@/lib/validation'

const schema = z.object({ status: z.enum(['CLEAN', 'DIRTY', 'IN_PROGRESS', 'INSPECTED']) })

/**
 * PATCH /api/admin/room/[roomId]/housekeeping  { status }
 *
 * Housekeeping state is separate from Room.status (sellable or not): a DIRTY
 * room is still bookable for tonight, it just has to be turned over first.
 * Check-out sets DIRTY automatically.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response

  try {
    const { roomId } = await params
    const before = await prisma.room.findUnique({ where: { id: roomId }, select: { housekeepingStatus: true } })
    if (!before) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const room = await prisma.room.update({
      where: { id: roomId },
      data: { housekeepingStatus: parsed.data.status },
    })
    await logManagerAction(auth.user.id, 'UPDATE_HOUSEKEEPING', {
      metadata: { roomId, roomNo: room.roomNo, from: before.housekeepingStatus, to: room.housekeepingStatus },
    })
    return NextResponse.json({ success: true, room })
  } catch (error) {
    console.error('[admin/room/housekeeping] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update housekeeping status' }, { status: 500 })
  }
}
