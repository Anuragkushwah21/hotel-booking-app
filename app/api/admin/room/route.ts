import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson } from '@/lib/validation'
import { roomCreateSchema } from '@/lib/admin-schemas'

/** GET /api/admin/room — full room list (staff view, includes maintenance). */
export async function GET() {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const rooms = await prisma.room.findMany({
      orderBy: { roomNo: 'asc' },
      include: {
        blocks: {
          where: { endDate: { gte: new Date() } },
          select: { id: true, startDate: true, endDate: true, reason: true },
          orderBy: { startDate: 'asc' },
        },
      },
    })
    return NextResponse.json({ rooms })
  } catch (error) {
    console.error('[admin/room] GET error:', error)
    return NextResponse.json({ error: 'Failed to load rooms' }, { status: 500 })
  }
}

/** POST /api/admin/room — create a room. */
export async function POST(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, roomCreateSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const duplicate = await prisma.room.findUnique({ where: { roomNo: body.roomNo } })
    if (duplicate) {
      return NextResponse.json({ error: 'Room number already exists' }, { status: 409 })
    }

    const room = await prisma.room.create({
      data: {
        roomNo: body.roomNo,
        name: body.name,
        description: body.description || null,
        type: body.type || null,
        acType: body.acType,
        capacity: body.capacity,
        price: body.price,
        weekendPrice: body.weekendPrice ?? null,
        peakPrice: body.peakPrice ?? null,
        eventPrice: body.eventPrice ?? null,
        status: body.status,
        amenities: body.amenities,
        photos: body.photos,
      },
    })

    await logManagerAction(auth.user.id, 'CREATE_ROOM', {
      metadata: { roomId: room.id, roomNo: room.roomNo, price: room.price },
    })

    return NextResponse.json({ room }, { status: 201 })
  } catch (error) {
    console.error('[admin/room] POST error:', error)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
