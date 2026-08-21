'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, CheckCircle2, BedDouble, UtensilsCrossed, ArrowLeft, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  PageHeader, Panel, PanelHeader, ErrorState, SkeletonBlock, inr,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'

type Room = {
  id: string; roomNo: string; name: string; type: string | null
  acType: string; capacity: number; price: number; status: string
}
type TableRow = {
  id: string; tableNo: string; capacity: number; location: string | null; status: string
}

// Mirrors ADD_ONS in lib/booking-engine.ts — display only. The server
// re-prices everything, so nothing here can influence what's charged.
const ADD_ONS = [
  { code: 'BREAKFAST', label: 'Breakfast', hint: '₹350 / guest / night' },
  { code: 'AIRPORT_PICKUP', label: 'Airport pickup', hint: '₹1,200' },
  { code: 'AIRPORT_DROP', label: 'Airport drop', hint: '₹1,200' },
  { code: 'SPA', label: 'Spa session', hint: '₹2,000' },
  { code: 'EXTRA_BED', label: 'Extra bed', hint: '₹800 / night' },
  { code: 'LATE_CHECKOUT', label: 'Late checkout', hint: '₹1,000' },
]

const today = () => new Date().toISOString().split('T')[0]

export default function NewWalkInBookingPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [type, setType] = useState<'ROOM' | 'TABLE'>('ROOM')
  const [rooms, setRooms] = useState<Room[]>([])
  const [tables, setTables] = useState<TableRow[]>([])
  const [loadingInventory, setLoadingInventory] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    roomId: '', tableId: '',
    checkInDate: today(), checkOutDate: '',
    date: today(), time: '19:00',
    guestName: '', guestEmail: '', guestPhone: '', guestCount: '1',
    specialRequest: '', notes: '',
    paymentMode: 'CASH', paymentStatus: 'PAID',
  })
  const [addOns, setAddOns] = useState<string[]>([])

  /**
   * Live availability for whatever dates are on screen.
   *
   * The desk used to pick a room, fill the whole form and only learn on submit
   * that the room was taken. Asking the moment the dates are known turns that
   * into an answer before any typing happens.
   */
  const [availability, setAvailability] = useState<{
    checking: boolean
    freeIds: string[] | null
    message: string
  }>({ checking: false, freeIds: null, message: '' })

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/bookings/walk-in')
        if (!res.ok) throw new Error('Could not load inventory')
        const data = await res.json()
        setRooms(data.rooms ?? [])
        setTables(data.tables ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load inventory')
      } finally {
        setLoadingInventory(false)
      }
    })()
  }, [])

  const { checkInDate, checkOutDate, date, time, guestCount } = form

  useEffect(() => {
    const roomReady = type === 'ROOM' && checkInDate && checkOutDate && checkInDate < checkOutDate
    const tableReady = type === 'TABLE' && date && time

    if (!roomReady && !tableReady) {
      setAvailability({ checking: false, freeIds: null, message: '' })
      return
    }

    // Typing a date fires per keystroke; wait for the field to settle.
    const timer = setTimeout(async () => {
      setAvailability((a) => ({ ...a, checking: true }))
      try {
        if (type === 'ROOM') {
          const params = new URLSearchParams({
            checkIn: checkInDate,
            checkOut: checkOutDate,
            guests: guestCount || '1',
          })
          const res = await fetch(`/api/rooms/available?${params}`)
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Could not check availability')
          setAvailability({
            checking: false,
            freeIds: data.rooms.map((r: Room) => r.id),
            message: data.count
              ? `${data.count} room${data.count === 1 ? '' : 's'} free for these dates`
              : 'No room free for these dates',
          })
        } else {
          const res = await fetch('/api/tables/available', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, time, guestCount: Number(guestCount) || 1 }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Could not check availability')
          setAvailability({
            checking: false,
            freeIds: data.tables.map((t: TableRow) => t.id),
            message: data.message,
          })
        }
      } catch (e) {
        setAvailability({
          checking: false,
          freeIds: null,
          message: e instanceof Error ? e.message : 'Could not check availability',
        })
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [type, checkInDate, checkOutDate, date, time, guestCount])

  /** null = not checked yet; the desk can still submit and let the server rule. */
  const isFree = (id: string) => availability.freeIds?.includes(id) ?? null
  const selectedTaken =
    type === 'ROOM'
      ? form.roomId !== '' && isFree(form.roomId) === false
      : form.tableId !== '' && isFree(form.tableId) === false

  const selectedRoom = rooms.find((r) => r.id === form.roomId)
  const guests = Number(form.guestCount) || 1

  const nights = useMemo(() => {
    if (type !== 'ROOM' || !form.checkInDate || !form.checkOutDate) return 0
    const n = Math.round(
      (new Date(form.checkOutDate).getTime() - new Date(form.checkInDate).getTime()) / 86_400_000,
    )
    return n > 0 ? n : 0
  }, [type, form.checkInDate, form.checkOutDate])

  const lines = useMemo(() => {
    const out: { label: string; amount: number }[] = []
    if (type === 'TABLE') {
      out.push({ label: `Cover charge · ${guests} guest${guests > 1 ? 's' : ''}`, amount: guests * 500 })
    } else if (selectedRoom && nights > 0) {
      out.push({
        label: `${selectedRoom.roomNo} · ${nights} night${nights > 1 ? 's' : ''}`,
        amount: nights * selectedRoom.price,
      })
    }
    const n = type === 'ROOM' ? nights : 1
    for (const code of addOns) {
      const a = ADD_ONS.find((x) => x.code === code)!
      let amount = 1200
      if (code === 'BREAKFAST') amount = 350 * n * guests
      else if (code === 'EXTRA_BED') amount = 800 * n
      else if (code === 'SPA') amount = 2000
      else if (code === 'LATE_CHECKOUT') amount = 1000
      out.push({ label: a.label, amount })
    }
    return out
  }, [type, guests, nights, selectedRoom, addOns])

  const estimate = lines.reduce((s, l) => s + l.amount, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          ...(type === 'ROOM'
            ? { roomId: form.roomId, checkInDate: form.checkInDate, checkOutDate: form.checkOutDate }
            : { tableId: form.tableId || null, date: form.date, time: form.time }),
          guestName: form.guestName,
          guestEmail: form.guestEmail,
          guestPhone: form.guestPhone,
          guestCount: guests,
          specialRequest: form.specialRequest,
          notes: form.notes,
          addOns,
          paymentMode: form.paymentMode,
          paymentStatus: form.paymentStatus,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create the booking')

      // The guest needs this number to track the booking at /booking-status,
      // so put it in front of the desk as well as in the confirmation email.
      toast({
        title: 'Walk-in booking created',
        description: `${data.booking.guestName} · ${inr(data.booking.totalPrice)} · Booking no. ${data.booking.reference}`,
      })
      router.push('/admin/bookings?source=WALK_IN')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const bookableRooms = rooms.filter((r) => r.status !== 'MAINTENANCE')

  return (
    <div>
      <PageHeader
        title="New walk-in booking"
        description="Taken at the front desk. Shares inventory with the website, so an already-sold room will be rejected."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/bookings">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to bookings
            </Link>
          </Button>
        }
      />

      {error && <div className="mb-5"><ErrorState message={error} /></div>}

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ---------------- left column ---------------- */}
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="What are you booking?" />
            <div className="grid grid-cols-2 gap-3 p-5">
              {([
                ['ROOM', 'Room', BedDouble, 'Overnight stay'],
                ['TABLE', 'Restaurant table', UtensilsCrossed, 'Dining reservation'],
              ] as const).map(([value, label, Icon, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-4 text-left transition-all',
                    type === value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40',
                  )}
                >
                  <span
                    className={cn(
                      'rounded-lg p-2',
                      type === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title={type === 'ROOM' ? 'Allocation & dates' : 'Table & sitting time'}
            />
            <div className="p-5">
              {loadingInventory ? (
                <div className="space-y-3">
                  <SkeletonBlock className="h-9 w-full" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SkeletonBlock className="h-9" />
                    <SkeletonBlock className="h-9" />
                  </div>
                </div>
              ) : type === 'ROOM' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Room" required className="sm:col-span-2">
                    <Select value={form.roomId} onValueChange={(v) => set('roomId', v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select a room" /></SelectTrigger>
                      <SelectContent>
                        {bookableRooms.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No bookable rooms
                          </div>
                        ) : (
                          bookableRooms.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.roomNo} · {r.name} · {r.acType} · {r.capacity} pax · {inr(r.price)}/night
                              {isFree(r.id) === false ? ' · booked for these dates' : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Check-in" required>
                    <Input
                      type="date" required className="h-9"
                      value={form.checkInDate} onChange={(e) => set('checkInDate', e.target.value)}
                    />
                  </Field>
                  <Field label="Check-out" required>
                    <Input
                      type="date" required className="h-9" min={form.checkInDate}
                      value={form.checkOutDate} onChange={(e) => set('checkOutDate', e.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <AvailabilityNote
                      checking={availability.checking}
                      message={availability.message}
                      free={availability.freeIds ? availability.freeIds.length > 0 : null}
                      warning={
                        selectedTaken
                          ? 'That room is already booked for these dates — pick another or change the dates.'
                          : ''
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date" required>
                    <Input
                      type="date" required className="h-9"
                      value={form.date} onChange={(e) => set('date', e.target.value)}
                    />
                  </Field>
                  <Field label="Time" required>
                    <Input
                      type="time" required className="h-9"
                      value={form.time} onChange={(e) => set('time', e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Table" className="sm:col-span-2"
                    hint="Leave empty to auto-assign the smallest free table that fits."
                  >
                    <Select value={form.tableId} onValueChange={(v) => set('tableId', v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Auto-assign best fit" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.tableNo} · seats {t.capacity}
                            {t.location ? ` · ${t.location}` : ''}
                            {isFree(t.id) === false ? ' · taken at this time' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <AvailabilityNote
                      checking={availability.checking}
                      message={availability.message}
                      free={availability.freeIds ? availability.freeIds.length > 0 : null}
                      warning={
                        selectedTaken
                          ? 'That table is taken for this slot — pick another or change the time.'
                          : ''
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Guest details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input
                  required className="h-9" placeholder="Ramesh Kumar"
                  value={form.guestName} onChange={(e) => set('guestName', e.target.value)}
                />
              </Field>
              <Field label="Email" required hint="Matched to an existing guest if we already have them.">
                <Input
                  type="email" required className="h-9" placeholder="guest@example.com"
                  value={form.guestEmail} onChange={(e) => set('guestEmail', e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="tel" className="h-9" placeholder="+91 98765 43210"
                  value={form.guestPhone} onChange={(e) => set('guestPhone', e.target.value)}
                />
              </Field>
              <Field label="Guests" required>
                <Input
                  type="number" min={1} required className="h-9"
                  value={form.guestCount} onChange={(e) => set('guestCount', e.target.value)}
                />
              </Field>
              <Field label="Special request" className="sm:col-span-2">
                <Textarea
                  rows={2} placeholder="Late check-in, high floor, …"
                  value={form.specialRequest} onChange={(e) => set('specialRequest', e.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Add-ons" description="Optional extras billed with the booking" />
            <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {ADD_ONS.map((a) => {
                const on = addOns.includes(a.code)
                return (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() =>
                      setAddOns((cur) => (on ? cur.filter((c) => c !== a.code) : [...cur, a.code]))
                    }
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all',
                      on
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-primary/40 hover:bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                      )}
                    >
                      {on && <CheckCircle2 className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.label}</span>
                      <span className="block text-xs text-muted-foreground">{a.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>
        </div>

        {/* ---------------- summary rail ---------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Panel>
            <PanelHeader title="Payment & summary" />
            <div className="space-y-4 p-5">
              <Field label="Mode" required>
                <Select value={form.paymentMode} onValueChange={(v) => set('paymentMode', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Status" required>
                <Select value={form.paymentStatus} onValueChange={(v) => set('paymentStatus', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">Collected now</SelectItem>
                    <SelectItem value="PENDING">Pay at check-out</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Internal note" hint="Recorded in the audit trail, not shown to the guest.">
                <Input
                  className="h-9" placeholder="Corporate guest, invoice to follow"
                  value={form.notes} onChange={(e) => set('notes', e.target.value)}
                />
              </Field>

              <div className="border-t border-border/70 pt-4">
                {lines.length === 0 ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    {type === 'ROOM'
                      ? 'Pick a room and dates to see pricing.'
                      : 'Set guests to see pricing.'}
                  </p>
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

                <div className="mt-3 flex items-baseline justify-between border-t border-border/70 pt-3">
                  <span className="text-sm font-medium">Estimated total</span>
                  <span className="text-xl font-semibold tabular-nums">{inr(estimate)}</span>
                </div>

                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <Info className="mt-px h-3 w-3 flex-shrink-0" />
                  Recalculated server-side on submit; that figure is what gets charged.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={submitting || loadingInventory}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Create booking
                  </>
                )}
              </Button>
            </div>
          </Panel>
        </div>
      </form>
    </div>
  )
}

/**
 * Availability line under the date fields: what the desk needs to know before
 * it starts typing guest details.
 */
function AvailabilityNote({
  checking, message, free, warning,
}: {
  checking: boolean
  message: string
  free: boolean | null
  warning?: string
}) {
  if (!checking && !message && !warning) return null

  return (
    <div className="space-y-1.5">
      {checking ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking availability…
        </p>
      ) : (
        message && (
          <p
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              free === false ? 'text-destructive' : 'text-emerald-600',
            )}
          >
            {free === false ? (
              <Info className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {message}
          </p>
        )
      )}

      {warning && !checking && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <Info className="h-3.5 w-3.5" />
          {warning}
        </p>
      )}
    </div>
  )
}

function Field({
  label, required, hint, className, children,
}: {
  label: string
  required?: boolean
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}
