import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager, requireAdmin } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'
import { blockingBookingFilter, ROOM_BOOKING_TYPES } from '@/lib/booking-engine'
import { parseJson } from '@/lib/validation'
import { roomUpdateSchema } from '@/lib/admin-schemas'

type Ctx = { params: Promise<{ roomId: string }> }

/**
 * PUT — update a room, including its premium nightly rates and whether it is
 * in service (AVAILABLE) or out of service (MAINTENANCE).
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, roomUpdateSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const { roomId } = await params

    const existing = await prisma.room.findUnique({ where: { id: roomId } })
    if (!existing) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    if (body.roomNo && body.roomNo !== existing.roomNo) {
      const dup = await prisma.room.findUnique({ where: { roomNo: body.roomNo } })
      if (dup) return NextResponse.json({ error: 'Room number already exists' }, { status: 409 })
    }

    // Taking a room out of service while guests are booked into it would
    // silently strand them, so require the bookings be cleared first.
    if (body.status === 'MAINTENANCE' && existing.status !== 'MAINTENANCE') {
      const active = await prisma.booking.count({
        where: {
          roomId,
          type: { in: ROOM_BOOKING_TYPES },
          checkOutDate: { gt: new Date() },
          AND: [blockingBookingFilter()],
        },
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
        ...(body.roomNo !== undefined && { roomNo: body.roomNo }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.type !== undefined && { type: body.type || null }),
        ...(body.acType !== undefined && { acType: body.acType }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.weekendPrice !== undefined && { weekendPrice: body.weekendPrice }),
        ...(body.peakPrice !== undefined && { peakPrice: body.peakPrice }),
        ...(body.eventPrice !== undefined && { eventPrice: body.eventPrice }),
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
