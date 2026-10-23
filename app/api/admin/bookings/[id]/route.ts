import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction, getBookingAuditTrail } from '@/lib/manager-log'
import { dispatchNotifications, notifyBooking, notifySafely } from '@/lib/notifications'
import {
  BookingError,
  checkRoomAvailability,
  nightsBetween,
  priceAddOns,
  validAddOnCodes,
} from '@/lib/booking-engine'
import { cancelBooking, quoteRefund } from '@/lib/cancellation'
import { setPaymentStatus, paymentStatusFor } from '@/lib/desk-payments'
import { getHotelSettings, getPricingCalendar } from '@/lib/settings'
import { priceTable, quoteStay } from '@/lib/pricing'
import { deskModes, parseData } from '@/lib/validation'

const included = {
  room: { select: { id: true, name: true, roomNo: true, price: true } },
  table: { select: { id: true, tableNo: true, location: true } },
  user: { select: { id: true, name: true, email: true, phone: true } },
  bookedBy: { select: { id: true, name: true, email: true } },
}

/** GET — one booking plus its audit trail, payment ledger and notification log. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      ...included,
      payments: {
        orderBy: { createdAt: 'desc' },
        include: { recordedBy: { select: { name: true, email: true } } },
      },
      notifications: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const settings = await getHotelSettings()
  return NextResponse.json({
    booking,
    auditTrail: await getBookingAuditTrail(id),
    // What the policy would refund if this booking were cancelled right now.
    refundPreview: booking.paidAmount > 0 ? quoteRefund(booking, settings) : null,
  })
}

const patchSchema = z.object({
  guestName: z.string().trim().min(1).max(120).optional(),
  guestEmail: z.string().trim().toLowerCase().email().optional(),
  guestPhone: z.string().trim().max(20).optional(),
  specialRequest: z.string().trim().max(1000).optional(),
  adminNotes: z.string().trim().max(2000).optional(),
  paymentStatus: z.enum(['PAID', 'PENDING']).optional(),
  paymentMode: deskModes.optional(),
  guestCount: z.coerce.number().int().min(1).max(50).optional(),
  addOns: z.array(z.string()).optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
})

/**
 * PATCH — modify an existing booking.
 *
 * Date changes are re-checked against live availability (excluding this
 * booking's own row) and the total is recomputed server-side with the current
 * pricing rules, so a manager cannot accidentally move a guest onto an
 * occupied room. Paid/unpaid changes go through the payment ledger.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = parseData(await req.json().catch(() => ({})), patchSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const { id } = await params

    const existing = await prisma.booking.findUnique({ where: { id }, include: { room: true } })
    if (!existing) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    if (existing.status === 'CANCELLED' || existing.status === 'CHECKED_OUT') {
      return NextResponse.json(
        { error: `A ${existing.status.toLowerCase().replace('_', ' ')} booking cannot be modified` },
        { status: 409 },
      )
    }

    // Paid / unpaid toggle is its own operation with its own ledger lines.
    if (body.paymentStatus) {
      const { notificationIds } = await setPaymentStatus({
        bookingId: id,
        managerId: auth.user.id,
        status: body.paymentStatus,
        mode: body.paymentMode,
        notes: body.notes,
      })
      notifySafely(() => dispatchNotifications(notificationIds))
    }

    const data: Record<string, unknown> = {}
    const changes: Record<string, unknown> = {}

    for (const field of ['guestName', 'guestEmail', 'guestPhone', 'specialRequest', 'adminNotes'] as const) {
      if (body[field] !== undefined && body[field] !== (existing as any)[field]) {
        data[field] = body[field] || null
        changes[field] = body[field]
      }
    }
    if (body.paymentMode && !body.paymentStatus) {
      data.paymentMode = body.paymentMode
      changes.paymentMode = body.paymentMode
    }

    const guestCount = body.guestCount ?? existing.guestCount
    const addOns = body.addOns !== undefined ? validAddOnCodes(body.addOns) : existing.addOns
    const hasRoom = existing.type === 'ROOM' || existing.type === 'ROOM_TABLE'

    // --- room date change ---
    if (hasRoom && (body.checkInDate || body.checkOutDate)) {
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
    const priceMoved = data.checkInDate || body.guestCount != null || body.addOns !== undefined
    if (hasRoom && existing.room && priceMoved) {
      const checkIn = (data.checkInDate as Date) ?? existing.checkInDate!
      const checkOut = (data.checkOutDate as Date) ?? existing.checkOutDate!
      const nights = nightsBetween(checkIn, checkOut)

      if (guestCount > existing.room.capacity) {
        return NextResponse.json(
          { error: `Room holds ${existing.room.capacity} guest(s)` },
          { status: 400 },
        )
      }

      const [settings, calendar] = await Promise.all([
        getHotelSettings(),
        getPricingCalendar(checkIn, checkOut),
      ])
      const addOnsAmount = priceAddOns(addOns, nights, guestCount)
      const quote = quoteStay({
        room: existing.room,
        checkIn,
        nights,
        addOnsAmount,
        table: existing.tableAmount
          ? priceTable(existing.tableGuestCount ?? guestCount, settings)
          : null,
        settings,
        calendar,
        now: existing.createdAt,
      })
      data.roomAmount = quote.roomAmount
      data.baseAmount = quote.roomAmount + quote.tableAmount
      data.addOnsAmount = addOnsAmount
      data.taxAmount = quote.taxAmount
      data.totalPrice = quote.total

      // Re-read paid amount: a payment status change above may have moved it.
      const fresh = await prisma.booking.findUniqueOrThrow({ where: { id }, select: { paidAmount: true } })
      data.remainingAmount = Math.max(0, quote.total - fresh.paidAmount)
      data.paymentStatus = paymentStatusFor(fresh.paidAmount, quote.total)
    }

    if (body.guestCount != null) {
      data.guestCount = guestCount
      changes.guestCount = guestCount
    }
    if (body.addOns !== undefined) {
      data.addOns = addOns
      changes.addOns = addOns
    }

    if (Object.keys(data).length === 0 && !body.paymentStatus) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated =
      Object.keys(data).length > 0
        ? await prisma.booking.update({ where: { id }, data, include: included })
        : await prisma.booking.findUniqueOrThrow({ where: { id }, include: included })

    if (Object.keys(changes).length > 0) {
      await logManagerAction(auth.user.id, 'MODIFY_BOOKING', {
        bookingId: id,
        notes: body.notes || null,
        metadata: { changes, newTotal: updated.totalPrice },
      })
      // Internal notes aren't worth emailing the guest about.
      const guestVisible = Object.keys(changes).some((k) => k !== 'adminNotes')
      if (guestVisible) notifySafely(() => notifyBooking(id, 'BOOKING_MODIFIED'))
    }

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
 * DELETE — cancel. Body: { reason?, refundAmount? }
 *
 * Without `refundAmount` the cancellation policy decides the refund; with it,
 * staff override the policy (0 … amount paid). Either way the refund is
 * created as REFUND_PENDING and paid out from the Refunds action.
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
    const override =
      body?.refundAmount === undefined || body?.refundAmount === null || body?.refundAmount === ''
        ? null
        : Number(body.refundAmount)

    const { booking, refund, notificationIds } = await cancelBooking({
      actor: 'STAFF',
      managerId: auth.user.id,
      bookingId: id,
      reason: typeof body?.reason === 'string' ? body.reason : null,
      refundOverride: override,
    })
    notifySafely(() => dispatchNotifications(notificationIds))

    return NextResponse.json({
      success: true,
      message:
        refund > 0
          ? `Booking cancelled — refund of ₹${refund.toLocaleString('en-IN')} pending`
          : 'Booking cancelled',
      booking: {
        id: booking.id,
        status: booking.status,
        refundAmount: booking.refundAmount,
        refundStatus: booking.refundStatus,
      },
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[admin/bookings/id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 })
  }
}
