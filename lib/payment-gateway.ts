/**
 * Payment gateway adapter.
 *
 * Razorpay (INR, UPI, cards, netbanking) is used when RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET are set. It is called over its REST API, so there is no
 * SDK dependency.
 *
 * Without keys, a MOCK gateway lets the whole booking → payment →
 * auto-confirm flow run locally. MOCK is refused in production unless
 * PAYMENT_ALLOW_MOCK=true is set explicitly.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export type GatewayName = 'RAZORPAY' | 'MOCK'

export class PaymentGatewayError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
    this.name = 'PaymentGatewayError'
  }
}

const RZP_API = 'https://api.razorpay.com/v1'

function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  return keyId && keySecret ? { keyId, keySecret } : null
}

export function activeGateway(): GatewayName {
  if (razorpayKeys()) return 'RAZORPAY'
  if (process.env.NODE_ENV !== 'production' || process.env.PAYMENT_ALLOW_MOCK === 'true') {
    return 'MOCK'
  }
  throw new PaymentGatewayError('Online payments are not configured', 503)
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

async function razorpay<T>(path: string, body: unknown): Promise<T> {
  const keys = razorpayKeys()
  if (!keys) throw new PaymentGatewayError('Razorpay is not configured', 503)

  const res = await fetch(`${RZP_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = (data as any)?.error?.description || `Razorpay request failed (${res.status})`
    throw new PaymentGatewayError(message)
  }
  return data as T
}

export type GatewayOrder = {
  gateway: GatewayName
  orderId: string
  /** Paise — what the checkout widget expects. */
  amountPaise: number
  currency: 'INR'
  /** Public key for the browser widget (Razorpay only). */
  keyId: string | null
}

export async function createGatewayOrder(input: {
  amount: number
  receipt: string
  notes?: Record<string, string>
}): Promise<GatewayOrder> {
  const gateway = activeGateway()
  const amountPaise = Math.round(input.amount * 100)

  if (gateway === 'MOCK') {
    return {
      gateway,
      orderId: `mock_order_${randomBytes(9).toString('hex')}`,
      amountPaise,
      currency: 'INR',
      keyId: null,
    }
  }

  const order = await razorpay<{ id: string; amount: number }>('/orders', {
    amount: amountPaise,
    currency: 'INR',
    receipt: input.receipt.slice(0, 40),
    notes: input.notes ?? {},
  })
  return {
    gateway,
    orderId: order.id,
    amountPaise: order.amount,
    currency: 'INR',
    keyId: razorpayKeys()!.keyId,
  }
}

/** Signature the checkout widget hands back to the browser on success. */
export function verifyCheckoutSignature(input: {
  gateway: string
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  if (input.gateway === 'MOCK') {
    // Only reachable when activeGateway() allows MOCK at all.
    try {
      return activeGateway() === 'MOCK' && input.paymentId.startsWith('mock_pay_')
    } catch {
      return false
    }
  }
  const keys = razorpayKeys()
  if (!keys) return false
  const expected = createHmac('sha256', keys.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex')
  return safeEqual(expected, input.signature)
}

/** X-Razorpay-Signature on webhook deliveries. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(expected, signature)
}

/** Refund a captured Razorpay payment. Returns the gateway refund id. */
export async function refundGatewayPayment(paymentId: string, amount: number): Promise<string> {
  if (paymentId.startsWith('mock_pay_')) return `mock_refund_${randomBytes(6).toString('hex')}`
  const refund = await razorpay<{ id: string }>(`/payments/${paymentId}/refund`, {
    amount: Math.round(amount * 100),
  })
  return refund.id
}
