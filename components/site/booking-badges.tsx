import { CreditCard, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Guest-facing status pills, shared by My Bookings, the confirmation page and
 * the booking-number lookup so the same state always reads the same way.
 */

const pill =
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap'

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Awaiting payment', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  CONFIRMED: { label: 'Confirmed', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  CHECKED_IN: { label: 'Checked in', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  CHECKED_OUT: { label: 'Completed', className: 'border-zinc-200 bg-zinc-50 text-zinc-700' },
  CANCELLED: { label: 'Cancelled', className: 'border-rose-200 bg-rose-50 text-rose-800' },
}

export function BookingStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, className: 'border-border bg-muted text-muted-foreground' }
  return <span className={cn(pill, s.className)}>{s.label}</span>
}

const PAYMENT: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Unpaid', className: 'border-orange-200 bg-orange-50 text-orange-800' },
  PARTIALLY_PAID: { label: 'Advance paid', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  PAID: { label: 'Paid in full', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  FAILED: { label: 'Payment failed', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  REFUNDED: { label: 'Refunded', className: 'border-violet-200 bg-violet-50 text-violet-800' },
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const p = PAYMENT[status] ?? { label: status, className: 'border-border bg-muted text-muted-foreground' }
  return (
    <span className={cn(pill, p.className)}>
      <CreditCard className="h-3 w-3" aria-hidden />
      {p.label}
    </span>
  )
}

const REFUND: Record<string, { label: string; className: string }> = {
  REFUND_PENDING: { label: 'Refund pending', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  REFUND_PROCESSED: { label: 'Refunded', className: 'border-violet-200 bg-violet-50 text-violet-800' },
  REFUND_REJECTED: { label: 'Refund declined', className: 'border-zinc-200 bg-zinc-50 text-zinc-700' },
}

export function RefundStatusBadge({ status }: { status: string }) {
  const r = REFUND[status]
  if (!r) return null
  return (
    <span className={cn(pill, r.className)}>
      <RotateCcw className="h-3 w-3" aria-hidden />
      {r.label}
    </span>
  )
}

export function bookingTitle(b: {
  type: string
  roomName: string | null
  tableNo: string | null
}): string {
  if (b.type === 'ROOM_TABLE') return `${b.roomName ?? 'Room'} + Table ${b.tableNo ?? ''}`.trim()
  if (b.type === 'ROOM') return b.roomName ?? 'Room booking'
  return `Table ${b.tableNo ?? 'reservation'}`
}
