import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'
import { blockingBookingFilter } from '@/lib/booking-engine'

type Ctx = { params: Promise<{ roomId: string }> }

/**
 * POST — block a room for a date range (maintenance, deep clean, renovation).
 *
 * Preferred over setting Room.status = MAINTENANCE, which is open-ended and
 * takes the room out of inventory for every future date too. The availability
 * engine honours both.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { roomId } = await params
    const { startDate, endDate, reason } = await req.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
    }
    if (start >= end) {
      return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    // Refuse to block over guests who are already booked in.
    const clashes = await prisma.booking.count({
      where: {
        roomId,
        type: 'ROOM',
        AND: [
          blockingBookingFilter(),
          { checkInDate: { lt: end }, checkOutDate: { gt: start } },
        ],
      },
    })
    if (clashes > 0) {
      return NextResponse.json(
        {
          error: `${clashes} booking(s) fall inside this window. Move or cancel them first.`,
          conflictingBookings: clashes,
        },
        { status: 409 },
      )
    }

    const block = await prisma.roomBlock.create({
      data: {
        roomId,
        startDate: start,
        endDate: end,
        reason: reason?.trim() || null,
        createdBy: auth.user.id,
      },
    })

    await logManagerAction(auth.user.id, 'BLOCK_ROOM', {
      notes: reason?.trim() || null,
      metadata: { roomId, roomNo: room.roomNo, blockId: block.id, startDate, endDate },
    })

    return NextResponse.json({ block }, { status: 201 })
  } catch (error) {
    console.error('[admin/room/block] POST error:', error)
    return NextResponse.json({ error: 'Failed to block room' }, { status: 500 })
  }
}

/** DELETE ?blockId=... — lift a maintenance block early. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { roomId } = await params
    const blockId = req.nextUrl.searchParams.get('blockId')
    if (!blockId) {
      return NextResponse.json({ error: 'blockId query param is required' }, { status: 400 })
    }

    const block = await prisma.roomBlock.findFirst({ where: { id: blockId, roomId } })
    if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

    await prisma.roomBlock.delete({ where: { id: blockId } })

    await logManagerAction(auth.user.id, 'UNBLOCK_ROOM', {
      metadata: { roomId, blockId, startDate: block.startDate, endDate: block.endDate },
    })

    return NextResponse.json({ message: 'Block removed' })
  } catch (error) {
    console.error('[admin/room/block] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove block' }, { status: 500 })
  }
}
