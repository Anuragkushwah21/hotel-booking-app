'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
type PaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'FAILED' | 'REFUNDED'

type LookupResult = {
  id: string
  reference: string
  type: 'ROOM' | 'TABLE' | 'ROOM_TABLE'
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
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
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
  const [query, setQuery] = useState('')
  const [bookings, setBookings] = useState<LookupResult[]>([])
  const [booking, setBooking] = useState<LookupResult | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // The confirmation email links here with ?ref=<booking number> prefilled.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) setQuery(ref)
  }, [])

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) {
      toast.error('Enter your booking number, email, or mobile number')
      return
    }

    try {
      setLoading(true)
      setError('')
      setBooking(null)
      setBookings([])
      setShowMore(false)

      const res = await fetch('/api/bookings/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to find that booking')
        return
      }

      const matches: LookupResult[] = data.bookings ?? (data.booking ? [data.booking] : [])
      setBookings(matches)
      setBooking(matches[0] ?? null)
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
          Enter your booking number, email address, or mobile number — no account needed.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={lookup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="booking-search">Booking details</Label>
            <Input
              id="booking-search"
              placeholder="Booking no., email, or mobile number"
              value={query}
              disabled={loading}
              onChange={(e) => setQuery(e.target.value)}
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

      {bookings.length > 1 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">{bookings.length} bookings found — select one to view details.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {bookings.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setBooking(item)
                  setShowMore(false)
                }}
                className={`rounded-lg border p-3 text-left text-sm transition hover:border-primary ${
                  booking?.id === item.id ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <span className="block font-mono font-semibold">{item.reference}</span>
                <span className="mt-1 block text-muted-foreground">
                  {item.type === 'TABLE' ? `Table ${item.tableNo ?? ''}` : item.roomName ?? 'Room booking'} · {date(item.createdAt)}
                </span>
              </button>
            ))}
          </div>
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

                {booking.type !== 'TABLE' && booking.roomNo && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4" />
                    Room #{booking.roomNo}
                  </p>
                )}

                {booking.type !== 'ROOM' && booking.tableLocation && (
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
              {booking.type !== 'TABLE' && booking.checkInDate && booking.checkOutDate && (
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

              {booking.type !== 'ROOM' && booking.bookingDate && (
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

            </div>

            {showMore && (
              <div className="grid grid-cols-1 gap-4 border-t pt-4 text-sm md:grid-cols-2">
                <div className="space-y-1 text-muted-foreground">
                  <p>Booked on {date(booking.createdAt)}{booking.source === 'WALK_IN' ? ' at our front desk' : ' online'}</p>
                  <p>Base amount: ₹{booking.baseAmount.toLocaleString()}</p>
                  {booking.addOnsAmount > 0 && <p>Add-ons amount: ₹{booking.addOnsAmount.toLocaleString()}</p>}
                  {booking.refundAmount > 0 && <p>Refund issued: ₹{booking.refundAmount.toLocaleString()}</p>}
                  {booking.checkedInAt && <p>Checked in: {dateTime(booking.checkedInAt)}</p>}
                  {booking.checkedOutAt && <p>Checked out: {dateTime(booking.checkedOutAt)}</p>}
                </div>
                <div className="space-y-3">
                  {booking.addOns.length > 0 && (
                    <div className="flex items-start gap-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Add-ons</p>
                        <p className="text-muted-foreground">{booking.addOns.join(', ')}</p>
                      </div>
                    </div>
                  )}
                  {booking.specialRequest && (
                    <div className="flex items-start gap-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Special request</p>
                        <p className="text-muted-foreground">{booking.specialRequest}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setShowMore((visible) => !visible)}>
                {showMore ? 'Hide details' : 'View more details'}
              </Button>
              <Button type="button" asChild>
                <Link href="/rooms">Book a room</Link>
              </Button>
              <Button type="button" variant="secondary" asChild>
                <Link href="/tables/reserve">Reserve a table</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
