import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson } from '@/lib/validation'
import { roomPricesSchema } from '@/lib/admin-schemas'

/** GET /api/admin/pricing/rooms — every room's nightly rates, for the price grid (ADMIN). */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const rooms = await prisma.room.findMany({
    orderBy: [{ type: 'asc' }, { roomNo: 'asc' }],
    select: {
      id: true, roomNo: true, name: true, type: true, acType: true, capacity: true, status: true,
      price: true, weekendPrice: true, peakPrice: true, eventPrice: true,
    },
  })
  return NextResponse.json({ rooms })
}

/**
 * PUT /api/admin/pricing/rooms — bulk update { rooms: [{ id, price, weekendPrice?, peakPrice?, eventPrice? }] }.
 * New prices apply to new bookings; existing bookings keep the total they were quoted.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, roomPricesSchema)
  if (!parsed.ok) return parsed.response

  try {
    await prisma.$transaction(
      parsed.data.rooms.map((r) =>
        prisma.room.update({
          where: { id: r.id },
          data: {
            price: r.price,
            weekendPrice: r.weekendPrice ?? null,
            peakPrice: r.peakPrice ?? null,
            eventPrice: r.eventPrice ?? null,
          },
        }),
      ),
    )
    await logManagerAction(auth.user.id, 'UPDATE_ROOM', {
      notes: 'Bulk price update',
      metadata: { rooms: parsed.data.rooms },
    })
    return NextResponse.json({ message: `Prices saved for ${parsed.data.rooms.length} room(s)` })
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'A room no longer exists' }, { status: 404 })
    console.error('[admin/pricing/rooms] PUT error:', error)
    return NextResponse.json({ error: 'Failed to save prices' }, { status: 500 })
  }
}
