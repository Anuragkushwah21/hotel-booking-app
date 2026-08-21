import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveOrCreateGuest } from '@/lib/guests'
import { logManagerAction } from '@/lib/manager-log'
import { notifySafely, sendBookingConfirmation } from '@/lib/notifications'
import {
  BookingError,
  createRoomBooking,
  createTableBooking,
} from '@/lib/booking-engine'
import type { PaymentMode, PaymentStatus } from '@prisma/client'

const PAYMENT_MODES: PaymentMode[] = ['ONLINE', 'CASH', 'CARD', 'UPI']
const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'FAILED', 'REFUNDED']

/**
 * POST /api/admin/bookings/walk-in
 *
 * Creates a booking on behalf of a walk-in guest. Runs through exactly the same
 * booking engine as the public site, so a walk-in and an online booking can
 * never claim the same room.
 */
export async function POST(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const {
      type,
      roomId,
      tableId,
      checkInDate,
      checkOutDate,
      date,
      time,
      guestName,
      guestEmail,
      guestPhone,
      guestCount,
      specialRequest,
      addOns,
      paymentMode,
      paymentStatus,
      priceOverride,
      notes,
    } = body

    if (type !== 'ROOM' && type !== 'TABLE') {
      return NextResponse.json({ error: 'type must be ROOM or TABLE' }, { status: 400 })
    }
    if (!guestName?.trim() || !guestEmail?.trim()) {
      return NextResponse.json(
        { error: 'Guest name and email are required' },
        { status: 400 },
      )
    }

    const mode: PaymentMode = PAYMENT_MODES.includes(paymentMode) ? paymentMode : 'CASH'
    const payStatus: PaymentStatus = PAYMENT_STATUSES.includes(paymentStatus)
      ? paymentStatus
      : 'PENDING'

    if (mode === 'ONLINE') {
      return NextResponse.json(
        { error: 'Walk-in bookings settle at the desk: use CASH, CARD or UPI' },
        { status: 400 },
      )
    }

    // Only an ADMIN may discount off the computed rate.
    let override: number | null = null
    if (priceOverride != null && priceOverride !== '') {
      if (auth.user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Only an administrator can override the price' },
          { status: 403 },
        )
      }
      const n = Number(priceOverride)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'Invalid price override' }, { status: 400 })
      }
      override = Math.round(n)
    }

    const guest = await resolveOrCreateGuest({
      name: guestName.trim(),
      email: guestEmail.trim(),
      phone: guestPhone?.trim() || null,
    })

    const shared = {
      userId: guest.id,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim().toLowerCase(),
      guestPhone: guestPhone?.trim() || null,
      guestCount: Number(guestCount) || 1,
      specialRequest: specialRequest?.trim() || null,
      addOns: Array.isArray(addOns) ? addOns : [],
      source: 'WALK_IN' as const,
      bookedById: auth.user.id,
      paymentMode: mode,
      paymentStatus: payStatus,
      priceOverride: override,
    }

    const result =
      type === 'ROOM'
        ? await createRoomBooking({
            ...shared,
            roomId,
            checkInDate,
            checkOutDate,
          })
        : await createTableBooking({
            ...shared,
            tableId: tableId || null,
            date,
            time,
          })

    const booking = result.booking

    await logManagerAction(auth.user.id, 'CREATE_BOOKING', {
      bookingId: booking.id,
      notes: notes?.trim() || null,
      metadata: {
        type,
        source: 'WALK_IN',
        guestEmail: shared.guestEmail,
        paymentMode: mode,
        paymentStatus: payStatus,
        totalPrice: booking.totalPrice,
        computedTotal: result.computedTotal,
        priceOverridden: override != null,
      },
    })

    notifySafely(() => sendBookingConfirmation(booking as any))

    return NextResponse.json(
      {
        success: true,
        message: 'Walk-in booking created',
        booking: {
          id: booking.id,
          reference: booking.reference,
          type: booking.type,
          source: booking.source,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          paymentMode: booking.paymentMode,
          guestName: booking.guestName,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          bookingDate: booking.bookingDate,
          baseAmount: booking.baseAmount,
          addOnsAmount: booking.addOnsAmount,
          totalPrice: booking.totalPrice,
          computedTotal: result.computedTotal,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[admin/bookings/walk-in] POST error:', error)
    return NextResponse.json({ error: 'Failed to create walk-in booking' }, { status: 500 })
  }
}

/** GET /api/admin/bookings/walk-in — inventory the walk-in form needs. */
export async function GET(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const [rooms, tables] = await Promise.all([
    prisma.room.findMany({
      where: { status: { not: 'MAINTENANCE' } },
      select: {
        id: true, roomNo: true, name: true, type: true,
        acType: true, capacity: true, price: true, status: true,
      },
      orderBy: { roomNo: 'asc' },
    }),
    prisma.table.findMany({
      where: { status: { not: 'MAINTENANCE' } },
      select: { id: true, tableNo: true, capacity: true, location: true, status: true },
      orderBy: { tableNo: 'asc' },
    }),
  ])

  return NextResponse.json({ rooms, tables })
}
