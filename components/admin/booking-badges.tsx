import { Globe, Store } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Small, low-chrome status pills. Deliberately quieter than shadcn's default
 * Badge so a dense table doesn't turn into confetti — colour carries meaning,
 * weight stays uniform.
 */
const pill =
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap'

export function SourceBadge({ source }: { source: 'ONLINE' | 'WALK_IN' }) {
  const walkIn = source === 'WALK_IN'
  return (
    <span
      className={cn(
        pill,
        walkIn
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-sky-200 bg-sky-50 text-sky-700',
      )}
    >
      {walkIn ? <Store className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
      {walkIn ? 'Walk-in' : 'Online'}
    </span>
  )
}

const STATUS: Record<string, { label: string; className: string; dot: string }> = {
  PENDING:     { label: 'Pending',     className: 'border-amber-200 bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  CONFIRMED:   { label: 'Confirmed',   className: 'border-blue-200 bg-blue-50 text-blue-700',        dot: 'bg-blue-500' },
  CHECKED_IN:  { label: 'Checked in',  className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  CHECKED_OUT: { label: 'Checked out', className: 'border-zinc-200 bg-zinc-50 text-zinc-600',        dot: 'bg-zinc-400' },
  CANCELLED:   { label: 'Cancelled',   className: 'border-rose-200 bg-rose-50 text-rose-700',        dot: 'bg-rose-500' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? {
    label: status.toLowerCase(),
    className: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  }
  return (
    <span className={cn(pill, s.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

const PAYMENT: Record<string, { label: string; className: string }> = {
  PAID:     { label: 'Paid',     className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  PARTIALLY_PAID: { label: 'Advance paid', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  PENDING:  { label: 'Unpaid',   className: 'border-orange-200 bg-orange-50 text-orange-700' },
  FAILED:   { label: 'Failed',   className: 'border-rose-200 bg-rose-50 text-rose-700' },
  REFUNDED: { label: 'Refunded', className: 'border-violet-200 bg-violet-50 text-violet-700' },
}

export function PaymentBadge({ status, mode }: { status: string; mode?: string }) {
  const p = PAYMENT[status] ?? {
    label: status.toLowerCase(),
    className: 'border-border bg-muted text-muted-foreground',
  }
  return (
    <span className={cn(pill, p.className)}>
      {p.label}
      {mode && (status === 'PAID' || status === 'PARTIALLY_PAID') && (
        <span className="font-normal opacity-70">· {mode.toLowerCase()}</span>
      )}
    </span>
  )
}

const TYPE_LABEL: Record<string, string> = { ROOM: 'Room', TABLE: 'Table', ROOM_TABLE: 'Room + Table' }

export function TypeBadge({ type }: { type: 'ROOM' | 'TABLE' | 'ROOM_TABLE' | string }) {
  return (
    <span className={cn(pill, 'border-border bg-muted/60 text-muted-foreground')}>
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

const REFUND: Record<string, { label: string; className: string }> = {
  REFUND_PENDING:   { label: 'Refund pending',   className: 'border-amber-200 bg-amber-50 text-amber-700' },
  REFUND_PROCESSED: { label: 'Refunded',         className: 'border-violet-200 bg-violet-50 text-violet-700' },
  REFUND_REJECTED:  { label: 'Refund rejected',  className: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
}

/** Renders nothing for NONE, so it can sit next to the payment badge unconditionally. */
export function RefundBadge({ status }: { status: string | null | undefined }) {
  const r = status ? REFUND[status] : undefined
  if (!r) return null
  return <span className={cn(pill, r.className)}>{r.label}</span>
}
