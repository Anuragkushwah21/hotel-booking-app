'use client'

/**
 * Peak seasons (date ranges) and special/event dates (single days) share the
 * same list → add/edit dialog → toggle → delete flow; `mode` picks the shape.
 */

import { useEffect, useState } from 'react'
import { CalendarRange, CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  Panel, PanelHeader, EmptyState, ErrorState, TableSkeleton,
} from '@/components/admin/ui'
import { Field, Switch } from '@/components/admin/settings/fields'
import { cn } from '@/lib/utils'

type Mode = 'range' | 'single'

type Item = {
  id: string
  name: string
  active: boolean
  startDate?: string
  endDate?: string
  date?: string
}

type FormState = { name: string; startDate: string; endDate: string; date: string; active: boolean }
type FormErrors = Partial<Record<keyof FormState, string>>

const EMPTY: FormState = { name: '', startDate: '', endDate: '', date: '', active: true }

/** @db.Date columns arrive as UTC-midnight ISO strings. */
const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : '')

const fmt = (key: string) =>
  key
    ? new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', {
        timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
      })
    : '—'

/** Today's calendar date in IST, as YYYY-MM-DD. */
const todayIST = () =>
  new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

const nightsBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1

export function DatedList({
  mode,
  endpoint,
  title,
  description,
  noun,
  emptyDescription,
  namePlaceholder,
}: {
  mode: Mode
  endpoint: string
  title: string
  description: string
  noun: string
  emptyDescription: string
  namePlaceholder: string
}) {
  const { toast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY })
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  const Icon = mode === 'range' ? CalendarRange : CalendarDays
  const today = todayIST()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(endpoint)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to load ${noun}s`)
      setItems(data.items || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${noun}s`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setErrors({})
    setOpen(true)
  }

  const openEdit = (it: Item) => {
    setEditing(it)
    setForm({
      name: it.name,
      startDate: dayKey(it.startDate),
      endDate: dayKey(it.endDate),
      date: dayKey(it.date),
      active: it.active,
    })
    setErrors({})
    setOpen(true)
  }

  const bodyFor = (f: FormState) =>
    mode === 'range'
      ? { name: f.name.trim(), startDate: f.startDate, endDate: f.endDate, active: f.active }
      : { name: f.name.trim(), date: f.date, active: f.active }

  const validate = (f: FormState): FormErrors => {
    const e: FormErrors = {}
    if (!f.name.trim()) e.name = 'Give it a name'
    else if (f.name.trim().length > 80) e.name = 'Keep it under 80 characters'
    if (mode === 'range') {
      if (!f.startDate) e.startDate = 'Pick a start date'
      if (!f.endDate) e.endDate = 'Pick an end date'
      if (f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = 'End date must be on or after start'
    } else if (!f.date) {
      e.date = 'Pick a date'
    }
    return e
  }

  const save = async () => {
    const v = validate(form)
    if (Object.keys(v).length) return setErrors(v)
    setSaving(true)
    try {
      const res = await fetch(editing ? `${endpoint}/${editing.id}` : endpoint, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFor(form)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const field = typeof data.field === 'string' ? data.field : ''
        if (field && field in EMPTY) {
          setErrors({ [field]: data.error } as FormErrors)
          return
        }
        throw new Error(data.error || `Failed to save ${noun}`)
      }
      toast({ title: editing ? `${cap(noun)} updated` : `${cap(noun)} added` })
      setOpen(false)
      await load()
    } catch (err) {
      toast({
        title: `Could not save ${noun}`,
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (it: Item) => {
    setBusyId(it.id)
    // Optimistic; rolled back on failure.
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, active: !it.active } : x)))
    try {
      const res = await fetch(`${endpoint}/${it.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          bodyFor({
            name: it.name,
            startDate: dayKey(it.startDate),
            endDate: dayKey(it.endDate),
            date: dayKey(it.date),
            active: !it.active,
          }),
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      toast({ title: `${it.name} ${it.active ? 'paused' : 'activated'}` })
    } catch (err) {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, active: it.active } : x)))
      toast({
        title: `Could not update ${noun}`,
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (it: Item) => {
    if (!confirm(`Delete ${noun} "${it.name}"? Existing bookings keep the price they were quoted.`)) return
    setBusyId(it.id)
    try {
      const res = await fetch(`${endpoint}/${it.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      toast({ title: `${cap(noun)} deleted` })
      setItems((xs) => xs.filter((x) => x.id !== it.id))
    } catch (err) {
      toast({
        title: `Could not delete ${noun}`,
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const lastDay = (it: Item) => (mode === 'range' ? dayKey(it.endDate) : dayKey(it.date))
  const isPast = (it: Item) => lastDay(it) < today
  const pastCount = items.filter(isPast).length
  const visible = showPast ? items : items.filter((it) => !isPast(it))

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={title}
        description={description}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add<span className="hidden sm:inline">&nbsp;{noun}</span>
          </Button>
        }
      />

      {error && <div className="p-4"><ErrorState message={error} /></div>}

      {loading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : visible.length === 0 ? (
        !error && (
          <EmptyState
            icon={Icon}
            title={items.length ? `No upcoming ${noun}s` : `No ${noun}s yet`}
            description={emptyDescription}
            action={
              <Button size="sm" variant="outline" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add {noun}
              </Button>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-border/70">
          {visible.map((it) => {
            const past = isPast(it)
            const current = mode === 'range' && !past && dayKey(it.startDate) <= today
            return (
              <li
                key={it.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5',
                  (!it.active || past) && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                    <span className="truncate">{it.name}</span>
                    {current && it.active && <Tag className="border-emerald-200 bg-emerald-50 text-emerald-700">now</Tag>}
                    {past && <Tag className="border-border bg-muted text-muted-foreground">past</Tag>}
                    {!it.active && <Tag className="border-zinc-200 bg-zinc-50 text-zinc-600">paused</Tag>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {mode === 'range' ? (
                      <>
                        {fmt(dayKey(it.startDate))} – {fmt(dayKey(it.endDate))}
                        <span className="ml-1.5">
                          ({nightsBetween(dayKey(it.startDate), dayKey(it.endDate))} nights)
                        </span>
                      </>
                    ) : (
                      fmt(dayKey(it.date))
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={it.active}
                    disabled={busyId === it.id}
                    onCheckedChange={() => toggle(it)}
                    aria-label={`${it.active ? 'Pause' : 'Activate'} ${it.name}`}
                  />
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0"
                    onClick={() => openEdit(it)} title={`Edit ${noun}`} disabled={busyId === it.id}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(it)} title={`Delete ${noun}`} disabled={busyId === it.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!loading && pastCount > 0 && (
        <div className="border-t border-border/70 px-5 py-2.5">
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowPast((s) => !s)}
          >
            {showPast ? 'Hide past' : `Show ${pastCount} past`}
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
            <DialogDescription>
              {mode === 'range'
                ? 'Nights in this range use each room’s peak-season rate.'
                : 'This night uses each room’s event-date rate.'}
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); save() }}
            noValidate
          >
            <Field label="Name" htmlFor="dl-name" required error={errors.name} className="sm:col-span-2">
              <Input
                id="dl-name" className="h-9" placeholder={namePlaceholder} maxLength={80}
                value={form.name} aria-invalid={!!errors.name || undefined}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            {mode === 'range' ? (
              <>
                <Field label="Start date" htmlFor="dl-start" required error={errors.startDate}>
                  <Input
                    id="dl-start" type="date" className="h-9"
                    value={form.startDate} aria-invalid={!!errors.startDate || undefined}
                    onChange={(e) => set('startDate', e.target.value)}
                  />
                </Field>
                <Field label="End date" htmlFor="dl-end" required error={errors.endDate} hint="Inclusive.">
                  <Input
                    id="dl-end" type="date" className="h-9" min={form.startDate || undefined}
                    value={form.endDate} aria-invalid={!!errors.endDate || undefined}
                    onChange={(e) => set('endDate', e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <Field label="Date" htmlFor="dl-date" required error={errors.date} className="sm:col-span-2">
                <Input
                  id="dl-date" type="date" className="h-9"
                  value={form.date} aria-invalid={!!errors.date || undefined}
                  onChange={(e) => set('date', e.target.value)}
                />
              </Field>
            )}
            <div className="flex items-center justify-between gap-4 sm:col-span-2">
              <label htmlFor="dl-active" className="text-sm font-medium">Active</label>
              <Switch id="dl-active" checked={form.active} onCheckedChange={(v) => set('active', v)} />
            </div>

            <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : `Add ${noun}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

function Tag({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium', className)}>
      {children}
    </span>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
