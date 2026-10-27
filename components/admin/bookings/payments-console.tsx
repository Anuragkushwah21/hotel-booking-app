'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Check, Inbox, RefreshCw, RotateCcw, Search, SlidersHorizontal, Wallet, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SourceBadge, StatusBadge, TypeBadge } from '@/components/admin/booking-badges'
import {
  EmptyState, ErrorState, PageHeader, Panel, PanelHeader, StatCard, StatCardSkeleton,
  TableSkeleton, inr,
} from '@/components/admin/ui'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { api, errMsg, fmtDate, fmtDateTime, KIND_LABEL, type PaymentRow } from './api'

type LedgerRow = PaymentRow & {
  booking: {
    id: string; reference: string; guestName: string; type: string; source: 'ONLINE' | 'WALK_IN'; totalPrice: number
  } | null
}

type QueueRow = {
  id: string
  reference: string
  guestName: string
  type: string
  source: 'ONLINE' | 'WALK_IN'
  status: string
  paidAmount: number
  refundAmount: number
  refundRequestedAt: string | null
  cancelReason: string | null
  checkInDate: string | null
  bookingDate: string | null
}

type Payload = {
  payments: LedgerRow[]
  pagination: { page: number; limit: number; total: number; pages: number }
  totals: { collected: number; refunded: number; net: number }
  refundQueue: QueueRow[]
}

const ALL = 'ALL'
const EMPTY = { kind: ALL, status: ALL, mode: ALL, gateway: ALL, from: '', to: '', q: '' }

const STATUS_CLASS: Record<string, string> = {
  SUCCEEDED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-700',
  CREATED: 'border-amber-200 bg-amber-50 text-amber-700',
}

export function PaymentsConsole() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      for (const [k, v] of Object.entries(filters)) if (v && v !== ALL) params.set(k, v)
      setData(await api<Payload>(`/api/admin/payments?${params}`))
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    load()
  }, [load])

  const setFilter = (k: keyof typeof EMPTY, v: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [k]: v }))
  }
  const activeCount = Object.entries(filters).filter(([k, v]) => v && v !== ALL && k !== 'q').length

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Pending refunds to settle, and every payment in and out."
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!data && loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard label="Collected" value={inr(data.totals.collected, true)} icon={Wallet} accent="emerald" sub="Succeeded, in filtered range" />
            <StatCard label="Refunded" value={inr(data.totals.refunded, true)} icon={RotateCcw} accent="violet" />
            <StatCard label="Net" value={inr(data.totals.net, true)} accent="blue" />
            <StatCard
              label="Refunds pending"
              value={data.refundQueue.length}
              accent="amber"
              sub={inr(data.refundQueue.reduce((s, r) => s + r.refundAmount, 0)) + ' requested'}
            />
          </>
        ) : null}
      </div>

      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      {/* ---- refund queue ---- */}
      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Refund queue"
          description="Cancelled bookings with a refund waiting. Online payments are refunded through the gateway."
        />
        {!data && loading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : !data?.refundQueue.length ? (
          <EmptyState icon={Check} title="No refunds pending" description="New cancellations with a refund due will appear here." />
        ) : (
          <ul className="divide-y divide-border/70">
            {data.refundQueue.map((r) => (
              <RefundRow key={r.id} row={r} onDone={load} />
            ))}
          </ul>
        )}
      </Panel>

      {/* ---- ledger ---- */}
      <Panel className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Booking number, guest name or gateway id"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
            />
          </div>
          <Button variant={showFilters ? 'secondary' : 'outline'} size="sm" className="h-9" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="ml-1.5 rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{activeCount}</span>
            )}
          </Button>
          {(activeCount > 0 || filters.q) && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setPage(1); setFilters(EMPTY) }}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 lg:grid-cols-6">
            <FilterSelect label="Kind" value={filters.kind} onChange={(v) => setFilter('kind', v)}
              options={[[ALL, 'All kinds'], ['ADVANCE', 'Advance'], ['BALANCE', 'Balance'], ['FULL', 'Full'], ['REFUND', 'Refund']]} />
            <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter('status', v)}
              options={[[ALL, 'All statuses'], ['SUCCEEDED', 'Succeeded'], ['CREATED', 'Created'], ['FAILED', 'Failed']]} />
            <FilterSelect label="Mode" value={filters.mode} onChange={(v) => setFilter('mode', v)}
              options={[[ALL, 'All modes'], ['ONLINE', 'Online'], ['CASH', 'Cash'], ['CARD', 'Card'], ['UPI', 'UPI']]} />
            <FilterSelect label="Gateway" value={filters.gateway} onChange={(v) => setFilter('gateway', v)}
              options={[[ALL, 'All gateways'], ['RAZORPAY', 'Razorpay'], ['DESK', 'Desk'], ['MOCK', 'Mock'], ['LEGACY', 'Legacy']]} />
            <div>
              <Label htmlFor="p-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="p-from" type="date" className="mt-1 h-9" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="p-to" type="date" className="mt-1 h-9" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            </div>
          </div>
        )}
      </Panel>

      <Panel className="mt-4 overflow-hidden">
        {loading && !data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !data?.payments.length ? (
          <EmptyState icon={Inbox} title="No payments match these filters" />
        ) : (
          <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {['When', 'Booking', 'Kind', 'Mode', 'Status', 'Amount'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                        i === 5 ? 'text-right' : 'text-left',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">
                      {fmtDateTime(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {p.booking ? (
                        <Link
                          href={`/admin/bookings?booking=${p.booking.id}&q=${encodeURIComponent(p.booking.reference)}`}
                          className="font-mono text-xs font-semibold tracking-wider hover:underline"
                        >
                          {p.booking.reference}
                        </Link>
                      ) : '—'}
                      <p className="text-xs text-muted-foreground">{p.booking?.guestName}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{KIND_LABEL[p.kind] ?? p.kind}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="lowercase">{p.mode}</span>
                      <p className="text-[11px] lowercase text-muted-foreground">
                        {p.gateway}
                        {p.recordedBy && ` · ${p.recordedBy.name || p.recordedBy.email}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium lowercase', STATUS_CLASS[p.status])}>
                        {p.status}
                      </span>
                      {p.failureReason && <p className="mt-0.5 max-w-[200px] text-[11px] text-rose-700">{p.failureReason}</p>}
                    </td>
                    <td className={cn('whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums', p.kind === 'REFUND' && 'text-violet-700')}>
                      {p.kind === 'REFUND' ? '−' : ''}{inr(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pagination.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{data.pagination.total}</span> payments
            </p>
            {data.pagination.pages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  Page {data.pagination.page} / {data.pagination.pages}
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

function RefundRow({ row, onDone }: { row: QueueRow; onDone: () => Promise<void> }) {
  const { toast } = useToast()
  const [amount, setAmount] = useState(String(row.refundAmount))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'PROCESS' | 'REJECT' | null>(null)

  const act = async (action: 'PROCESS' | 'REJECT') => {
    const n = Math.round(Number(amount))
    if (action === 'PROCESS') {
      if (!Number.isFinite(n) || n < 1 || n > row.paidAmount) {
        toast({ title: `Refund must be between ₹1 and ${inr(row.paidAmount)}`, variant: 'destructive' })
        return
      }
      if (!confirm(`Pay out ${inr(n)} to ${row.guestName} (${row.reference})? Online payments are refunded through the gateway.`)) return
    } else if (!confirm(`Reject the ${inr(row.refundAmount)} refund for ${row.guestName} (${row.reference})?`)) {
      return
    }

    setBusy(action)
    try {
      const res = await api<{ message: string }>(`/api/admin/bookings/${row.id}/refund`, {
        method: 'POST',
        body: {
          action,
          ...(action === 'PROCESS' && n !== row.refundAmount ? { amount: n } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      })
      toast({ title: res.message })
      await onDone()
    } catch (e) {
      toast({ title: action === 'PROCESS' ? 'Refund failed' : 'Could not reject refund', description: errMsg(e), variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  const when = row.checkInDate ?? row.bookingDate

  return (
    <li className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/admin/bookings?booking=${row.id}&q=${encodeURIComponent(row.reference)}`}
            className="font-mono text-xs font-semibold tracking-wider hover:underline"
          >
            {row.reference}
          </Link>
          <TypeBadge type={row.type} />
          <SourceBadge source={row.source} />
          <StatusBadge status={row.status} />
        </div>
        <p className="mt-1 font-medium">{row.guestName}</p>
        <p className="text-xs text-muted-foreground">
          Paid <span className="font-medium text-foreground tabular-nums">{inr(row.paidAmount)}</span>
          {' · '}requested <span className="font-medium text-foreground tabular-nums">{inr(row.refundAmount)}</span>
          {when && <> · for {fmtDate(when)}</>}
        </p>
        <p className="text-xs text-muted-foreground">Requested {fmtDateTime(row.refundRequestedAt)}</p>
        {row.cancelReason && (
          <p className="mt-1 break-words text-xs text-muted-foreground">“{row.cancelReason}”</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Refund ₹</Label>
          <Input type="number" min={1} max={row.paidAmount} className="mt-1 h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Note</Label>
          <Input className="mt-1 h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </div>
        <Button size="sm" className="h-9" disabled={!!busy} onClick={() => act('PROCESS')}>
          {busy === 'PROCESS' ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
          Process
        </Button>
        <Button
          size="sm" variant="outline" className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={!!busy} onClick={() => act('REJECT')}
        >
          {busy === 'REJECT' ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}
          Reject
        </Button>
      </div>
    </li>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
