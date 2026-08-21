'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Users, Snowflake, Wind, ArrowLeft, CheckCircle2, AlertCircle,
  Loader2, Info, ShieldCheck, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RoomGallery } from '@/components/site/room-gallery'
import { Icon } from '@/components/site/icon'
import { HOTEL } from '@/lib/hotel'
import { useAuth } from '@/components/auth-provider'

type Room = {
  id: string; roomNo: string; name: string; type: string | null
  acType: string; capacity: number; price: number; status: string
  description: string | null; photos: string[]; amenities: string[]
}
type Service = {
  code: string; label: string; description: string
  icon: string; price: number; per: 'BOOKING' | 'NIGHT' | 'GUEST_NIGHT'; unitLabel: string
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
const todayStr = () => new Date().toISOString().split('T')[0]

function RoomDetailContent() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [room, setRoom] = useState<Room | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || todayStr())
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '')
  const [guestCount, setGuestCount] = useState(searchParams.get('guests') || '1')
  const [addOns, setAddOns] = useState<string[]>([])

  const { user } = useAuth()

  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [specialRequest, setSpecialRequest] = useState('')

  const [availability, setAvailability] = useState<{ available: boolean; message: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Prefill from the signed-in account so guests aren't retyping what we know.
  // Reads the shared session rather than asking the server again.
  useEffect(() => {
    if (!user) return
    setGuestName((n) => n || user.name || '')
    setGuestEmail((e) => e || user.email || '')
  }, [user])

  useEffect(() => {
    if (!roomId) return
    ;(async () => {
      try {
        const [roomRes, svcRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}`),
          fetch('/api/services'),
        ])
        const roomData = await roomRes.json()
        if (!roomRes.ok) throw new Error(roomData.error || 'Room not found')
        setRoom(roomData.room)
        const svc = await svcRes.json()
        setServices(svc.bookable ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this room')
      } finally {
        setLoading(false)
      }
    })()
  }, [roomId])

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0
    const n = Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000,
    )
    return n > 0 ? n : 0
  }, [checkIn, checkOut])

  const guests = Math.max(1, Number(guestCount) || 1)

  // Live availability whenever the dates change.
  const checkAvailability = useCallback(async () => {
    if (!roomId || nights <= 0) {
      setAvailability(null)
      return
    }
    setChecking(true)
    try {
      const res = await fetch('/api/rooms/available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, checkInDate: checkIn, checkOutDate: checkOut }),
      })
      const data = await res.json()
      setAvailability(
        res.ok
          ? { available: data.available, message: data.message }
          : { available: false, message: data.error || 'Could not check availability' },
      )
    } catch {
      setAvailability({ available: false, message: 'Could not check availability' })
    } finally {
      setChecking(false)
    }
  }, [roomId, checkIn, checkOut, nights])

  useEffect(() => {
    const t = setTimeout(checkAvailability, 300)
    return () => clearTimeout(t)
  }, [checkAvailability])

  // Mirrors priceAddOns() in lib/booking-engine.ts. Indicative only — the
  // server recomputes the total and its figure is what gets charged.
  const lines = useMemo(() => {
    const out: { label: string; amount: number }[] = []
    if (room && nights > 0) {
      out.push({
        label: `${inr(room.price)} × ${nights} night${nights > 1 ? 's' : ''}`,
        amount: room.price * nights,
      })
    }
    for (const code of addOns) {
      const s = services.find((x) => x.code === code)
      if (!s) continue
      const amount =
        s.per === 'BOOKING' ? s.price
        : s.per === 'NIGHT' ? s.price * Math.max(nights, 1)
        : s.price * Math.max(nights, 1) * guests
      out.push({ label: s.label, amount })
    }
    return out
  }, [room, nights, addOns, services, guests])

  const total = lines.reduce((s, l) => s + l.amount, 0)
  const overCapacity = room ? guests > room.capacity : false
  const canBook =
    !!room && nights > 0 && !overCapacity && availability?.available === true &&
    guestName.trim() !== '' && guestEmail.trim() !== ''

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          guestCount: guests,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone: guestPhone.trim() || null,
          specialRequest: specialRequest.trim() || null,
          addOns,
        }),
      })
      const data = await res.json()

      if (res.status === 401) {
        router.push(`/login?next=/rooms/${roomId}`)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Could not complete the booking')

      router.push('/bookings?booked=1')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the booking')
      checkAvailability()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading room…
      </div>
    )
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
        <h1 className="mt-3 text-xl font-semibold">{error || 'Room not found'}</h1>
        <Button className="mt-6" asChild><Link href="/rooms">Back to all rooms</Link></Button>
      </div>
    )
  }

  const AcIcon = room.acType === 'AC' ? Snowflake : Wind

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/rooms"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        All rooms
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* ---------------- left: room ---------------- */}
        <div>
          <RoomGallery photos={room.photos} alt={room.name} />

          <div className="mt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {room.type && (
                  <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                    {room.type}
                  </span>
                )}
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{room.name}</h1>
                <p className="text-sm text-muted-foreground">Room {room.roomNo}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{inr(room.price)}</p>
                <p className="text-xs text-muted-foreground">per night</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Sleeps {room.capacity}
              </span>
              <span className="flex items-center gap-1.5">
                <AcIcon className="h-4 w-4" />
                {room.acType === 'AC' ? 'Air conditioned' : 'Non-AC'}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Check-in {HOTEL.policies.checkIn}
              </span>
            </div>

            {room.description && (
              <p className="mt-5 text-muted-foreground">{room.description}</p>
            )}

            {room.amenities.length > 0 && (
              <>
                <h2 className="mt-8 text-lg font-semibold">In this room</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {room.amenities.map((a) => (
                    <div key={a} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                      {a}
                    </div>
                  ))}
                </div>
              </>
            )}

            <h2 className="mt-8 text-lg font-semibold">Hotel facilities</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {HOTEL.facilities.slice(0, 6).map((f) => (
                <div key={f.label} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-sm">
                  <Icon name={f.icon} className="h-4 w-4 flex-shrink-0 text-primary" />
                  {f.label}
                </div>
              ))}
            </div>

            <h2 className="mt-8 text-lg font-semibold">Before you book</h2>
            <ul className="mt-3 space-y-1.5">
              {HOTEL.policies.items.map((p) => (
                <li key={p} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------------- right: booking ---------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <form onSubmit={handleBook} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Book this room</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Check-in</Label>
                <Input type="date" min={todayStr()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Check-out</Label>
                <Input type="date" min={checkIn || todayStr()} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
              </div>
              <div className="col-span-2">
                <Label className="mb-1 block text-xs">Guests</Label>
                <Input
                  type="number" min={1} max={room.capacity}
                  value={guestCount} onChange={(e) => setGuestCount(e.target.value)} required
                />
                {overCapacity && (
                  <p className="mt-1 text-xs text-destructive">
                    This room sleeps {room.capacity}. Pick a larger room for {guests} guests.
                  </p>
                )}
              </div>
            </div>

            {/* availability */}
            {nights > 0 && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                  checking
                    ? 'border-border bg-muted/50 text-muted-foreground'
                    : availability?.available
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                {checking ? <Loader2 className="mt-px h-3.5 w-3.5 animate-spin" />
                  : availability?.available ? <CheckCircle2 className="mt-px h-3.5 w-3.5" />
                  : <AlertCircle className="mt-px h-3.5 w-3.5" />}
                <span>
                  {checking ? 'Checking availability…' : availability?.message ?? ''}
                </span>
              </div>
            )}

            {/* add-ons */}
            {services.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-medium">Add services</p>
                <p className="mb-2 text-xs text-muted-foreground">Optional — billed with the room.</p>
                <div className="space-y-1.5">
                  {services.map((s) => {
                    const on = addOns.includes(s.code)
                    return (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() =>
                          setAddOns((c) => (on ? c.filter((x) => x !== s.code) : [...c, s.code]))
                        }
                        title={s.description}
                        className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
                          on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                            on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                          }`}
                        >
                          {on && <CheckCircle2 className="h-3 w-3" />}
                        </span>
                        <Icon name={s.icon} className="h-4 w-4 flex-shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{s.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {inr(s.price)} {s.unitLabel}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* guest details */}
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <div>
                <Label className="mb-1 block text-xs">Full name</Label>
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" required />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Email</Label>
                <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Phone</Label>
                <Input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Special request</Label>
                <Textarea rows={2} value={specialRequest} onChange={(e) => setSpecialRequest(e.target.value)} placeholder="Late check-in, high floor…" />
              </div>
            </div>

            {/* price */}
            <div className="mt-5 border-t border-border pt-4">
              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">Pick your dates to see the price.</p>
              ) : (
                <ul className="space-y-1.5">
                  {lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-muted-foreground">{l.label}</span>
                      <span className="flex-shrink-0 tabular-nums">{inr(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold tabular-nums">{inr(total)}</span>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="mt-px h-3 w-3 flex-shrink-0" />
                Confirmed server-side when you book. Free cancellation up to 24 hours before check-in.
              </p>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="mt-4 h-11 w-full" disabled={!canBook || submitting}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking…</>
              ) : (
                <>Confirm booking · {inr(total)}</>
              )}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              You&apos;ll be asked to sign in if you aren&apos;t already.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

/** useSearchParams() requires a Suspense boundary to prerender. */
export default function RoomDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <RoomDetailContent />
    </Suspense>
  )
}
