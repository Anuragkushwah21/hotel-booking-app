import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveOrCreateGuest } from '@/lib/guests'
import { logManagerAction } from '@/lib/manager-log'
import { notifyBooking, notifySafely } from '@/lib/notifications'
import {
  BookingError,
  createRoomBooking,
  createTableBooking,
} from '@/lib/booking-engine'
import { parseJson, walkInSchema } from '@/lib/validation'

/**
 * POST /api/admin/bookings/walk-in
 *
 * Creates a booking on behalf of a walk-in guest: ROOM, TABLE or ROOM_TABLE.
 * Runs through exactly the same booking engine as the public site, so a
 * walk-in and an online booking can never claim the same room.
 *
 * Walk-ins are confirmed on the spot. The desk records how much it collected
 * (paymentStatus PENDING / PARTIALLY_PAID + amountPaid / PAID) and that lands
 * in the payment ledger.
 */
export async function POST(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, walkInSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    // Only an ADMIN may discount off the computed rate.
    if (body.priceOverride != null && auth.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only an administrator can override the price' },
        { status: 403 },
      )
    }

    const guest = await resolveOrCreateGuest({
      name: body.guestName,
      email: body.guestEmail,
      phone: body.guestPhone,
    })

    const shared = {
      userId: guest.id,
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestPhone: body.guestPhone,
      guestCount: body.guestCount,
      specialRequest: body.specialRequest,
      addOns: body.addOns,
      source: 'WALK_IN' as const,
      bookedById: auth.user.id,
      paymentMode: body.paymentMode,
      paymentStatus: body.paymentStatus,
      amountPaid: body.amountPaid,
      priceOverride: body.priceOverride,
      adminNotes: body.notes,
    }

    const result =
      body.type === 'TABLE'
        ? await createTableBooking({
            ...shared,
            tableId: body.tableId || null,
            date: body.date!,
            time: body.time!,
          })
        : await createRoomBooking({
            ...shared,
            roomId: body.roomId!,
            checkInDate: body.checkInDate!,
            checkOutDate: body.checkOutDate!,
            table:
              body.type === 'ROOM_TABLE'
                ? {
                    date: body.date!,
                    time: body.time!,
                    guestCount: body.tableGuestCount ?? body.guestCount,
                    tableId: body.tableId || null,
                    // At the desk the manager asked for both; fail loudly
                    // rather than silently dropping the table.
                    required: true,
                  }
                : null,
          })

    const booking = result.booking

    await logManagerAction(auth.user.id, 'CREATE_BOOKING', {
      bookingId: booking.id,
      notes: body.notes,
      metadata: {
        type: booking.type,
        source: 'WALK_IN',
        guestEmail: shared.guestEmail,
        paymentMode: body.paymentMode,
        paymentStatus: booking.paymentStatus,
        paidAmount: booking.paidAmount,
        totalPrice: booking.totalPrice,
        computedTotal: result.computedTotal,
        priceOverridden: body.priceOverride != null,
      },
    })

    notifySafely(() => notifyBooking(booking.id, 'BOOKING_CONFIRMED'))

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
          roomNo: booking.assignedRoomNo,
          tableNo: booking.table?.tableNo ?? null,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          bookingDate: booking.bookingDate,
          baseAmount: booking.baseAmount,
          roomAmount: booking.roomAmount,
          tableAmount: booking.tableAmount,
          addOnsAmount: booking.addOnsAmount,
          taxAmount: booking.taxAmount,
          totalPrice: booking.totalPrice,
          paidAmount: booking.paidAmount,
          remainingAmount: booking.remainingAmount,
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
        weekendPrice: true, peakPrice: true, eventPrice: true,
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
