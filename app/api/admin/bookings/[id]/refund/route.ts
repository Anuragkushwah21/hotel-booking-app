import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { BookingError } from '@/lib/booking-engine'
import { processRefund } from '@/lib/cancellation'
import { PaymentGatewayError } from '@/lib/payment-gateway'
import { dispatchNotifications, notifySafely } from '@/lib/notifications'
import { parseJson, refundActionSchema } from '@/lib/validation'

/**
 * POST — settle a refund request (ADMIN only).
 *   { action: 'PROCESS', amount?, note? }  pay it out (amount overrides the request)
 *   { action: 'REJECT', note? }            decline it
 *
 * Online payments are refunded through the gateway they came in on; desk
 * payments are recorded as handed back at the desk.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, refundActionSchema)
  if (!parsed.ok) return parsed.response

  try {
    const { id } = await params
    const { booking, notificationIds } = await processRefund({
      bookingId: id,
      managerId: auth.user.id,
      action: parsed.data.action,
      amount: parsed.data.amount,
      note: parsed.data.note,
    })
    notifySafely(() => dispatchNotifications(notificationIds))
    return NextResponse.json({
      success: true,
      message: parsed.data.action === 'REJECT' ? 'Refund rejected' : 'Refund processed',
      booking: {
        id: booking.id,
        refundStatus: booking.refundStatus,
        refundAmount: booking.refundAmount,
        paymentStatus: booking.paymentStatus,
      },
    })
  } catch (error) {
    if (error instanceof BookingError || error instanceof PaymentGatewayError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[admin/bookings/id/refund] POST error:', error)
    return NextResponse.json({ error: 'Failed to process refund' }, { status: 500 })
  }
}
