import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager, requireAdmin } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'
import { blockingBookingFilter } from '@/lib/booking-engine'

type Ctx = { params: Promise<{ roomId: string }> }

/** PUT — update a room. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { roomId } = await params
    const body = await req.json()

    const existing = await prisma.room.findUnique({ where: { id: roomId } })
    if (!existing) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    if (body.roomNo && body.roomNo.trim() !== existing.roomNo) {
      const dup = await prisma.room.findUnique({ where: { roomNo: body.roomNo.trim() } })
      if (dup) return NextResponse.json({ error: 'Room number already exists' }, { status: 409 })
    }

    // Taking a room out of service while guests are booked into it would
    // silently strand them, so require the bookings be cleared first.
    if (body.status === 'MAINTENANCE' && existing.status !== 'MAINTENANCE') {
      const active = await prisma.booking.count({
        where: { roomId, type: 'ROOM', AND: [blockingBookingFilter()] },
      })
      if (active > 0) {
        return NextResponse.json(
          {
            error: `Room has ${active} active booking(s). Cancel or move them before marking it for maintenance.`,
            activeBookings: active,
          },
          { status: 409 },
        )
      }
    }

    const room = await prisma.room.update({
      where: { id: roomId },
      data: {
        ...(body.roomNo !== undefined && { roomNo: body.roomNo.trim() }),
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.type !== undefined && { type: body.type?.trim() || null }),
        ...(body.acType !== undefined && { acType: body.acType }),
        ...(body.capacity !== undefined && { capacity: Number(body.capacity) }),
        ...(body.price !== undefined && { price: Math.round(Number(body.price)) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.amenities !== undefined && { amenities: body.amenities }),
        ...(body.photos !== undefined && { photos: body.photos }),
      },
    })

    await logManagerAction(auth.user.id, 'UPDATE_ROOM', {
      metadata: { roomId, roomNo: room.roomNo, changes: body },
    })

    return NextResponse.json({ room })
  } catch (error) {
    console.error('[admin/room/:id] PUT error:', error)
    return NextResponse.json({ error: 'Failed to update room' }, { status: 500 })
  }
}

/** DELETE — remove a room. Admin only, and refused if history exists. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { roomId } = await params

    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const bookingCount = await prisma.booking.count({ where: { roomId } })
    if (bookingCount > 0) {
      return NextResponse.json(
        {
          error: `Room has ${bookingCount} booking(s) in its history and cannot be deleted. Set its status to MAINTENANCE to take it out of service instead.`,
          bookingCount,
        },
        { status: 409 },
      )
    }

    await prisma.room.delete({ where: { id: roomId } })

    await logManagerAction(auth.user.id, 'DELETE_ROOM', {
      metadata: { roomId, roomNo: room.roomNo },
    })

    return NextResponse.json({ message: 'Room deleted successfully' })
  } catch (error) {
    console.error('[admin/room/:id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 })
  }
}
