import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'

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

  try {
    const body = await req.json()
    const { roomNo, name, description, type, acType, capacity, price, status, amenities, photos } = body

    if (!roomNo?.trim() || !name?.trim() || price == null) {
      return NextResponse.json(
        { error: 'roomNo, name and price are required' },
        { status: 400 },
      )
    }

    const priceValue = Number(price)
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      return NextResponse.json({ error: 'price must be a positive number' }, { status: 400 })
    }

    const duplicate = await prisma.room.findUnique({ where: { roomNo: roomNo.trim() } })
    if (duplicate) {
      return NextResponse.json({ error: 'Room number already exists' }, { status: 409 })
    }

    const room = await prisma.room.create({
      data: {
        roomNo: roomNo.trim(),
        name: name.trim(),
        description: description?.trim() || null,
        type: type?.trim() || null,
        acType: acType || 'AC',
        capacity: Number(capacity) || 2,
        price: Math.round(priceValue),
        status: status || 'AVAILABLE',
        amenities: Array.isArray(amenities) ? amenities : [],
        photos: Array.isArray(photos) ? photos : [],
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
