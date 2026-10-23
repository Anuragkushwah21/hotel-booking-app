'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Users, Snowflake, Wind, ArrowLeft, CheckCircle2, AlertCircle,
  Loader2, ShieldCheck, Clock, UtensilsCrossed, ArrowRight, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RoomGallery } from '@/components/site/room-gallery'
import { Icon } from '@/components/site/icon'
import { PriceSummary, PolicyList, TABLE_SLOTS, slotLabel } from '@/components/site/price-summary'
import { HOTEL } from '@/lib/hotel'
import { formatINR } from '@/lib/format'
import type { Quote } from '@/lib/pricing'

type Room = {
  id: string; roomNo: string; name: string; type: string | null
  acType: string; capacity: number; price: number; status: string
  description: string | null; photos: string[]; amenities: string[]
}
type Service = {
  code: string; label: string; description: string
  icon: string; price: number; per: 'BOOKING' | 'NIGHT' | 'GUEST_NIGHT'; unitLabel: string
}
type QuoteResponse = {
  nights: number
  available: boolean
  unavailableReason: string | null
  overCapacity: boolean
  table: { available: boolean; tableNo?: string; reason?: string } | null
  quote: Quote
  policy: string[]
}

const todayStr = () => new Date().toISOString().split('T')[0]
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

function RoomDetailContent() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [room, setRoom] = useState<Room | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const initialIn = searchParams.get('checkIn') || todayStr()
  const [checkIn, setCheckIn] = useState(initialIn)
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || addDays(initialIn, 1))
  const [guestCount, setGuestCount] = useState(searchParams.get('guests') || '1')
  const [addOns, setAddOns] = useState<string[]>([])

  // Optional restaurant table add-on.
  const [withTable, setWithTable] = useState(false)
  const [tableDate, setTableDate] = useState(initialIn)
  const [tableTime, setTableTime] = useState('19:30')
  const [tableGuests, setTableGuests] = useState(searchParams.get('guests') || '2')

  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState('')

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

  // Keep the table date inside the stay when the dates move.
  useEffect(() => {
    if (tableDate < checkIn || (checkOut && tableDate > checkOut)) setTableDate(checkIn)
  }, [checkIn, checkOut, tableDate])

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0
    const n = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
    return n > 0 ? n : 0
  }, [checkIn, checkOut])
  const guests = Math.max(1, Number(guestCount) || 1)
  const diners = Math.max(1, Number(tableGuests) || 1)

  // Live server quote: price, availability, table and payment split.
  useEffect(() => {
    if (!roomId || nights <= 0) {
      setQuote(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setQuoting(true)
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            kind: 'ROOM',
            roomId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            guestCount: guests,
            addOns,
            table: withTable ? { date: tableDate, time: tableTime, guestCount: diners } : null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not price this stay')
        setQuote(data)
        setQuoteError('')
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setQuote(null)
        setQuoteError(e instanceof Error ? e.message : 'Could not price this stay')
      } finally {
        setQuoting(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [roomId, checkIn, checkOut, guests, addOns, withTable, tableDate, tableTime, diners, nights])

  const overCapacity = room ? guests > room.capacity : false
  const canProceed = !!room && nights > 0 && !overCapacity && quote?.available === true && !quoting

  const proceed = () => {
    const params = new URLSearchParams({
      roomId,
      checkIn,
      checkOut,
      guests: String(guests),
    })
    if (addOns.length) params.set('addOns', addOns.join(','))
    if (withTable && quote?.table?.available) {
      params.set('tableDate', tableDate)
      params.set('tableTime', tableTime)
      params.set('tableGuests', String(diners))
    }
    router.push(`/checkout?${params}`)
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
        href={`/rooms?${new URLSearchParams({ checkIn, checkOut, guests: String(guests) })}`}
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
                <p className="text-2xl font-bold tabular-nums">{formatINR(room.price)}</p>
                <p className="text-xs text-muted-foreground">per night, from</p>
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
                Check-in {HOTEL.policies.checkIn} · Check-out {HOTEL.policies.checkOut}
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

        {/* ---------------- right: price & add-ons ---------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Your stay</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="checkIn" className="mb-1 block text-xs">Check-in</Label>
                <Input id="checkIn" type="date" min={todayStr()} value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value)
                    if (checkOut <= e.target.value) setCheckOut(addDays(e.target.value, 1))
                  }} />
              </div>
              <div>
                <Label htmlFor="checkOut" className="mb-1 block text-xs">Check-out</Label>
                <Input id="checkOut" type="date" min={checkIn ? addDays(checkIn, 1) : todayStr()} value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="guests" className="mb-1 block text-xs">Guests</Label>
                <Input id="guests" type="number" min={1} max={room.capacity}
                  value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
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
                role="status"
                className={`mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                  quoting || !quote
                    ? 'border-border bg-muted/50 text-muted-foreground'
                    : quote.available
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                {quoting ? <Loader2 className="mt-px h-3.5 w-3.5 animate-spin" />
                  : quote?.available ? <CheckCircle2 className="mt-px h-3.5 w-3.5" />
                  : <AlertCircle className="mt-px h-3.5 w-3.5" />}
                <span>
                  {quoting
                    ? 'Checking availability…'
                    : quoteError
                      ? quoteError
                      : quote?.available
                        ? `Available for ${nights} night${nights > 1 ? 's' : ''}`
                        : quote?.unavailableReason ?? 'Not available for these dates'}
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
                        aria-pressed={on}
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
                            {formatINR(s.price)} {s.unitLabel}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* optional table add-on */}
            <div className="mt-5 rounded-lg border border-border p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                  checked={withTable}
                  onChange={(e) => setWithTable(e.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <UtensilsCrossed className="h-4 w-4 text-primary" aria-hidden />
                    Add a table at {HOTEL.dining.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Optional. If no table is free, your room is still booked.
                  </span>
                </span>
              </label>

              {withTable && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="tableDate" className="mb-1 block text-xs">Date</Label>
                    <Input id="tableDate" type="date" min={checkIn} max={checkOut || undefined}
                      value={tableDate} onChange={(e) => setTableDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="tableGuests" className="mb-1 block text-xs">Diners</Label>
                    <Input id="tableGuests" type="number" min={1} max={20}
                      value={tableGuests} onChange={(e) => setTableGuests(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Label className="mb-1 block text-xs">Time</Label>
                    <Select value={tableTime} onValueChange={setTableTime}>
                      <SelectTrigger aria-label="Table time"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['Lunch', 'Dinner'] as const).map((g) => (
                          <SelectGroup key={g}>
                            <SelectLabel>{g}</SelectLabel>
                            {TABLE_SLOTS.filter((s) => s.group === g).map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {quote?.table && !quoting && (
                    <p
                      className={`col-span-2 flex items-start gap-1.5 text-xs ${
                        quote.table.available ? 'text-emerald-700' : 'text-muted-foreground'
                      }`}
                    >
                      {quote.table.available ? (
                        <><CheckCircle2 className="mt-px h-3.5 w-3.5" />Table {quote.table.tableNo} is free at {slotLabel(tableTime)}.</>
                      ) : (
                        <><Info className="mt-px h-3.5 w-3.5" />No table free at that time — your room will still be booked. Try another time.</>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* price */}
            <div className="mt-5 border-t border-border pt-4">
              {quote ? (
                <PriceSummary
                  quote={quote.quote}
                  tableLabel={
                    withTable && quote.table?.available
                      ? `Table for ${diners} · ${slotLabel(tableTime)}`
                      : null
                  }
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {nights > 0 ? 'Pricing your stay…' : 'Pick your dates to see the price.'}
                </p>
              )}
            </div>

            <Button type="button" className="mt-4 h-11 w-full" disabled={!canProceed} onClick={proceed}>
              Proceed to checkout
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {quote?.policy && quote.policy.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-1.5 text-xs font-medium">Cancellation policy</p>
                <PolicyList lines={quote.policy} />
              </div>
            )}

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Confirmed instantly once payment succeeds.
            </p>
          </div>
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
