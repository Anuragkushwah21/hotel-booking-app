'use client'

import { useEffect, useState } from 'react'
import { Car, Pencil, PlaneLanding, PlaneTakeoff, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  api, errMsg, fmtDateTime,
  type BookingDetail, type TransferDetails, type TransferLeg, type TransferStatus,
} from './api'

type Kind = 'pickup' | 'drop'

const LEG_STATUS: Record<TransferStatus, { label: string; className: string }> = {
  REQUESTED: { label: 'Requested', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  ASSIGNED: { label: 'Driver assigned', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  COMPLETED: { label: 'Completed', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', className: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
}

export function TransferStatusBadge({ status }: { status?: TransferStatus }) {
  const s = LEG_STATUS[status ?? 'REQUESTED']
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
        s.className,
      )}
    >
      {s.label}
    </span>
  )
}

/** ISO instant → value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A sensible starting time: midday on arrival day for pickups, 10 AM on departure for drops. */
function defaultAt(kind: Kind, b: BookingDetail): string {
  const day = kind === 'pickup' ? b.checkInDate : b.checkOutDate ?? b.checkInDate
  if (!day) return ''
  const key = new Date(day).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return `${key}T${kind === 'pickup' ? '12:00' : '10:00'}`
}

type Draft = {
  mode: TransferLeg['mode']
  number: string
  at: string
  location: string
  passengers: string
  notes: string
  driverName: string
  driverPhone: string
  vehicleNo: string
  status: TransferStatus
}

function toDraft(kind: Kind, leg: TransferLeg | null | undefined, b: BookingDetail): Draft {
  return {
    mode: leg?.mode ?? 'FLIGHT',
    number: leg?.number ?? '',
    at: leg ? toLocalInput(leg.at) : defaultAt(kind, b),
    location: leg?.location ?? '',
    passengers: leg?.passengers != null ? String(leg.passengers) : String(b.guestCount),
    notes: leg?.notes ?? '',
    driverName: leg?.driverName ?? '',
    driverPhone: leg?.driverPhone ?? '',
    vehicleNo: leg?.vehicleNo ?? '',
    status: leg?.status ?? 'REQUESTED',
  }
}

function fromDraft(d: Draft): TransferLeg {
  const opt = (s: string) => (s.trim() ? s.trim() : null)
  const pax = Number(d.passengers)
  return {
    mode: d.mode,
    number: opt(d.number),
    at: new Date(d.at).toISOString(),
    location: d.location.trim(),
    passengers: d.passengers.trim() && Number.isFinite(pax) && pax > 0 ? Math.round(pax) : null,
    notes: opt(d.notes),
    driverName: opt(d.driverName),
    driverPhone: opt(d.driverPhone),
    vehicleNo: opt(d.vehicleNo),
    status: d.status,
  }
}

/**
 * Pickup and drop logistics for one booking. Shown when either leg exists or
 * the guest bought the matching airport add-on, so the desk can see what has
 * been requested and assign a driver.
 */
export function TransferLegs({
  booking,
  onChanged,
}: {
  booking: BookingDetail
  onChanged: () => Promise<void> | void
}) {
  const td: TransferDetails = booking.transferDetails ?? {}
  const wantsPickup = !!td.pickup || booking.addOns.includes('AIRPORT_PICKUP')
  const wantsDrop = !!td.drop || booking.addOns.includes('AIRPORT_DROP')
  if (!wantsPickup && !wantsDrop) return null

  return (
    <div className="space-y-3">
      {wantsPickup && (
        <LegCard kind="pickup" leg={td.pickup} booking={booking} onChanged={onChanged} />
      )}
      {wantsDrop && (
        <LegCard kind="drop" leg={td.drop} booking={booking} onChanged={onChanged} />
      )}
    </div>
  )
}

function LegCard({
  kind, leg, booking, onChanged,
}: {
  kind: Kind
  leg: TransferLeg | null | undefined
  booking: BookingDetail
  onChanged: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(kind, leg, booking))

  useEffect(() => {
    if (!editing) setDraft(toDraft(kind, leg, booking))
  }, [editing, kind, leg, booking])

  const Icon = kind === 'pickup' ? PlaneLanding : PlaneTakeoff
  const title = kind === 'pickup' ? 'Pickup' : 'Drop'
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async (payload: TransferLeg | null) => {
    setBusy(true)
    try {
      await api(`/api/admin/bookings/${booking.id}/transfers`, {
        method: 'PATCH',
        body: { [kind]: payload },
      })
      toast({ title: payload ? `${title} details saved` : `${title} removed` })
      setEditing(false)
      await onChanged()
    } catch (e) {
      toast({ title: `Could not save ${title.toLowerCase()}`, description: errMsg(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.at || Number.isNaN(new Date(draft.at).getTime())) {
      toast({ title: 'Enter the pickup/drop date and time', variant: 'destructive' })
      return
    }
    if (!draft.location.trim()) {
      toast({ title: 'Enter a location', variant: 'destructive' })
      return
    }
    // Assigning a driver is the usual reason to edit; move the status along
    // unless staff picked something else explicitly.
    const next = { ...draft }
    if (next.status === 'REQUESTED' && next.driverName.trim() && next.vehicleNo.trim()) {
      next.status = 'ASSIGNED'
    }
    save(fromDraft(next))
  }

  const remove = () => {
    if (!confirm(`Remove the ${title.toLowerCase()} details for ${booking.guestName}?`)) return
    save(null)
  }

  return (
    <div className="rounded-lg border border-border/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          {leg ? <TransferStatusBadge status={leg.status} /> : (
            <span className="text-[11px] text-muted-foreground">Add-on booked — details not captured</span>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3 w-3" />
              {leg ? 'Edit / assign' : 'Add details'}
            </Button>
            {leg && (
              <Button
                size="sm" variant="ghost" disabled={busy} title={`Remove ${title.toLowerCase()}`}
                className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={remove}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!editing && leg && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-3 py-3 text-sm sm:grid-cols-2">
          <Item label="When" value={fmtDateTime(leg.at)} />
          <Item label={kind === 'pickup' ? 'From' : 'To'} value={leg.location} />
          <Item
            label={leg.mode === 'FLIGHT' ? 'Flight' : leg.mode === 'TRAIN' ? 'Train' : 'Reference'}
            value={leg.number || '—'}
          />
          <Item label="Passengers" value={leg.passengers ?? '—'} />
          <Item
            label="Driver"
            value={
              leg.driverName
                ? `${leg.driverName}${leg.driverPhone ? ` · ${leg.driverPhone}` : ''}`
                : 'Not assigned'
            }
          />
          <Item label="Vehicle" value={leg.vehicleNo || '—'} />
          {leg.notes && <Item label="Notes" value={leg.notes} className="sm:col-span-2" />}
        </dl>
      )}

      {editing && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Travel mode</Label>
            <Select value={draft.mode} onValueChange={(v) => set('mode', v as Draft['mode'])}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FLIGHT">Flight</SelectItem>
                <SelectItem value="TRAIN">Train</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label={draft.mode === 'FLIGHT' ? 'Flight no.' : draft.mode === 'TRAIN' ? 'Train no.' : 'Reference'}>
            <Input className="h-9" value={draft.number} onChange={(e) => set('number', e.target.value)} placeholder="6E 2134" />
          </Field>
          <Field label={kind === 'pickup' ? 'Arrival time' : 'Departure pickup time'}>
            <Input type="datetime-local" className="h-9" value={draft.at} onChange={(e) => set('at', e.target.value)} required />
          </Field>
          <Field label={kind === 'pickup' ? 'Pickup location' : 'Drop location'}>
            <Input className="h-9" value={draft.location} onChange={(e) => set('location', e.target.value)} placeholder="Airport T1 arrivals" required />
          </Field>
          <Field label="Passengers">
            <Input type="number" min={1} className="h-9" value={draft.passengers} onChange={(e) => set('passengers', e.target.value)} />
          </Field>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={draft.status} onValueChange={(v) => set('status', v as TransferStatus)}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LEG_STATUS) as TransferStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{LEG_STATUS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Driver name">
            <Input className="h-9" value={draft.driverName} onChange={(e) => set('driverName', e.target.value)} />
          </Field>
          <Field label="Driver phone">
            <Input type="tel" className="h-9" value={draft.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} />
          </Field>
          <Field label="Vehicle no.">
            <Input className="h-9" value={draft.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} placeholder="KA 01 AB 1234" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} className="min-h-0" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Car className="mr-1.5 h-3.5 w-3.5" />}
              Save {title.toLowerCase()}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function Field({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Item({
  label, value, className,
}: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  )
}
