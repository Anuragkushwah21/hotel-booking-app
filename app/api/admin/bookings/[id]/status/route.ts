import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction } from '@/lib/manager-log'
import { notifySafely, sendCheckOutFollowUp } from '@/lib/notifications'
import type { BookingStatus, ManagerActionType } from '@prisma/client'

/**
 * POST /api/admin/bookings/[id]/status  { action: "CONFIRM" | "CHECK_IN" | "CHECK_OUT" }
 *
 * Front-desk state transitions. Guarded so the desk can't check out a guest who
 * never checked in, or check in a cancelled booking.
 *
 * Note: Room.status is deliberately NOT flipped to BOOKED on check-in.
 * Occupancy is derived from bookings; Room.status describes whether the room is
 * part of sellable inventory at all (AVAILABLE vs MAINTENANCE). Flipping it
 * would make the room unsellable for every *future* date too.
 */

const TRANSITIONS: Record<string, { from: BookingStatus[]; to: BookingStatus; audit: ManagerActionType }> = {
  CONFIRM:   { from: ['PENDING'],              to: 'CONFIRMED',   audit: 'MODIFY_BOOKING' },
  CHECK_IN:  { from: ['CONFIRMED'],            to: 'CHECKED_IN',  audit: 'CHECK_IN' },
  CHECK_OUT: { from: ['CHECKED_IN'],           to: 'CHECKED_OUT', audit: 'CHECK_OUT' },
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const { action, notes } = await req.json()

    const transition = TRANSITIONS[action]
    if (!transition) {
      return NextResponse.json(
        { error: `Unknown action. Expected one of: ${Object.keys(TRANSITIONS).join(', ')}` },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.findUnique({ where: { id } })
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (!transition.from.includes(booking.status)) {
      return NextResponse.json(
        {
          error: `Cannot ${action.toLowerCase().replace('_', '-')} a booking that is ${booking.status}`,
          currentStatus: booking.status,
        },
        { status: 409 },
      )
    }

    // Don't let an unpaid guest walk in without the desk noticing.
    if (action === 'CHECK_IN' && booking.paymentStatus === 'PENDING') {
      if (req.nextUrl.searchParams.get('force') !== 'true') {
        return NextResponse.json(
          {
            error: 'Payment is still pending for this booking',
            code: 'PAYMENT_PENDING',
            hint: 'Collect payment first, or retry with ?force=true to check in anyway.',
          },
          { status: 409 },
        )
      }
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: transition.to,
        // Clearing the hold stops an expired online booking being auto-cancelled
        // after the desk has confirmed it.
        holdExpiresAt: null,
        ...(action === 'CHECK_IN' ? { checkedInAt: new Date() } : {}),
        ...(action === 'CHECK_OUT' ? { checkedOutAt: new Date() } : {}),
      },
      include: {
        room: { select: { name: true, roomNo: true } },
        table: { select: { tableNo: true } },
      },
    })

    // Checking out is what opens up the review, so nudge the guest for one.
    if (action === 'CHECK_OUT') {
      notifySafely(() => sendCheckOutFollowUp(updated as any))
    }

    await logManagerAction(auth.user.id, transition.audit, {
      bookingId: id,
      notes: notes?.trim() || null,
      metadata: { from: booking.status, to: transition.to },
    })

    return NextResponse.json({
      success: true,
      message: `Booking ${transition.to.toLowerCase().replace('_', ' ')}`,
      booking: {
        id: updated.id,
        status: updated.status,
        checkedInAt: updated.checkedInAt,
        checkedOutAt: updated.checkedOutAt,
      },
    })
  } catch (error) {
    console.error('[admin/bookings/status] POST error:', error)
    return NextResponse.json({ error: 'Failed to update booking status' }, { status: 500 })
  }
}
