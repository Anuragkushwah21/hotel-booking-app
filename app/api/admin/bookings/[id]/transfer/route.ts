import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BookingError, checkRoomAvailability } from '@/lib/booking-engine'
import { logManagerAction } from '@/lib/manager-log'
import { dispatchNotifications, notifySafely, queueBookingNotifications } from '@/lib/notifications'
import { dateKey } from '@/lib/format'
import { parseJson } from '@/lib/validation'

/**
 * POST /api/admin/bookings/[id]/transfer  { roomId, reason? }
 *
 * Move a CONFIRMED or CHECKED_IN stay to another room (upgrade, maintenance,
 * guest request). Runs under row locks on both rooms — taken in id order so
 * two opposite moves can't deadlock — and re-checks availability inside the
 * transaction, exactly like a new booking. The price is kept: a move is an
 * operational change, and any rate difference is settled with a desk payment
 * or a booking edit.
 *
 * For a guest already in-house only the remaining nights need to be free.
 */

const schema = z.object({
  roomId: z.string().min(1),
  reason: z.string().trim().max(500).optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, schema)
  if (!parsed.ok) return parsed.response

  try {
    const { id } = await params
    const result = await prisma.$transaction(
      async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id }, include: { room: true } })
        if (!booking) throw new BookingError('Booking not found', 404, 'NOT_FOUND')
        if (booking.type === 'TABLE' || !booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
          throw new BookingError('Only room bookings can be moved', 400, 'NOT_A_STAY')
        }
        if (booking.status !== 'CONFIRMED' && booking.status !== 'CHECKED_IN') {
          throw new BookingError(`A ${booking.status.toLowerCase()} booking can't be moved`, 409, 'BAD_STATUS')
        }
        if (booking.roomId === parsed.data.roomId) {
          throw new BookingError('The guest is already in that room', 400, 'SAME_ROOM')
        }

        const ids = [booking.roomId, parsed.data.roomId].sort()
        for (const roomId of ids) {
          await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`
        }

        const target = await tx.room.findUnique({ where: { id: parsed.data.roomId } })
        if (!target) throw new BookingError('Room not found', 404, 'ROOM_NOT_FOUND')
        if (booking.guestCount > target.capacity) {
          throw new BookingError(`Room ${target.roomNo} holds ${target.capacity} guest(s)`, 400, 'OVER_CAPACITY')
        }

        const from =
          booking.status === 'CHECKED_IN'
            ? new Date(`${dateKey(new Date())}T00:00:00Z`)
            : booking.checkInDate
        const availability = await checkRoomAvailability(target.id, from, booking.checkOutDate, {
          excludeBookingId: booking.id,
          client: tx,
        })
        if (!availability.available) {
          throw new BookingError(availability.reason ?? `Room ${target.roomNo} is not free`, 409, 'UNAVAILABLE')
        }

        const updated = await tx.booking.update({
          where: { id },
          data: { roomId: target.id, assignedRoomNo: target.roomNo },
        })

        // The room the guest leaves needs turning over.
        if (booking.status === 'CHECKED_IN') {
          await tx.room.update({ where: { id: booking.roomId }, data: { housekeepingStatus: 'DIRTY' } })
        }

        await logManagerAction(auth.user.id, 'TRANSFER_ROOM', {
          bookingId: id,
          notes: parsed.data.reason ?? null,
          metadata: { fromRoom: booking.room?.roomNo ?? null, toRoom: target.roomNo },
          client: tx,
        })
        const notificationIds = await queueBookingNotifications(tx, updated, 'BOOKING_MODIFIED')
        return { updated, notificationIds }
      },
      { timeout: 15000, maxWait: 10000 },
    )

    notifySafely(() => dispatchNotifications(result.notificationIds))
    return NextResponse.json({
      success: true,
      message: `Moved to room ${result.updated.assignedRoomNo}`,
      booking: {
        id: result.updated.id,
        roomId: result.updated.roomId,
        assignedRoomNo: result.updated.assignedRoomNo,
        totalPrice: result.updated.totalPrice,
      },
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[admin/bookings/transfer] POST error:', error)
    return NextResponse.json({ error: 'Failed to move the booking' }, { status: 500 })
  }
}
