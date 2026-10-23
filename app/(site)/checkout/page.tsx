'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { toast } from 'react-toastify'
import {
  ArrowLeft, BedDouble, CalendarDays, Clock, Loader2, Lock, UtensilsCrossed, Users, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/auth-provider'
import { PayButton } from '@/components/site/pay-button'
import { PriceSummary, PolicyList, slotLabel } from '@/components/site/price-summary'
import { formatDate, formatINR } from '@/lib/format'
import { HOTEL } from '@/lib/hotel'
import type { Quote } from '@/lib/pricing'

/**
 * Checkout — guest details, combined invoice, then payment.
 *
 *   Room:       /checkout?roomId&checkIn&checkOut&guests[&addOns=a,b][&tableDate&tableTime&tableGuests]
 *   Table only: /checkout?type=table&date&time&guests
 *
 * Submitting creates a short payment hold (POST /api/bookings/rooms|tables);
 * the booking confirms itself as soon as the payment succeeds.
 */

const guestForm = z.object({
  guestName: z.string().trim().min(2, 'Please enter the guest name'),
  guestEmail: z.string().trim().email('Please enter a valid email'),
  guestPhone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[+\d][\d\s-]{7,16}$/.test(v), 'Please enter a valid phone number'),
  specialRequest: z.string().trim().max(1000, 'Special requests can be up to 1000 characters'),
})

type RoomInfo = { id: string; name: string; roomNo: string; type: string | null; acType: string; photos: string[] }
type Held = {
  id: string
  reference: string
  dueNow: number
  holdExpiresAt: string | null
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])
  if (!until) return null
  const ms = new Date(until).getTime() - now
  if (ms <= 0) return '0:00'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

function CheckoutContent() {
  const sp = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const tableOnly = sp.get('type') === 'table'
  const roomId = sp.get('roomId') || ''
  const checkIn = sp.get('checkIn') || ''
  const checkOut = sp.get('checkOut') || ''
  const guests = Math.max(1, Number(sp.get('guests')) || 1)
  const addOns = useMemo(() => (sp.get('addOns') || '').split(',').filter(Boolean), [sp])
  const tableDate = tableOnly ? sp.get('date') || '' : sp.get('tableDate') || ''
  const tableTime = tableOnly ? sp.get('time') || '' : sp.get('tableTime') || ''
  const tableGuests = tableOnly ? guests : Math.max(1, Number(sp.get('tableGuests')) || guests)
  const withTable = Boolean(tableDate && tableTime)

  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [policy, setPolicy] = useState<string[]>([])
  const [nights, setNights] = useState(0)
  const [tableNote, setTableNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState({ guestName: '', guestEmail: '', guestPhone: '', specialRequest: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [held, setHeld] = useState<Held | null>(null)
  const countdown = useCountdown(held?.holdExpiresAt ?? null)

  useEffect(() => {
    if (!user) return
    setForm((f) => ({ ...f, guestName: f.guestName || user.name || '', guestEmail: f.guestEmail || user.email || '' }))
  }, [user])

  useEffect(() => {
    ;(async () => {
      try {
        if (tableOnly) {
          if (!tableDate || !tableTime) throw new Error('Pick a date and time for your table first.')
          const res = await fetch('/api/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'TABLE', guestCount: guests }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Could not price this reservation')
          setQuote(data.quote)
          setPolicy(data.policy ?? [])
          return
        }

        if (!roomId || !checkIn || !checkOut) throw new Error('Pick a room and dates first.')
        const [roomRes, quoteRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}`),
          fetch('/api/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'ROOM',
              roomId,
              checkInDate: checkIn,
              checkOutDate: checkOut,
              guestCount: guests,
              addOns,
              table: withTable ? { date: tableDate, time: tableTime, guestCount: tableGuests } : null,
            }),
          }),
        ])
        const roomData = await roomRes.json()
        const q = await quoteRes.json()
        if (!roomRes.ok) throw new Error(roomData.error || 'Room not found')
        if (!quoteRes.ok) throw new Error(q.error || 'Could not price this stay')
        if (!q.available) throw new Error(q.unavailableReason || 'This room is no longer available for these dates.')
        setRoom(roomData.room)
        setQuote(q.quote)
        setPolicy(q.policy ?? [])
        setNights(q.nights)
        if (withTable && q.table && !q.table.available) {
          setTableNote('No table is free at that time, so your room will be booked on its own.')
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Could not load checkout')
      } finally {
        setLoading(false)
      }
    })()
  }, [tableOnly, roomId, checkIn, checkOut, guests, addOns, withTable, tableDate, tableTime, tableGuests])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((er) => ({ ...er, [k]: undefined }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = guestForm.safeParse(form)
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof typeof form] ??= issue.message
      setErrors(next)
      toast.error(parsed.error.issues[0]?.message ?? 'Please check your details')
      return
    }

    setSubmitting(true)
    try {
      const guest = {
        guestName: parsed.data.guestName,
        guestEmail: parsed.data.guestEmail,
        guestPhone: parsed.data.guestPhone || null,
        specialRequest: parsed.data.specialRequest || null,
      }
      const res = tableOnly
        ? await fetch('/api/bookings/tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: tableDate, time: tableTime, guestCount: guests, ...guest }),
          })
        : await fetch('/api/bookings/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId,
              checkInDate: checkIn,
              checkOutDate: checkOut,
              guestCount: guests,
              addOns,
              table: withTable ? { date: tableDate, time: tableTime, guestCount: tableGuests } : null,
              ...guest,
            }),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not reserve this booking')

      if (data.tableSkipped) {
        toast.warning(data.tableSkipped, { autoClose: 8000 })
        setTableNote(data.tableSkipped)
      }
      // The server quote at hold time is authoritative.
      if (data.quote) setQuote(data.quote)
      setHeld({
        id: data.booking.id,
        reference: data.booking.reference,
        dueNow: data.booking.advanceAmount,
        holdExpiresAt: data.booking.holdExpiresAt,
      })
      toast.success(`Held for ${data.holdMinutes} minutes — complete payment to confirm.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reserve this booking')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_400px]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (loadError || !quote) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">{loadError || 'Checkout unavailable'}</h1>
        <Button className="mt-6" asChild>
          <Link href={tableOnly ? '/tables/reserve' : roomId ? `/rooms/${roomId}` : '/rooms'}>Go back</Link>
        </Button>
      </div>
    )
  }

  const expired = countdown === '0:00'
  const tableShown = tableOnly || (withTable && quote.tableAmount > 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={tableOnly ? `/tables/reserve?${new URLSearchParams({ date: tableDate, time: tableTime, guests: String(guests) })}` : `/rooms/${roomId}?${new URLSearchParams({ checkIn, checkOut, guests: String(guests) })}`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
      <p className="mt-1 text-muted-foreground">Review your booking and pay securely to confirm it instantly.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* ---------------- guest details ---------------- */}
        <Card className="p-6">
          <form onSubmit={submit} noValidate className="space-y-4">
            <h2 className="text-lg font-semibold">Guest details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="guestName" className="mb-1 block text-sm">Full name</Label>
                <Input id="guestName" value={form.guestName} onChange={set('guestName')} disabled={!!held}
                  aria-invalid={!!errors.guestName} autoComplete="name" />
                {errors.guestName && <p className="mt-1 text-xs text-destructive">{errors.guestName}</p>}
              </div>
              <div>
                <Label htmlFor="guestEmail" className="mb-1 block text-sm">Email</Label>
                <Input id="guestEmail" type="email" value={form.guestEmail} onChange={set('guestEmail')} disabled={!!held}
                  aria-invalid={!!errors.guestEmail} autoComplete="email" />
                {errors.guestEmail && <p className="mt-1 text-xs text-destructive">{errors.guestEmail}</p>}
              </div>
              <div>
                <Label htmlFor="guestPhone" className="mb-1 block text-sm">Phone (for WhatsApp updates)</Label>
                <Input id="guestPhone" type="tel" value={form.guestPhone} onChange={set('guestPhone')} disabled={!!held}
                  placeholder="+91 98765 43210" aria-invalid={!!errors.guestPhone} autoComplete="tel" />
                {errors.guestPhone && <p className="mt-1 text-xs text-destructive">{errors.guestPhone}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="specialRequest" className="mb-1 block text-sm">Special requests</Label>
                <Textarea id="specialRequest" rows={3} value={form.specialRequest} onChange={set('specialRequest')} disabled={!!held}
                  placeholder={tableOnly ? 'Birthday, high chair, window seat…' : 'Late arrival, high floor, extra pillows…'} />
                {errors.specialRequest && <p className="mt-1 text-xs text-destructive">{errors.specialRequest}</p>}
              </div>
            </div>

            {tableNote && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <UtensilsCrossed className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                {tableNote}
              </p>
            )}

            {!held ? (
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Reserving…</>
                ) : (
                  <><Lock className="mr-2 h-4 w-4" aria-hidden />Continue to payment · {formatINR(quote.dueNow)}</>
                )}
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    Booking <span className="font-mono font-semibold">{held.reference}</span> is held for you
                  </span>
                  {countdown && (
                    <span className={`flex items-center gap-1 font-medium tabular-nums ${expired ? 'text-destructive' : 'text-primary'}`}>
                      <Clock className="h-4 w-4" aria-hidden />
                      {expired ? 'Hold expired' : `${countdown} left`}
                    </span>
                  )}
                </div>
                <PayButton bookingId={held.id} amount={held.dueNow} className="w-full" />
                {expired && (
                  <p className="text-xs text-muted-foreground">
                    Your hold has lapsed. You can still try to pay — if the room is still free your booking will be confirmed.
                  </p>
                )}
              </div>
            )}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              Payments are processed securely. Your booking is confirmed automatically once payment succeeds.
            </p>
          </form>
        </Card>

        {/* ---------------- summary / invoice ---------------- */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            {room && (
              <div className="flex gap-3 border-b border-border p-4">
                {room.photos?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={room.photos[0]} alt="" className="h-16 w-20 flex-shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0">
                  {room.type && <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">{room.type}</p>}
                  <p className="truncate font-semibold">{room.name}</p>
                  <p className="text-xs text-muted-foreground">{room.acType === 'AC' ? 'Air conditioned' : 'Non-AC'}</p>
                </div>
              </div>
            )}

            <div className="space-y-2 border-b border-border p-4 text-sm">
              {!tableOnly && (
                <>
                  <p className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {formatDate(checkIn)} → {formatDate(checkOut)} · {nights} night{nights === 1 ? '' : 's'}
                  </p>
                  <p className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4 text-muted-foreground" aria-hidden />
                    Check-in from {HOTEL.policies.checkIn}, check-out by {HOTEL.policies.checkOut}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {guests} guest{guests === 1 ? '' : 's'}
                  </p>
                </>
              )}
              {tableShown && (
                <p className="flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {HOTEL.dining.name} · {formatDate(tableDate)}, {slotLabel(tableTime)} · {tableGuests} diner{tableGuests === 1 ? '' : 's'}
                </p>
              )}
            </div>

            <div className="p-4">
              <p className="mb-2 text-sm font-semibold">{tableShown && !tableOnly ? 'Combined invoice' : 'Price breakdown'}</p>
              <PriceSummary
                quote={quote}
                showNights={!tableOnly}
                tableLabel={tableShown ? `Table for ${tableGuests}` : null}
              />
            </div>
          </Card>

          {policy.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Cancellation policy</p>
              <PolicyList lines={policy} />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading checkout…
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  )
}
