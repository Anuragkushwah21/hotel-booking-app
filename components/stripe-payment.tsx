'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react'

interface StripePaymentProps {
  bookingId: string
  hotelName: string
  roomType: string
  totalPrice: number
  nights: number
  guestName: string
  guestEmail: string
  onSuccess: () => void
}

export function StripePayment({
  bookingId,
  hotelName,
  roomType,
  totalPrice,
  nights,
  guestName,
  guestEmail,
  onSuccess,
}: StripePaymentProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handlePayment = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/payments/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          hotelName,
          roomType,
          totalPrice,
          nights,
          guestName,
          guestEmail,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create payment session')
      }

      const data = await response.json()

      if (data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="p-8 text-center">
        <div className="mb-6">
          <CheckCircle size={64} className="text-green-600 mx-auto" />
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-4">Payment Successful!</h2>
        <p className="text-foreground/70 mb-6">
          Your booking has been confirmed and a confirmation email has been sent.
        </p>
        <Link href="/bookings">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            View My Bookings
          </Button>
        </Link>
      </Card>
    )
  }

  return (
    <Card className="p-8">
      <h3 className="text-2xl font-bold text-foreground mb-6">Complete Payment</h3>

      <div className="mb-6 p-4 bg-muted rounded-lg">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-foreground/70">Amount to Pay:</span>
            <span className="font-bold text-foreground text-lg">${totalPrice}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground/70">Payment Method:</span>
            <span className="text-foreground">Credit Card (Secure)</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg flex gap-3">
          <AlertCircle className="text-destructive flex-shrink-0" size={20} />
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      <p className="text-sm text-foreground/70 mb-6">
        We use Stripe to process payments securely. Your card information is encrypted and safe.
      </p>

      <Button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 flex items-center justify-center gap-2"
      >
        <CreditCard size={20} />
        {loading ? 'Processing...' : `Pay $${totalPrice} with Stripe`}
      </Button>

      <p className="text-xs text-foreground/50 text-center mt-4">
        By clicking "Pay", you agree to our terms and conditions
      </p>
    </Card>
  )
}
