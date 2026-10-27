'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, BedDouble, CalendarDays, CheckCircle2, Clock, FileText, KeyRound, Mail, Phone,
  RotateCcw, UtensilsCrossed, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PayButton } from '@/components/site/pay-button'
import {
  BookingStatusBadge, PaymentStatusBadge, RefundStatusBadge, bookingTitle,
} from '@/components/site/booking-badges'
import { formatDate, formatDateTime, formatINR } from '@/lib/format'
import { HOTEL } from '@/lib/hotel'
import type { GuestBookingView } from '@/lib/booking-view'

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export default function BookingConfirmedPage() {
  const { id } = useParams<{ id: string }>()
  const [booking, setBooking] = useState<GuestBookingView | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${id}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking not found')
      setBooking(data.booking)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking not found')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">{error || 'Booking not found'}</h1>
        <Button className="mt-6" asChild><Link href="/bookings">Go to My Bookings</Link></Button>
      </div>
    )
  }

  const confirmed = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(booking.status)
  const lost = booking.status === 'CANCELLED' && booking.refundStatus !== 'NONE' && booking.paidAmount > 0
  const hasRoom = booking.type === 'ROOM' || booking.type === 'ROOM_TABLE'
  const hasTable = booking.type === 'TABLE' || booking.type === 'ROOM_TABLE'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* ---------------- headline ---------------- */}
      {confirmed ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold text-emerald-900">Your booking is confirmed</h1>
          <p className="mt-1 text-emerald-800">
            A confirmation email has been sent to <strong>{booking.guestEmail}</strong>.
          </p>
        </div>
      ) : lost ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <RotateCcw className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold text-amber-900">We couldn&apos;t hold your booking</h1>
          <p className="mt-1 text-amber-800">
            {booking.cancelReason ?? 'Your payment arrived after the hold expired and the room was booked in the meantime.'}{' '}
            A full refund of <strong>{formatINR(booking.refundAmount)}</strong> is being processed to your original payment method.
          </p>
          <Button className="mt-4" asChild><Link href="/rooms">Find another room</Link></Button>
        </div>
      ) : booking.status === 'PENDING' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <Clock className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold text-amber-900">Payment not completed yet</h1>
          <p className="mt-1 text-amber-800">
            Your booking is held{booking.holdExpiresAt ? ` until ${formatDateTime(booking.holdExpiresAt)}` : ''}. Complete payment to confirm it.
          </p>
          {booking.awaitingPayment && (
            <PayButton bookingId={booking.id} amount={booking.advanceAmount || booking.totalPrice} className="mt-4" />
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center">
          <h1 className="text-2xl font-bold">
            {booking.status === 'CANCELLED'
              ? 'This booking was cancelled'
              : (booking.status as string) === 'NO_SHOW'
                ? 'This booking was marked as a no-show'
                : `This booking is ${String(booking.status).toLowerCase().replace(/_/g, ' ')}`}
          </h1>
          {(booking.status as string) === 'NO_SHOW' && (
            <p className="mt-1 text-muted-foreground">
              We didn&apos;t see you on the booked date. Questions? Call us on {HOTEL.contact.phone}.
            </p>
          )}
        </div>
      )}

      {/* ---------------- details ---------------- */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Booking ID</p>
            <p className="font-mono text-2xl font-bold tracking-wider">{booking.reference}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <BookingStatusBadge status={booking.status} />
              <PaymentStatusBadge status={booking.paymentStatus} />
              <RefundStatusBadge status={booking.refundStatus} />
            </div>
          </div>
          {hasRoom && booking.roomNo && (
            <div className="rounded-xl border-2 border-primary bg-primary/5 px-5 py-3 text-center">
              <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-primary">
                <KeyRound className="h-3.5 w-3.5" aria-hidden />Room number
              </p>
              <p className="text-3xl font-bold tabular-nums">{booking.roomNo}</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 border-b border-border p-5 sm:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="font-semibold">{bookingTitle(booking)}</p>
            {hasRoom && (
              <>
                {booking.roomType && <p className="text-muted-foreground">{booking.roomType}</p>}
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <BedDouble className="h-4 w-4" aria-hidden />
                  Check-in from {HOTEL.policies.checkIn} · check-out by {HOTEL.policies.checkOut}
                </p>
                <p className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {booking.guestCount} guest{booking.guestCount === 1 ? '' : 's'}
                </p>
              </>
            )}
            {hasTable && (
              <p className="flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-muted-foreground" aria-hidden />
                Table {booking.tableNo ?? '—'}{booking.tableLocation ? ` · ${booking.tableLocation}` : ''} ·{' '}
                {formatDateTime(booking.bookingDate)} · {booking.tableGuestCount ?? booking.guestCount} diner
                {(booking.tableGuestCount ?? booking.guestCount) === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            {booking.roomAmount > 0 && <Line label="Room charges" value={formatINR(booking.roomAmount)} />}
            {booking.tableAmount > 0 && <Line label="Table charges" value={formatINR(booking.tableAmount)} />}
            {booking.addOnsAmount > 0 && <Line label="Add-ons" value={formatINR(booking.addOnsAmount)} />}
            {booking.taxAmount > 0 && <Line label="GST" value={formatINR(booking.taxAmount)} />}
            <div className="border-t border-border pt-1.5"><Line strong label="Total" value={formatINR(booking.totalPrice)} /></div>
            <Line label="Amount paid" value={formatINR(booking.paidAmount)} />
            {booking.remainingAmount > 0 && !['CANCELLED', 'NO_SHOW'].includes(booking.status) && (
              <Line strong label="Balance due at check-in" value={formatINR(booking.remainingAmount)} />
            )}
            {booking.refundAmount > 0 && <Line label="Refund" value={formatINR(booking.refundAmount)} />}
            {booking.paymentRuleLabel && (
              <p className="pt-1 text-[11px] text-muted-foreground">{booking.paymentRuleLabel}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="flex items-center gap-2"><Mail className="h-4 w-4" aria-hidden />{HOTEL.contact.email}</p>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4" aria-hidden />{HOTEL.contact.phone}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {confirmed && (
              <Button variant="outline" asChild>
                <Link href={`/invoice/${booking.id}`} target="_blank" rel="noopener">
                  <FileText className="mr-2 h-4 w-4" aria-hidden />
                  Download invoice
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild><Link href="/rooms">Book another</Link></Button>
            <Button asChild><Link href="/bookings">Go to My Bookings</Link></Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
