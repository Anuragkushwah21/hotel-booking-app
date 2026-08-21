import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { notifySafely, sendBookingConfirmation, sendBookingCancellation } from '@/lib/notifications'

/**
 * Stripe webhook.
 *
 * Rewritten against Prisma. The previous version imported `@/lib/db` (deleted)
 * and issued raw SQL against snake_case columns that Prisma never created, so
 * no payment was ever recorded.
 *
 * This is the only thing that moves an online booking from PENDING to
 * CONFIRMED/PAID, and clearing `holdExpiresAt` here is what stops a paid
 * booking being swept up by the auto-release job.
 */

/**
 * Constructed lazily. At module scope this throws during `next build` on any
 * environment without STRIPE_SECRET_KEY, which fails the whole build.
 */
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key)
}

const withInventory = {
  room: { select: { name: true, roomNo: true } },
  table: { select: { tableNo: true, location: true } },
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    console.error('[webhook] signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const bookingId = session.metadata?.bookingId
        if (!bookingId) break

        const booking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            stripePaymentId:
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id ?? null,
            // A paid booking must stop expiring.
            holdExpiresAt: null,
          },
          include: withInventory,
        })

        notifySafely(() => sendBookingConfirmation(booking as any))
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        const bookingId = session.metadata?.bookingId
        if (!bookingId) break

        // Only release if still unpaid — a late webhook must not undo a payment.
        await prisma.booking.updateMany({
          where: { id: bookingId, paymentStatus: { in: ['PENDING', 'FAILED'] } },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'Checkout session expired',
          },
        })
        break
      }

      case 'charge.failed': {
        const charge = event.data.object as Stripe.Charge
        const bookingId = charge.metadata?.bookingId
        if (!bookingId) break

        await prisma.booking.updateMany({
          where: { id: bookingId, paymentStatus: { not: 'PAID' } },
          data: { paymentStatus: 'FAILED' },
        })
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const bookingId = charge.metadata?.bookingId
        if (!bookingId) break

        const booking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'REFUNDED',
            // Stripe reports in the smallest unit; our totals are whole INR.
            refundAmount: Math.round((charge.amount_refunded ?? 0) / 100),
            cancelledAt: new Date(),
            cancelReason: 'Payment refunded',
          },
          include: withInventory,
        })

        notifySafely(() => sendBookingCancellation(booking as any, booking.refundAmount))
        break
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(`[webhook] failed handling ${event.type}:`, error)
    // 500 tells Stripe to retry — correct for transient DB failures.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
