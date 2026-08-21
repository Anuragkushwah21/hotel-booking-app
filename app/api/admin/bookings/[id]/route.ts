import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction, getBookingAuditTrail } from '@/lib/manager-log'
import {
  notifySafely,
  sendBookingCancellation,
  sendBookingModified,
} from '@/lib/notifications'
import {
  BookingError,
  checkRoomAvailability,
  nightsBetween,
  priceAddOns,
  validAddOnCodes,
} from '@/lib/booking-engine'
import type { PaymentStatus } from '@prisma/client'

const included = {
  room: { select: { id: true, name: true, roomNo: true, price: true } },
  table: { select: { id: true, tableNo: true, location: true } },
  user: { select: { id: true, name: true, email: true, phone: true } },
  bookedBy: { select: { id: true, name: true, email: true } },
}

/** GET — one booking plus its audit trail. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id }, include: included })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  return NextResponse.json({ booking, auditTrail: await getBookingAuditTrail(id) })
}

/**
 * PATCH — modify an existing booking.
 *
 * Date changes are re-checked against live availability (excluding this
 * booking's own row) and the total is recomputed server-side, so a manager
 * cannot accidentally move a guest onto an occupied room.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await req.json()

    const existing = await prisma.booking.findUnique({ where: { id }, include: { room: true } })
    if (!existing) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    if (existing.status === 'CANCELLED' || existing.status === 'CHECKED_OUT') {
      return NextResponse.json(
        { error: `A ${existing.status.toLowerCase()} booking cannot be modified` },
        { status: 409 },
      )
    }

    const data: Record<string, unknown> = {}
    const changes: Record<string, unknown> = {}

    for (const field of ['guestName', 'guestEmail', 'guestPhone', 'specialRequest'] as const) {
      if (typeof body[field] === 'string' && body[field] !== (existing as any)[field]) {
        data[field] = body[field].trim() || null
        changes[field] = body[field]
      }
    }

    if (body.paymentStatus) {
      const valid: PaymentStatus[] = ['PENDING', 'PAID', 'FAILED', 'REFUNDED']
      if (!valid.includes(body.paymentStatus)) {
        return NextResponse.json({ error: 'Invalid paymentStatus' }, { status: 400 })
      }
      data.paymentStatus = body.paymentStatus
      changes.paymentStatus = body.paymentStatus
      // A booking that's been paid for should stop expiring.
      if (body.paymentStatus === 'PAID') data.holdExpiresAt = null
    }

    if (body.paymentMode) {
      data.paymentMode = body.paymentMode
      changes.paymentMode = body.paymentMode
    }

    const guestCount = body.guestCount != null ? Number(body.guestCount) : existing.guestCount
    const addOns =
      body.addOns !== undefined ? validAddOnCodes(body.addOns) : existing.addOns

    // --- room date change ---
    if (existing.type === 'ROOM' && (body.checkInDate || body.checkOutDate)) {
      const checkIn = new Date(body.checkInDate ?? existing.checkInDate!)
      const checkOut = new Date(body.checkOutDate ?? existing.checkOutDate!)

      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
        return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
      }
      if (checkIn >= checkOut) {
        return NextResponse.json({ error: 'Check-out must be after check-in' }, { status: 400 })
      }

      const availability = await checkRoomAvailability(existing.roomId!, checkIn, checkOut, {
        excludeBookingId: id,
      })
      if (!availability.available) {
        return NextResponse.json(
          { error: availability.reason ?? 'Room unavailable for the new dates' },
          { status: 409 },
        )
      }

      data.checkInDate = checkIn
      data.checkOutDate = checkOut
      changes.checkInDate = checkIn
      changes.checkOutDate = checkOut
    }

    // --- recompute money whenever anything price-bearing moved ---
    if (existing.type === 'ROOM' && existing.room) {
      const checkIn = (data.checkInDate as Date) ?? existing.checkInDate!
      const checkOut = (data.checkOutDate as Date) ?? existing.checkOutDate!
      const nights = nightsBetween(checkIn, checkOut)

      if (guestCount > existing.room.capacity) {
        return NextResponse.json(
          { error: `Room holds ${existing.room.capacity} guest(s)` },
          { status: 400 },
        )
      }

      const baseAmount = nights * existing.room.price
      const addOnsAmount = priceAddOns(addOns, nights, guestCount)
      data.baseAmount = baseAmount
      data.addOnsAmount = addOnsAmount
      data.totalPrice = baseAmount + addOnsAmount
    }

    if (body.guestCount != null) {
      data.guestCount = guestCount
      changes.guestCount = guestCount
    }
    if (body.addOns !== undefined) {
      data.addOns = addOns
      changes.addOns = addOns
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await prisma.booking.update({
      where: { id },
      data,
      include: included,
    })

    await logManagerAction(auth.user.id, 'MODIFY_BOOKING', {
      bookingId: id,
      notes: body.notes?.trim() || null,
      metadata: { changes, newTotal: updated.totalPrice },
    })

    notifySafely(() => sendBookingModified(updated as any))

    return NextResponse.json({ success: true, message: 'Booking updated', booking: updated })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[admin/bookings/id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}

/**
 * DELETE — cancel with an optional refund.
 * Always a soft cancel: the row is retained for reporting and audit.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { reason, refundAmount } = body

    const booking = await prisma.booking.findUnique({ where: { id }, include: included })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    if (booking.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Booking is already cancelled' }, { status: 409 })
    }
    if (booking.status === 'CHECKED_OUT') {
      return NextResponse.json(
        { error: 'A completed stay cannot be cancelled' },
        { status: 409 },
      )
    }

    let refund = 0
    if (refundAmount != null) {
      const n = Number(refundAmount)
      if (!Number.isFinite(n) || n < 0 || n > booking.totalPrice) {
        return NextResponse.json(
          { error: `Refund must be between 0 and ${booking.totalPrice}` },
          { status: 400 },
        )
      }
      refund = Math.round(n)
    }

    if (refund > 0 && booking.paymentStatus !== 'PAID') {
      return NextResponse.json(
        { error: 'Cannot refund a booking that was never paid' },
        { status: 400 },
      )
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason?.trim() || 'Cancelled by hotel staff',
        refundAmount: refund,
        ...(refund > 0 ? { paymentStatus: 'REFUNDED' as const } : {}),
      },
      include: included,
    })

    await logManagerAction(auth.user.id, refund > 0 ? 'REFUND' : 'CANCEL_BOOKING', {
      bookingId: id,
      notes: reason?.trim() || null,
      metadata: {
        previousStatus: booking.status,
        refundAmount: refund,
        totalPrice: booking.totalPrice,
      },
    })

    notifySafely(() => sendBookingCancellation(updated as any, refund))

    return NextResponse.json({
      success: true,
      message: refund > 0 ? `Booking cancelled, ₹${refund} refunded` : 'Booking cancelled',
      booking: { id: updated.id, status: updated.status, refundAmount: updated.refundAmount },
    })
  } catch (error) {
    console.error('[admin/bookings/id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
