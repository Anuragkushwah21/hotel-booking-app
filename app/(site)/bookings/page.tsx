'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-toastify'
import {
  BedDouble, Calendar, FileText, KeyRound, Loader2, Mail, MessageSquare, Phone, Search,
  UtensilsCrossed, Users, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ReviewForm, type BookingReview } from '@/components/site/review-form'
import { PayButton } from '@/components/site/pay-button'
import {
  BookingStatusBadge, PaymentStatusBadge, RefundStatusBadge, bookingTitle,
} from '@/components/site/booking-badges'
import { formatDate, formatDateTime, formatINR } from '@/lib/format'
import type { GuestBookingView } from '@/lib/booking-view'

type Booking = Omit<GuestBookingView, 'review'> & { review: BookingReview | null }

function MyBookingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toCancel, setToCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/bookings/me', { cache: 'no-store' })
      const data = await res.json()
      if (res.status === 401) {
        router.replace('/login?next=/bookings')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load bookings')
      setBookings(data.bookings || [])
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load bookings'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void fetchBookings()
  }, [fetchBookings])

  // Arriving from checkout / an older payment redirect.
  useEffect(() => {
    if (searchParams.get('payment') === 'success' || searchParams.get('booked') === '1') {
      toast.success('Payment received — your booking is confirmed.', { toastId: 'booked' })
      router.replace('/bookings')
    }
  }, [searchParams, router])

  // Fold a freshly saved review back into the list without a refetch
  const handleReviewSaved = (bookingId: string, review: BookingReview) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, review, canReview: false } : b)),
    )
  }

  const confirmCancel = async () => {
    if (!toCancel) return
    try {
      setCancelling(true)
      const res = await fetch(`/api/bookings/${toCancel.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel booking')
      toast.success(data.message || 'Booking cancelled')
      setToCancel(null)
      void fetchBookings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Card className="p-10 text-center">
          <p className="mb-2 text-lg font-semibold text-destructive">Error</p>
          <p className="text-muted-foreground">{error}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={fetchBookings}>Try again</Button>
            {/* Signed-out or front-desk guests can still get to their booking. */}
            <Button variant="outline" asChild>
              <Link href="/booking-status"><Search className="mr-2 h-4 w-4" />See your booking</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Card className="p-10 text-center">
          <BedDouble className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mb-2 text-lg font-semibold">No bookings yet</p>
          <p className="mb-4 text-muted-foreground">
            You haven&apos;t made any bookings. Start exploring rooms and tables!
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/rooms">Browse rooms</Link></Button>
            <Button variant="outline" asChild><Link href="/tables/reserve">Reserve a table</Link></Button>
          </div>
          <p className="mb-3 mt-6 text-sm text-muted-foreground">
            Booked at our front desk? Those don&apos;t appear here — look it up with your booking number.
          </p>
          <Button variant="outline" asChild>
            <Link href="/booking-status"><Search className="mr-2 h-4 w-4" />See your booking</Link>
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Bookings</h1>
          <p className="mt-1 text-muted-foreground">Manage and view all your bookings</p>
        </div>
        <Badge variant="secondary" className="px-4 py-2 text-lg">
          {bookings.length} {bookings.length === 1 ? 'Booking' : 'Bookings'}
        </Badge>
      </div>

      {/* Walk-in bookings live on the front desk's records, not here. */}
      <Card className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          This list covers the bookings you made online. Booked at our front desk?
          Look it up with your booking number.
        </p>
        <Button variant="outline" className="shrink-0" asChild>
          <Link href="/booking-status"><Search className="mr-2 h-4 w-4" />See your booking</Link>
        </Button>
      </Card>

      <div className="space-y-4">
        {bookings.map((booking) => {
          const hasRoom = booking.type === 'ROOM' || booking.type === 'ROOM_TABLE'
          const hasTable = booking.type === 'TABLE' || booking.type === 'ROOM_TABLE'

          return (
            <Card key={booking.id} className="overflow-hidden">
              <div className="space-y-4 p-6">
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-bold">{bookingTitle(booking)}</h3>
                      <BookingStatusBadge status={booking.status} />
                      <PaymentStatusBadge status={booking.paymentStatus} />
                      <RefundStatusBadge status={booking.refundStatus} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Booking number:{' '}
                      <span className="font-mono font-semibold tracking-wider text-foreground">
                        {booking.reference}
                      </span>
                    </p>
                    {hasRoom && booking.roomNo && (
                      <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                        <KeyRound className="h-4 w-4 text-primary" aria-hidden />
                        Room {booking.roomNo}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary tabular-nums">{formatINR(booking.totalPrice)}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="mt-1 text-sm tabular-nums">
                      Paid <span className="font-semibold">{formatINR(booking.paidAmount)}</span>
                    </p>
                    {booking.remainingAmount > 0 && !['CANCELLED', 'NO_SHOW'].includes(booking.status) && (
                      <p className="text-sm tabular-nums text-amber-700">
                        Due at check-in {formatINR(booking.remainingAmount)}
                      </p>
                    )}
                    {booking.refundAmount > 0 && (
                      <p className="text-sm tabular-nums text-violet-700">
                        Refund {formatINR(booking.refundAmount)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-2">
                  {hasRoom && booking.checkInDate && booking.checkOutDate && (
                    <Detail icon={Calendar} label="Check-in & Check-out">
                      {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
                    </Detail>
                  )}
                  {hasTable && booking.bookingDate && (
                    <Detail icon={UtensilsCrossed} label={`Table ${booking.tableNo ?? ''}`.trim()}>
                      {formatDateTime(booking.bookingDate)}
                      {booking.tableLocation ? ` · ${booking.tableLocation}` : ''}
                      {' · '}{booking.tableGuestCount ?? booking.guestCount} diner
                      {(booking.tableGuestCount ?? booking.guestCount) === 1 ? '' : 's'}
                    </Detail>
                  )}
                  <Detail icon={Users} label="Guests">
                    {booking.guestName} · {booking.guestCount} {booking.guestCount === 1 ? 'guest' : 'guests'}
                  </Detail>
                  <Detail icon={Mail} label="Email">{booking.guestEmail}</Detail>
                  {booking.guestPhone && <Detail icon={Phone} label="Phone">{booking.guestPhone}</Detail>}
                  {booking.specialRequest && (
                    <Detail icon={MessageSquare} label="Special request" wide>{booking.specialRequest}</Detail>
                  )}
                  {booking.status === 'CANCELLED' && booking.cancelReason && (
                    <Detail icon={X} label="Cancellation" wide>
                      {booking.cancelReason}
                      {booking.refundNote ? ` — ${booking.refundNote}` : ''}
                    </Detail>
                  )}
                </div>

                {booking.awaitingPayment && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-900">
                      Payment not completed. Pay {formatINR(booking.advanceAmount || booking.totalPrice)} to confirm.
                    </p>
                    <PayButton bookingId={booking.id} amount={booking.advanceAmount || booking.totalPrice} size="sm" label="Complete payment" />
                  </div>
                )}

                {/* Post-stay review */}
                {booking.status === 'CHECKED_OUT' && (
                  <div className="border-t pt-4">
                    <ReviewForm
                      bookingId={booking.id}
                      review={booking.review}
                      onSaved={(review) => handleReviewSaved(booking.id, review)}
                    />
                  </div>
                )}

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Booked on {formatDate(booking.createdAt)}
                    {booking.paymentRuleLabel ? ` · ${booking.paymentRuleLabel}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(booking.status) && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/invoice/${booking.id}`} target="_blank" rel="noopener">
                          <FileText className="mr-2 h-4 w-4" aria-hidden />
                          Download invoice
                        </Link>
                      </Button>
                    )}
                    {booking.status !== 'PENDING' && booking.status !== 'CANCELLED' && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/booking-confirmed/${booking.id}`}>View details</Link>
                      </Button>
                    )}
                    {booking.canCancel && (
                      <Button variant="destructive" size="sm" onClick={() => setToCancel(booking)}>
                        <X className="mr-2 h-4 w-4" aria-hidden />
                        Cancel booking
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!toCancel} onOpenChange={(open) => !open && !cancelling && setToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking {toCancel?.reference}?</DialogTitle>
            <DialogDescription>
              {toCancel?.refundPreview
                ? toCancel.refundPreview.message
                : toCancel && toCancel.paidAmount > 0
                  ? 'Under our cancellation policy this booking is not eligible for a refund.'
                  : 'Nothing has been paid, so there is nothing to refund.'}{' '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={cancelling} onClick={() => setToCancel(null)}>
              Keep booking
            </Button>
            <Button variant="destructive" disabled={cancelling} onClick={confirmCancel}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Yes, cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Detail({
  icon: IconCmp,
  label,
  children,
  wide,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 ${wide ? 'md:col-span-2' : ''}`}>
      <IconCmp className="mt-0.5 h-5 w-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

export default function MyBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading bookings…
        </div>
      }
    >
      <MyBookingsContent />
    </Suspense>
  )
}
