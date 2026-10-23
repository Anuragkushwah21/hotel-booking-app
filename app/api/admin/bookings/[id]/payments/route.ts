import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BookingError } from '@/lib/booking-engine'
import { recordDeskPayment } from '@/lib/desk-payments'
import { dispatchNotifications, notifySafely } from '@/lib/notifications'
import { deskPaymentSchema, parseJson } from '@/lib/validation'

/** GET — payment ledger for one booking. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const { id } = await params
  const payments = await prisma.payment.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: 'desc' },
    include: { recordedBy: { select: { name: true, email: true } } },
  })
  return NextResponse.json({ payments })
}

/**
 * POST — collect money at the desk { amount, mode: CASH|CARD|UPI, notes? }.
 * Typically the balance at check-in. Also confirms an unpaid booking.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, deskPaymentSchema)
  if (!parsed.ok) return parsed.response

  try {
    const { id } = await params
    const { booking, notificationIds } = await recordDeskPayment({
      bookingId: id,
      managerId: auth.user.id,
      amount: parsed.data.amount,
      mode: parsed.data.mode,
      notes: parsed.data.notes,
    })
    notifySafely(() => dispatchNotifications(notificationIds))
    return NextResponse.json({
      success: true,
      message: `₹${parsed.data.amount.toLocaleString('en-IN')} recorded`,
      booking: {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paidAmount: booking.paidAmount,
        remainingAmount: booking.remainingAmount,
      },
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[admin/bookings/id/payments] POST error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
