'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import {
  ArrowLeft, Calendar, CreditCard, FileText, Loader2, Mail, MapPin, MessageSquare, Phone,
  RotateCw, Search, ShieldCheck, Users, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { OtpInput } from '@/components/site/otp-input'
import { PayButton } from '@/components/site/pay-button'
import {
  BookingStatusBadge, PaymentStatusBadge, RefundStatusBadge, bookingTitle,
} from '@/components/site/booking-badges'
import { formatDate, formatDateTime, formatINR } from '@/lib/format'
import type { GuestBookingView } from '@/lib/booking-view'

/**
 * Guest booking lookup, in two steps so a booking number / email / phone alone
 * is never enough to see someone's booking:
 *
 *   1. POST /api/bookings/lookup         { query }        → a 6-digit code is emailed
 *   2. POST /api/bookings/lookup/verify  { query, code }  → bookings + access cookies
 *
 * The access cookies set in step 2 are what let cancel / pay / the detail page
 * work afterwards for guests without an account.
 */

type Step = 'query' | 'code' | 'results'

const INVOICEABLE = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']
const DEFAULT_RESEND_SECONDS = 30

function useCooldown() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])
  return [seconds, setSeconds] as const
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function BookingStatusPage() {
  const [step, setStep] = useState<Step>('query')
  const [query, setQuery] = useState('')
  const [sentFor, setSentFor] = useState('') // the query the current code was sent for
  const [destinationHint, setDestinationHint] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useCooldown()

  const [bookings, setBookings] = useState<GuestBookingView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [toCancel, setToCancel] = useState<GuestBookingView | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const booking = bookings.find((b) => b.id === selectedId) ?? bookings[0] ?? null

  // The confirmation email links here with ?ref=<booking number> prefilled.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) setQuery(ref)
  }, [])

  const sendCode = useCallback(
    async (value: string, isResend = false) => {
      setSending(true)
      setError('')
      try {
        const res = await fetch('/api/bookings/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: value }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.status === 429) {
          const wait = Number(data.retryAfterSeconds) || 60
          setCooldown(wait)
          setError(data.error || `Too many requests. Please try again in ${mmss(wait)}.`)
          return
        }
        if (!res.ok) {
          setError(data.error || 'Could not send a code. Please try again.')
          return
        }

        setSentFor(value)
        setDestinationHint(data.destinationHint ?? null)
        setSentMessage(data.message || '')
        setCooldown(Number(data.resendAfterSeconds) || DEFAULT_RESEND_SECONDS)
        setCode('')
        setStep('code')
        if (isResend) toast.success('A new code is on its way.')
      } catch {
        setError('Something went wrong. Please check your connection and try again.')
      } finally {
        setSending(false)
      }
    },
    [setCooldown],
  )

  const submitQuery = (e: React.FormEvent) => {
    e.preventDefault()
    const value = query.trim()
    if (!value) {
      setError('Enter your booking number, email, or mobile number.')
      return
    }
    void sendCode(value)
  }

  const verify = async (value = code) => {
    if (verifying) return
    if (!/^\d{6}$/.test(value)) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/lookup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sentFor, code: value }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        let message: string = data.error || 'That code is not valid. Please try again.'
        if (res.status === 429) {
          message = data.error || 'Too many incorrect attempts. Please request a new code later.'
          if (data.retryAfterSeconds) setCooldown(Number(data.retryAfterSeconds))
        } else if (typeof data.attemptsLeft === 'number') {
          message += ` ${data.attemptsLeft} attempt${data.attemptsLeft === 1 ? '' : 's'} left.`
        }
        setError(message)
        setCode('')
        return
      }

      const list: GuestBookingView[] = data.bookings ?? []
      setBookings(list)
      setSelectedId(list[0]?.id ?? null)
      setShowMore(false)
      setStep('results')
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
    } finally {
      setVerifying(false)
    }
  }

  const changeDetails = () => {
    setStep('query')
    setCode('')
    setError('')
    setBookings([])
  }

  /** Re-read one booking after an action (the verify step left an access cookie for it). */
  const refreshBooking = async (id: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok && data.booking) {
        setBookings((prev) => prev.map((b) => (b.id === id ? (data.booking as GuestBookingView) : b)))
      }
    } catch {
      /* the list stays as it was; the toast already told the guest the outcome */
    }
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
      const id = toCancel.id
      setToCancel(null)
      void refreshBooking(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Check your booking</h1>
        <p className="mt-1 text-muted-foreground">
          {step === 'results'
            ? 'Here are the bookings we found for you.'
            : 'Enter your booking number, email address, or mobile number — no account needed.'}
        </p>
      </div>

      {/* ---------------- step 1: details ---------------- */}
      {step === 'query' && (
        <Card className="p-6">
          <form onSubmit={submitQuery} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booking-search">Booking details</Label>
              <Input
                id="booking-search"
                placeholder="e.g. HB-7K4M2Q, you@example.com, or 98765 43210"
                value={query}
                disabled={sending}
                autoComplete="off"
                aria-invalid={!!error}
                aria-describedby="booking-search-help"
                onChange={(e) => {
                  setQuery(e.target.value)
                  setError('')
                }}
              />
              <p id="booking-search-help" className="text-xs text-muted-foreground">
                To keep your booking private, we&apos;ll email a 6-digit code to the address on the booking.
              </p>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={sending || (cooldown > 0 && !!error)} className="w-full sm:w-auto">
              {sending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Sending code…</>
              ) : (
                <><Search className="mr-2 h-4 w-4" aria-hidden />Send me a code</>
              )}
            </Button>
          </form>
        </Card>
      )}

      {/* ---------------- step 2: code ---------------- */}
      {step === 'code' && (
        <Card className="p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void verify()
            }}
            noValidate
            className="space-y-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  {destinationHint ? (
                    <>We&apos;ve sent a 6-digit code to <strong className="break-all text-foreground">{destinationHint}</strong>.</>
                  ) : (
                    sentMessage ||
                    'If we found a booking matching those details, we’ve sent a 6-digit code to the email address on it.'
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The code goes to the email used for the booking. It may take a minute — check your spam folder too.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lookup-code" className="sr-only">6-digit code</Label>
              <OtpInput
                id="lookup-code"
                value={code}
                autoFocus
                disabled={verifying}
                invalid={!!error}
                aria-describedby={error ? 'lookup-code-error' : undefined}
                onChange={(v) => {
                  setCode(v)
                  setError('')
                }}
                onComplete={(v) => void verify(v)}
              />
              {error && (
                <p id="lookup-code-error" role="alert" className="text-center text-sm text-destructive">{error}</p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={verifying || code.length !== 6}>
              {verifying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Verifying…</>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" aria-hidden />Verify and show my booking</>
              )}
            </Button>

            <div className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
              <button
                type="button"
                onClick={changeDetails}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Change details
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={sending || cooldown > 0}
                onClick={() => void sendCode(sentFor, true)}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCw className="mr-2 h-4 w-4" aria-hidden />
                )}
                {cooldown > 0 ? `Resend code in ${mmss(cooldown)}` : 'Resend code'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ---------------- step 3: results ---------------- */}
      {step === 'results' && (
        <>
          {bookings.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="mb-1 font-semibold">No bookings found</p>
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t find any bookings with those details. Please check and try again.
              </p>
              <Button variant="outline" className="mt-4" onClick={changeDetails}>Try different details</Button>
            </Card>
          ) : (
            <div className="flex items-center justify-between gap-2 text-sm">
              <p className="text-muted-foreground">
                {bookings.length} booking{bookings.length === 1 ? '' : 's'} found
              </p>
              <button
                type="button"
                onClick={changeDetails}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
              >
                <Search className="h-4 w-4" aria-hidden />
                Look up another booking
              </button>
            </div>
          )}

          {bookings.length > 1 && (
            <Card className="p-4">
              <p className="mb-3 text-sm font-medium">Select a booking to view details.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {bookings.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id)
                      setShowMore(false)
                    }}
                    aria-pressed={booking?.id === item.id}
                    className={`rounded-lg border p-3 text-left text-sm transition hover:border-primary ${
                      booking?.id === item.id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{item.reference}</span>
                      <BookingStatusBadge status={item.status} />
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {bookingTitle(item)} · {formatDate(item.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {booking && (
            <BookingCard
              booking={booking}
              showMore={showMore}
              onToggleMore={() => setShowMore((v) => !v)}
              onCancel={() => setToCancel(booking)}
            />
          )}
        </>
      )}

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

function BookingCard({
  booking,
  showMore,
  onToggleMore,
  onCancel,
}: {
  booking: GuestBookingView
  showMore: boolean
  onToggleMore: () => void
  onCancel: () => void
}) {
  const hasRoom = booking.type === 'ROOM' || booking.type === 'ROOM_TABLE'
  const hasTable = booking.type === 'TABLE' || booking.type === 'ROOM_TABLE'
  const invoiceable = INVOICEABLE.includes(booking.status)
  const dueNow = booking.advanceAmount || booking.totalPrice

  return (
    <Card className="overflow-hidden">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{bookingTitle(booking)}</h2>
              <BookingStatusBadge status={booking.status} />
              <PaymentStatusBadge status={booking.paymentStatus} />
              <RefundStatusBadge status={booking.refundStatus} />
            </div>
            <p className="text-sm text-muted-foreground">
              Booking number:{' '}
              <span className="font-mono font-semibold tracking-wider text-foreground">{booking.reference}</span>
            </p>
            {hasRoom && booking.roomNo && (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden />
                Room #{booking.roomNo}
              </p>
            )}
            {hasTable && booking.tableLocation && (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden />
                {booking.tableLocation}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-primary">{formatINR(booking.totalPrice)}</p>
            <p className="text-xs text-muted-foreground">Total amount</p>
            <p className="mt-1 text-sm tabular-nums">
              Paid <span className="font-semibold">{formatINR(booking.paidAmount)}</span>
            </p>
            {booking.remainingAmount > 0 && !['CANCELLED', 'NO_SHOW'].includes(booking.status) && (
              <p className="text-sm tabular-nums text-amber-700">Due at check-in {formatINR(booking.remainingAmount)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-2">
          {hasRoom && booking.checkInDate && booking.checkOutDate && (
            <Detail icon={Calendar} label="Check-in & Check-out">
              {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
            </Detail>
          )}
          {hasTable && booking.bookingDate && (
            <Detail icon={Calendar} label="Dining date & time">{formatDateTime(booking.bookingDate)}</Detail>
          )}
          <Detail icon={Users} label="Guest">
            {booking.guestName} · {booking.guestCount} {booking.guestCount === 1 ? 'guest' : 'guests'}
          </Detail>
          {booking.guestPhone && <Detail icon={Phone} label="Phone">{booking.guestPhone}</Detail>}
          {booking.status === 'CANCELLED' && booking.cancelReason && (
            <Detail icon={X} label="Cancellation" wide>
              {booking.cancelReason}
              {booking.refundNote ? ` — ${booking.refundNote}` : ''}
            </Detail>
          )}
        </div>

        {showMore && (
          <div className="grid grid-cols-1 gap-4 border-t pt-4 text-sm md:grid-cols-2">
            <div className="space-y-1 text-muted-foreground">
              <p>
                Booked on {formatDate(booking.createdAt)}
                {booking.source === 'WALK_IN' ? ' at our front desk' : ' online'}
              </p>
              {booking.roomAmount > 0 && <p>Room charges: {formatINR(booking.roomAmount)}</p>}
              {booking.tableAmount > 0 && <p>Table charges: {formatINR(booking.tableAmount)}</p>}
              {booking.addOnsAmount > 0 && <p>Add-ons: {formatINR(booking.addOnsAmount)}</p>}
              {booking.taxAmount > 0 && <p>GST: {formatINR(booking.taxAmount)}</p>}
              {booking.refundAmount > 0 && <p>Refund: {formatINR(booking.refundAmount)}</p>}
              {booking.checkedInAt && <p>Checked in: {formatDateTime(booking.checkedInAt)}</p>}
              {booking.checkedOutAt && <p>Checked out: {formatDateTime(booking.checkedOutAt)}</p>}
              {booking.paymentRuleLabel && <p>{booking.paymentRuleLabel}</p>}
            </div>
            <div className="space-y-3">
              {booking.addOns.length > 0 && (
                <Detail icon={CreditCard} label="Add-ons">{booking.addOns.join(', ')}</Detail>
              )}
              {booking.specialRequest && (
                <Detail icon={MessageSquare} label="Special request">{booking.specialRequest}</Detail>
              )}
            </div>
          </div>
        )}

        {booking.awaitingPayment && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900">Payment not completed. Pay {formatINR(dueNow)} to confirm.</p>
            <PayButton bookingId={booking.id} amount={dueNow} size="sm" label="Complete payment" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onToggleMore}>
            {showMore ? 'Hide details' : 'View more details'}
          </Button>
          {booking.status !== 'PENDING' && booking.status !== 'CANCELLED' && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/booking-confirmed/${booking.id}`}>Open booking</Link>
            </Button>
          )}
          {invoiceable && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoice/${booking.id}`} target="_blank" rel="noopener">
                <FileText className="mr-2 h-4 w-4" aria-hidden />
                Download invoice
              </Link>
            </Button>
          )}
          {booking.canCancel && (
            <Button variant="destructive" size="sm" onClick={onCancel}>
              <X className="mr-2 h-4 w-4" aria-hidden />
              Cancel booking
            </Button>
          )}
        </div>
      </div>
    </Card>
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
      <IconCmp className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-words text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}
