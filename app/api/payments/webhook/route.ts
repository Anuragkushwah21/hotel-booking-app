import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/payment-gateway'
import { confirmOnlinePayment, failOnlinePayment } from '@/lib/payment-confirmation'
import { dispatchNotifications, notifySafely } from '@/lib/notifications'
import { BookingError } from '@/lib/booking-engine'

/**
 * Razorpay webhook (Dashboard → Settings → Webhooks):
 *   URL     {APP_URL}/api/payments/webhook
 *   Secret  RAZORPAY_WEBHOOK_SECRET
 *   Events  payment.captured, payment.failed
 *
 * The server-to-server twin of /api/payments/verify: it confirms the booking
 * even if the guest closed the tab before the browser callback ran. Both paths
 * go through the same idempotent confirmOnlinePayment().
 *
 * (Replaces the old Stripe webhook, which never matched a real checkout.)
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  if (!verifyWebhookSignature(body, request.headers.get('x-razorpay-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const entity = event?.payload?.payment?.entity
  const orderId: string | undefined = entity?.order_id
  if (!orderId) return NextResponse.json({ received: true })

  try {
    switch (event.event) {
      case 'payment.captured': {
        const { notificationIds } = await confirmOnlinePayment({
          orderId,
          paymentId: entity.id,
          amountPaise: entity.amount,
        })
        notifySafely(() => dispatchNotifications(notificationIds))
        break
      }
      case 'payment.failed':
        await failOnlinePayment(orderId, entity?.error_description || 'Payment failed')
        break
      default:
        // Unhandled events are acknowledged so Razorpay stops retrying.
        break
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    // An order we never created isn't worth retrying.
    if (error instanceof BookingError && error.status === 404) {
      return NextResponse.json({ received: true })
    }
    console.error(`[webhook] failed handling ${event.event}:`, error)
    // 500 tells Razorpay to retry — correct for transient DB failures.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
