'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type Range = { from: string; to: string }

/** IST calendar date, YYYY-MM-DD (matches lib/format dateKey on the server). */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function shiftKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function lastNDays(n: number): Range {
  const to = istToday()
  return { from: shiftKey(to, -(n - 1)), to }
}

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '12M', days: 365 },
] as const

/** Presets plus a custom inclusive range. The server caps ranges at 366 days. */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: Range
  onChange: (r: Range) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const today = istToday()
  const active = PRESETS.find((p) => {
    const r = lastNDays(p.days)
    return r.from === value.from && r.to === value.to
  })

  const apply = () => {
    if (!draft.from || !draft.to) return
    onChange(draft.from > draft.to ? { from: draft.to, to: draft.from } : draft)
  }
  const dirty = draft.from !== value.from || draft.to !== value.to

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <div className="inline-flex rounded-lg border border-border/70 bg-card p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(lastNDays(p.days))}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active?.label === p.label
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <Input
          type="date"
          aria-label="From"
          className="h-8 min-w-0 flex-1 text-xs sm:w-[140px] sm:flex-none"
          value={draft.from}
          max={today}
          onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To"
          className="h-8 min-w-0 flex-1 text-xs sm:w-[140px] sm:flex-none"
          value={draft.to}
          onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
        />
        <Button size="sm" variant="outline" className="h-8" onClick={apply} disabled={!dirty}>
          Apply
        </Button>
      </div>
    </div>
  )
}
