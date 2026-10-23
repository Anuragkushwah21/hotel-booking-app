import { CalendarClock, Info, Wallet } from 'lucide-react'
import type { Quote, NightKind } from '@/lib/pricing'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Invoice-style breakdown of a server quote: nightly rates, table, add-ons,
 * GST, total, and the pay-now / pay-at-check-in split. Shared by the room
 * page and checkout so both show exactly what will be charged.
 */

const KIND_LABEL: Record<NightKind, string | null> = {
  NORMAL: null,
  WEEKEND: 'Weekend',
  PEAK: 'Peak season',
  EVENT: 'Event date',
}

const shortDate = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  })

function Row({ label, value, muted, strong }: { label: React.ReactNode; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 text-sm', muted && 'text-muted-foreground', strong && 'font-semibold')}>
      <span className="min-w-0">{label}</span>
      <span className="flex-shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

export function PriceSummary({
  quote,
  tableLabel,
  showNights = true,
  className,
}: {
  quote: Quote
  /** e.g. "Table for 2 · 19:30" */
  tableLabel?: string | null
  showNights?: boolean
  className?: string
}) {
  // Collapse runs of identical rates so a 7-night stay isn't 7 rows.
  const groups: { kind: NightKind; label?: string; rate: number; dates: string[] }[] = []
  for (const n of quote.nights) {
    const last = groups[groups.length - 1]
    if (last && last.kind === n.kind && last.rate === n.rate && last.label === n.label) last.dates.push(n.date)
    else groups.push({ kind: n.kind, label: n.label, rate: n.rate, dates: [n.date] })
  }

  return (
    <div className={cn('space-y-2', className)}>
      {showNights &&
        groups.map((g, i) => (
          <Row
            key={i}
            muted
            label={
              <span>
                {formatINR(g.rate)} × {g.dates.length} night{g.dates.length > 1 ? 's' : ''}
                <span className="block text-[11px]">
                  {shortDate(g.dates[0])}
                  {g.dates.length > 1 ? ` – ${shortDate(g.dates[g.dates.length - 1])}` : ''}
                  {KIND_LABEL[g.kind] && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-px font-medium text-amber-800">
                      {g.label ?? KIND_LABEL[g.kind]}
                    </span>
                  )}
                </span>
              </span>
            }
            value={formatINR(g.rate * g.dates.length)}
          />
        ))}
      {!showNights && quote.roomAmount > 0 && <Row muted label="Room charges" value={formatINR(quote.roomAmount)} />}
      {quote.tableAmount > 0 && <Row muted label={tableLabel ?? 'Table reservation'} value={formatINR(quote.tableAmount)} />}
      {quote.addOnsAmount > 0 && <Row muted label="Add-on services" value={formatINR(quote.addOnsAmount)} />}
      {quote.taxAmount > 0 && <Row muted label={`GST (${quote.gstPercent}%)`} value={formatINR(quote.taxAmount)} />}

      <div className="border-t border-border pt-2">
        <Row strong label="Grand total" value={formatINR(quote.total)} />
      </div>

      <div className="mt-3 space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Row
          strong
          label={<span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" aria-hidden />Pay now</span>}
          value={formatINR(quote.dueNow)}
        />
        {quote.dueLater > 0 && (
          <Row
            muted
            label={<span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden />Pay at check-in</span>}
            value={formatINR(quote.dueLater)}
          />
        )}
        <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <Info className="mt-px h-3 w-3 flex-shrink-0" aria-hidden />
          {quote.ruleLabel}
        </p>
      </div>
    </div>
  )
}

export function PolicyList({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <ul className="space-y-1">
      {lines.map((l) => (
        <li key={l} className="flex gap-2 text-xs text-muted-foreground">
          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
          {l}
        </li>
      ))}
    </ul>
  )
}

/** Lunch and dinner service, in 30-minute steps. */
export const TABLE_SLOTS: { value: string; label: string; group: 'Lunch' | 'Dinner' }[] = (() => {
  const out: { value: string; label: string; group: 'Lunch' | 'Dinner' }[] = []
  const add = (from: number, to: number, group: 'Lunch' | 'Dinner') => {
    for (let m = from; m <= to; m += 30) {
      const h = Math.floor(m / 60)
      const mm = String(m % 60).padStart(2, '0')
      const value = `${String(h).padStart(2, '0')}:${mm}`
      const label = `${((h + 11) % 12) + 1}:${mm} ${h >= 12 ? 'PM' : 'AM'}`
      out.push({ value, label, group })
    }
  }
  add(12 * 60 + 30, 15 * 60, 'Lunch')
  add(19 * 60, 22 * 60 + 30, 'Dinner')
  return out
})()

export const slotLabel = (value: string) => TABLE_SLOTS.find((s) => s.value === value)?.label ?? value
