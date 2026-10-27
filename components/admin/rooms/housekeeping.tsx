'use client'

import { Sparkles, Brush, Loader, BadgeCheck } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type Housekeeping = 'CLEAN' | 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED'

export const HOUSEKEEPING: Record<
  Housekeeping,
  { label: string; icon: React.ElementType; pill: string; dot: string }
> = {
  DIRTY: {
    label: 'Dirty', icon: Brush,
    pill: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500',
  },
  IN_PROGRESS: {
    label: 'Cleaning', icon: Loader,
    pill: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500',
  },
  CLEAN: {
    label: 'Clean', icon: Sparkles,
    pill: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500',
  },
  INSPECTED: {
    label: 'Inspected', icon: BadgeCheck,
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500',
  },
}

/** Workflow order: what needs doing first. */
export const HOUSEKEEPING_ORDER: Housekeeping[] = ['DIRTY', 'IN_PROGRESS', 'CLEAN', 'INSPECTED']

/** Inline status picker that reads as a pill. */
export function HousekeepingSelect({
  value,
  onChange,
  disabled,
}: {
  value: Housekeeping
  onChange: (v: Housekeeping) => void
  disabled?: boolean
}) {
  const meta = HOUSEKEEPING[value] ?? HOUSEKEEPING.CLEAN
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Housekeeping)} disabled={disabled}>
      <SelectTrigger
        className={cn('h-7 w-[124px] gap-1.5 border px-2 text-[11px] font-medium', meta.pill)}
        aria-label="Housekeeping status"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HOUSEKEEPING_ORDER.map((h) => (
          <SelectItem key={h} value={h} className="text-xs">
            <span className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', HOUSEKEEPING[h].dot)} />
              {HOUSEKEEPING[h].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Count tiles that double as a filter. */
export function HousekeepingBoard({
  counts,
  active,
  onSelect,
}: {
  counts: Record<Housekeeping, number>
  active: Housekeeping | null
  onSelect: (h: Housekeeping | null) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {HOUSEKEEPING_ORDER.map((h) => {
        const meta = HOUSEKEEPING[h]
        const Icon = meta.icon
        const on = active === h
        return (
          <button
            key={h}
            type="button"
            onClick={() => onSelect(on ? null : h)}
            aria-pressed={on}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
              on ? meta.pill : 'border-border/70 bg-card hover:bg-muted/40',
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
            <span className="text-lg font-semibold tabular-nums">{counts[h] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
