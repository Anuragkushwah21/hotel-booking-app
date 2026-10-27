'use client'

import { useEffect, useMemo, useState } from 'react'
import { BedDouble, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  Panel, PanelHeader, EmptyState, ErrorState, TableSkeleton,
} from '@/components/admin/ui'
import { NumberInput } from '@/components/admin/settings/fields'
import { cn } from '@/lib/utils'

type RoomRate = {
  id: string
  roomNo: string
  name: string
  type: string | null
  acType: string
  capacity: number
  status: string
  price: number
  weekendPrice: number | null
  peakPrice: number | null
  eventPrice: number | null
}

const RATE_KEYS = ['price', 'weekendPrice', 'peakPrice', 'eventPrice'] as const
type RateKey = (typeof RATE_KEYS)[number]
type Row = Record<RateKey, string>

const COLUMNS: { key: RateKey; label: string; short: string }[] = [
  { key: 'price', label: 'Base rate', short: 'Base' },
  { key: 'weekendPrice', label: 'Weekend', short: 'Weekend' },
  { key: 'peakPrice', label: 'Peak season', short: 'Peak' },
  { key: 'eventPrice', label: 'Event date', short: 'Event' },
]

const MAX = 10_000_000

const toRow = (r: RoomRate): Row => ({
  price: String(r.price),
  weekendPrice: r.weekendPrice == null ? '' : String(r.weekendPrice),
  peakPrice: r.peakPrice == null ? '' : String(r.peakPrice),
  eventPrice: r.eventPrice == null ? '' : String(r.eventPrice),
})

function cellError(key: RateKey, raw: string): string | undefined {
  const v = raw.trim()
  if (v === '') return key === 'price' ? 'Required' : undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) return 'Whole rupees only'
  if (n > MAX) return 'Too large'
  if (key === 'price' && n === 0) return 'Must be above 0'
  return undefined
}

export function RatesTable() {
  const { toast } = useToast()
  const [rooms, setRooms] = useState<RoomRate[]>([])
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pricing/rooms')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load room rates')
      const list: RoomRate[] = data.rooms || []
      setRooms(list)
      setRows(Object.fromEntries(list.map((r) => [r.id, toRow(r)])))
      setShowErrors(false)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load room rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const changedIds = useMemo(
    () =>
      rooms
        .filter((r) => {
          const row = rows[r.id]
          if (!row) return false
          const orig = toRow(r)
          return RATE_KEYS.some((k) => row[k].trim() !== orig[k])
        })
        .map((r) => r.id),
    [rooms, rows],
  )

  const errors = useMemo(() => {
    const out: Record<string, Partial<Record<RateKey, string>>> = {}
    for (const id of changedIds) {
      const row = rows[id]
      for (const k of RATE_KEYS) {
        const e = cellError(k, row[k])
        if (e) (out[id] ??= {})[k] = e
      }
    }
    return out
  }, [changedIds, rows])

  const setCell = (id: string, key: RateKey, v: string) =>
    setRows((rs) => ({ ...rs, [id]: { ...rs[id], [key]: v } }))

  const discard = () => {
    setRows(Object.fromEntries(rooms.map((r) => [r.id, toRow(r)])))
    setShowErrors(false)
  }

  const save = async () => {
    if (!changedIds.length) return
    if (Object.keys(errors).length) {
      setShowErrors(true)
      toast({ title: 'Please fix the highlighted rates', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = changedIds.map((id) => {
        const row = rows[id]
        const opt = (v: string) => (v.trim() === '' ? null : Number(v))
        return {
          id,
          price: Number(row.price),
          weekendPrice: opt(row.weekendPrice),
          peakPrice: opt(row.peakPrice),
          eventPrice: opt(row.eventPrice),
        }
      })
      const res = await fetch('/api/admin/pricing/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save prices')
      toast({ title: data.message || 'Prices saved', description: 'New rates apply to new bookings only.' })
      await load()
    } catch (err) {
      toast({
        title: 'Could not save prices',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const dirty = changedIds.length > 0

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={discard} disabled={!dirty || saving}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        <span className="hidden sm:inline">Discard</span>
      </Button>
      <Button size="sm" onClick={save} disabled={!dirty || saving}>
        <Save className="mr-1.5 h-3.5 w-3.5" />
        {saving ? 'Saving…' : dirty ? `Save ${changedIds.length}` : 'Save'}
      </Button>
    </>
  )

  const input = (r: RoomRate, k: RateKey, label: string) => {
    const err = showErrors ? errors[r.id]?.[k] : undefined
    return (
      <div>
        <NumberInput
          aria-label={`${label} for room ${r.roomNo}`}
          prefix="₹" min={0}
          value={rows[r.id]?.[k] ?? ''}
          onChange={(v) => setCell(r.id, k, v)}
          placeholder={k === 'price' ? '' : 'Base'}
          invalid={!!err}
        />
        {err && <p className="mt-1 text-[11px] font-medium text-destructive">{err}</p>}
      </div>
    )
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Room rates"
        description="Nightly rate per room. Leave a premium rate blank to charge the base rate."
        actions={!loading && rooms.length > 0 ? actions : undefined}
      />

      {error && <div className="p-4"><ErrorState message={error} /></div>}

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : rooms.length === 0 ? (
        !error && (
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            description="Add rooms first, then set their rates here."
          />
        )
      ) : (
        <>
          {/* Desktop / tablet: grid */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Room
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rooms.map((r) => {
                  const changed = changedIds.includes(r.id)
                  return (
                    <tr key={r.id} className={cn('align-top transition-colors', changed && 'bg-amber-50/50')}>
                      <td className="px-4 py-3">
                        <RoomLabel room={r} changed={changed} />
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="min-w-[8.5rem] px-3 py-3">
                          {input(r, c.key, c.label)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per room */}
          <div className="divide-y divide-border/70 md:hidden">
            {rooms.map((r) => {
              const changed = changedIds.includes(r.id)
              return (
                <div key={r.id} className={cn('px-4 py-4', changed && 'bg-amber-50/50')}>
                  <RoomLabel room={r} changed={changed} />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {COLUMNS.map((c) => (
                      <div key={c.key}>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">{c.short}</p>
                        {input(r, c.key, c.label)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <span>
              {dirty
                ? `${changedIds.length} room${changedIds.length === 1 ? '' : 's'} changed`
                : 'Existing bookings keep the price they were quoted.'}
            </span>
            <div className="flex gap-2">{actions}</div>
          </div>
        </>
      )}
    </Panel>
  )
}

function RoomLabel({ room, changed }: { room: RoomRate; changed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
        {room.roomNo}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">
          {room.name}
          {changed && <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase text-amber-600">edited</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[room.type, room.acType === 'AC' ? 'AC' : 'Non-AC', `${room.capacity} guests`]
            .filter(Boolean)
            .join(' · ')}
          {room.status === 'MAINTENANCE' && ' · maintenance'}
        </p>
      </div>
    </div>
  )
}
