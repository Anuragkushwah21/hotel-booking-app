'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Calendar,
  MapPin,
  Users,
  Phone,
  CreditCard,
  MessageSquare,
} from 'lucide-react'

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN' | 'CHECKED_OUT'
type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

type LookupResult = {
  id: string
  reference: string
  type: 'ROOM' | 'TABLE'
  source: 'ONLINE' | 'WALK_IN'
  status: BookingStatus
  paymentStatus: PaymentStatus
  paymentMode: string
  guestName: string
  guestCount: number
  guestPhone: string | null
  specialRequest: string | null
  roomName: string | null
  roomNo: string | null
  tableNo: string | null
  tableLocation: string | null
  checkInDate: string | null
  checkOutDate: string | null
  bookingDate: string | null
  checkedInAt: string | null
  checkedOutAt: string | null
  addOns: string[]
  baseAmount: number
  addOnsAmount: number
  totalPrice: number
  refundAmount: number
  createdAt: string
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  CHECKED_IN: 'bg-blue-100 text-blue-800 border-blue-200',
  CHECKED_OUT: 'bg-purple-100 text-purple-800 border-purple-200',
}

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  PENDING: 'bg-orange-100 text-orange-800',
  PAID: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
}

const date = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function BookingStatusPage() {
  const [bookingId, setBookingId] = useState('')
  const [email, setEmail] = useState('')
  const [booking, setBooking] = useState<LookupResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // The confirmation email links here with ?ref=<booking number> prefilled.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) setBookingId(ref)
  }, [])

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bookingId.trim() || !email.trim()) {
      toast.error('Please enter both your booking number and email')
      return
    }

    try {
      setLoading(true)
      setError('')
      setBooking(null)

      const res = await fetch('/api/bookings/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingId.trim(), email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to find that booking')
        return
      }

      setBooking(data.booking)
    } catch (err) {
      console.error('Error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Check your booking</h1>
        <p className="text-muted-foreground mt-1">
          Enter the booking number from your confirmation email (it looks like
          HB-7K4M2Q) — no account needed.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={lookup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bookingId">Booking number</Label>
            <Input
              id="bookingId"
              placeholder="e.g. HB-7K4M2Q"
              value={bookingId}
              disabled={loading}
              onChange={(e) => setBookingId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email on the booking</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            <Search className="h-4 w-4 mr-2" />
            {loading ? 'Searching...' : 'Find my booking'}
          </Button>
        </form>
      </Card>

      {error && (
        <Card className="p-6 text-center">
          <p className="text-red-500 font-semibold mb-1">Not found</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      )}

      {booking && (
        <Card className="overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold">
                    {booking.type === 'ROOM'
                      ? booking.roomName || 'Room Booking'
                      : `Table ${booking.tableNo || 'Booking'}`}
                  </h2>
                  <Badge variant="outline" className={`${STATUS_COLORS[booking.status]} font-semibold`}>
                    {booking.status.replace('_', ' ')}
                  </Badge>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      PAYMENT_COLORS[booking.paymentStatus]
                    }`}
                  >
                    <CreditCard className="h-3 w-3" />
                    {booking.paymentStatus} ({booking.paymentMode})
                  </span>
                </div>

                <p className="text-sm text-muted-foreground">
                  Booking number:{' '}
                  <span className="font-mono font-semibold tracking-wider text-foreground">
                    {booking.reference}
                  </span>
                </p>

                {booking.type === 'ROOM' && booking.roomNo && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4" />
                    Room #{booking.roomNo}
                  </p>
                )}

                {booking.type === 'TABLE' && booking.tableLocation && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4" />
                    {booking.tableLocation}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-primary">
                  ₹{booking.totalPrice.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total Amount</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              {booking.type === 'ROOM' && booking.checkInDate && booking.checkOutDate && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Check-in & Check-out</p>
                    <p className="text-sm text-muted-foreground">
                      {date(booking.checkInDate)} {' → '} {date(booking.checkOutDate)}
                    </p>
                  </div>
                </div>
              )}

              {booking.type === 'TABLE' && booking.bookingDate && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Dining Date & Time</p>
                    <p className="text-sm text-muted-foreground">{dateTime(booking.bookingDate)}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Guest</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.guestName} · {booking.guestCount}{' '}
                    {booking.guestCount === 1 ? 'guest' : 'guests'}
                  </p>
                </div>
              </div>

              {booking.guestPhone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{booking.guestPhone}</p>
                  </div>
                </div>
              )}

              {booking.addOns.length > 0 && (
                <div className="flex items-start gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Add-ons</p>
                    <p className="text-sm text-muted-foreground">
                      {booking.addOns.join(', ')} (₹{booking.addOnsAmount.toLocaleString()})
                    </p>
                  </div>
                </div>
              )}

              {booking.specialRequest && (
                <div className="flex items-start gap-3 md:col-span-2">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Special Request</p>
                    <p className="text-sm text-muted-foreground">{booking.specialRequest}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
              <p>
                Booked on {date(booking.createdAt)}
                {booking.source === 'WALK_IN' ? ' at our front desk' : ' online'}
              </p>
              {booking.checkedInAt && <p>Checked in: {dateTime(booking.checkedInAt)}</p>}
              {booking.checkedOutAt && <p>Checked out: {dateTime(booking.checkedOutAt)}</p>}
              {booking.refundAmount > 0 && (
                <p>Refund issued: ₹{booking.refundAmount.toLocaleString()}</p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
