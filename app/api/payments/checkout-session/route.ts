import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { cookies } from 'next/headers'
import { getSessionByToken } from '@/lib/auth'

/**
 * Constructed lazily. At module scope this throws during `next build` on any
 * environment without STRIPE_SECRET_KEY, which fails the whole build.
 */
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key)
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session_token')?.value

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const session = await getSessionByToken(sessionToken)
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const {
      bookingId,
      hotelName,
      roomType,
      totalPrice,
      nights,
      guestName,
      guestEmail,
    } = await request.json()

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${roomType} - ${hotelName}`,
              description: `${nights} night${nights !== 1 ? 's' : ''} stay`,
            },
            unit_amount: Math.round(totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: guestEmail,
      metadata: {
        bookingId,
        userId: session.userId,
        hotelName,
        roomType,
        nights,
      },
      success_url: `${baseUrl}/bookings?payment=success`,
      cancel_url: `${baseUrl}/checkout?hotelId=${hotelName}&roomId=${roomType}&cancelled=true`,
    })

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })
  } catch (error) {
    console.error('[v0] Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
