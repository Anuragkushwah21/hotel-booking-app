'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { CreditCard, FlaskConical, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatINR } from '@/lib/format'

/**
 * "Pay now" for an online booking.
 *
 * Opens a gateway order on the server (the amount comes from the booking's
 * payment rule, never from here), runs Razorpay Checkout, then hands the
 * signed result to /api/payments/verify — which confirms the booking
 * automatically. With no Razorpay keys configured the server runs a MOCK
 * gateway, and this shows a clearly labelled test-mode dialog instead.
 */

type Order = {
  gateway: 'RAZORPAY' | 'MOCK'
  orderId: string
  amount: number
  amountPaise: number
  currency: 'INR'
  keyId: string | null
  hotelName: string
  booking: { id: string; reference: string; guestName: string; guestEmail: string; guestPhone: string | null }
}

type VerifyResult = {
  outcome: 'CONFIRMED' | 'ALREADY_CONFIRMED' | 'INVENTORY_LOST'
  message: string
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void }
  }
}

let razorpayScript: Promise<void> | null = null
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (!razorpayScript) {
    razorpayScript = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        razorpayScript = null
        reject(new Error('Could not load the payment window. Check your connection and try again.'))
      }
      document.body.appendChild(s)
    })
  }
  return razorpayScript
}

export function PayButton({
  bookingId,
  amount,
  label,
  className,
  size = 'lg',
}: {
  bookingId: string
  /** Shown on the button before the order is opened; the server decides the real figure. */
  amount?: number
  label?: string
  className?: string
  size?: 'sm' | 'default' | 'lg'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [mockOrder, setMockOrder] = useState<Order | null>(null)

  const finish = async (orderId: string, paymentId: string, signature: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentId, signature }),
      })
      const data: VerifyResult & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error || 'Payment could not be verified')

      if (data.outcome === 'INVENTORY_LOST') toast.error(data.message, { autoClose: 10000 })
      else toast.success(data.message || 'Payment successful — your booking is confirmed.')
      router.push(`/booking-confirmed/${bookingId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment could not be verified')
      setBusy(false)
    }
  }

  const start = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/payments/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const order: Order & { error?: string } = await res.json()
      if (!res.ok) throw new Error(order.error || 'Could not start payment')

      if (order.gateway === 'MOCK') {
        setMockOrder(order)
        setBusy(false)
        return
      }

      await loadRazorpay()
      if (!window.Razorpay) throw new Error('Payment window unavailable')

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: order.hotelName,
        description: `Booking ${order.booking.reference}`,
        prefill: {
          name: order.booking.guestName,
          email: order.booking.guestEmail,
          contact: order.booking.guestPhone ?? undefined,
        },
        notes: { reference: order.booking.reference },
        theme: { color: '#D97706' },
        handler: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) =>
          finish(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature),
        modal: {
          ondismiss: () => {
            setBusy(false)
            toast.info('Payment was not completed. Your room is held for a few more minutes.')
          },
        },
      })
      rzp.on('payment.failed', (r: any) => {
        toast.error(r?.error?.description || 'Payment failed. Please try again.')
      })
      rzp.open()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start payment')
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" size={size} className={className} onClick={start} disabled={busy}>
        {busy ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Processing…</>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" aria-hidden />
            {label ?? (amount != null ? `Pay ${formatINR(amount)} now` : 'Pay now')}
          </>
        )}
      </Button>

      <Dialog open={!!mockOrder} onOpenChange={(open) => !open && !busy && setMockOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-600" aria-hidden />
              Test mode — simulate payment
            </DialogTitle>
            <DialogDescription>
              No payment gateway is configured, so this is a simulated payment. No money moves.
              Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to take real payments.
            </DialogDescription>
          </DialogHeader>
          {mockOrder && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-amber-900">Booking</span>
                <span className="font-mono font-semibold">{mockOrder.booking.reference}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-amber-900">Amount</span>
                <span className="font-semibold tabular-nums">{formatINR(mockOrder.amount)}</span>
              </div>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={busy} onClick={() => setMockOrder(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (!mockOrder) return
                const paymentId = `mock_pay_${Math.random().toString(36).slice(2, 12)}`
                void finish(mockOrder.orderId, paymentId, 'mock')
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />}
              Simulate successful payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
