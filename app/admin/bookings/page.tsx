'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  PlusCircle, Search, Inbox, LogIn, LogOut, XCircle, Check,
  RefreshCw, X, SlidersHorizontal,
  BedDouble, UtensilsCrossed,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { SourceBadge, StatusBadge, PaymentBadge, TypeBadge } from '@/components/admin/booking-badges'
import {
  PageHeader, Panel, StatCard, StatCardSkeleton, EmptyState,
  ErrorState, TableSkeleton, inr,
} from '@/components/admin/ui'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Booking = {
  id: string
  reference: string
  type: 'ROOM' | 'TABLE'
  source: 'ONLINE' | 'WALK_IN'
  status: string
  paymentStatus: string
  paymentMode: string
  guestName: string
  guestEmail: string
  guestPhone: string | null
  guestCount: number
  roomName: string | null
  roomNo: string | null
  tableNo: string | null
  checkInDate: string | null
  checkOutDate: string | null
  bookingDate: string | null
  totalPrice: number
  refundAmount: number
  bookedBy: { id: string; name: string | null; email: string } | null
  createdAt: string
}

type Payload = {
  bookings: Booking[]
  pagination: { page: number; limit: number; total: number; pages: number }
  totals: {
    online: number; walkIn: number; onlineRevenue: number; walkInRevenue: number
    rooms: number; tables: number; roomRevenue: number; tableRevenue: number
  }
}

const ALL = 'ALL'
const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'
const dayTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit',
      })
    : '—'

const EMPTY_FILTERS = { source: ALL, type: ALL, status: ALL, payment: ALL, from: '', to: '', q: '' }

function AdminBookingsContent() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    source: searchParams.get('source') ?? ALL,
  })
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' })
      for (const [k, v] of Object.entries(filters)) if (v && v !== ALL) params.set(k, v)
      const res = await fetch(`/api/admin/bookings?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load bookings')
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    load()
  }, [load])

  const setFilter = (k: keyof typeof filters, v: string) => {
    setPage(1)
    setFilters((f) => ({ ...f, [k]: v }))
  }

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v && v !== ALL && k !== 'q',
  ).length

  const runAction = async (id: string, action: 'CHECK_IN' | 'CHECK_OUT' | 'CONFIRM') => {
    setBusy(id)
    try {
      let res = await fetch(`/api/admin/bookings/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      let body = await res.json()

      if (!res.ok && body.code === 'PAYMENT_PENDING') {
        if (!confirm(`${body.error}. Check in anyway?`)) return
        res = await fetch(`/api/admin/bookings/${id}/status?force=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes: 'Checked in with payment pending' }),
        })
        body = await res.json()
      }
      if (!res.ok) throw new Error(body.error)
      toast({ title: body.message })
      await load()
    } catch (e) {
      toast({
        title: 'Action failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (b: Booking) => {
    const reason = prompt(`Cancel booking for ${b.guestName}?\n\nReason (optional):`)
    if (reason === null) return

    let refund = 0
    if (b.paymentStatus === 'PAID') {
      const input = prompt(`Refund amount (0 – ${b.totalPrice}):`, String(b.totalPrice))
      if (input === null) return
      refund = Number(input) || 0
    }

    setBusy(b.id)
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, refundAmount: refund }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      toast({ title: body.message })
      await load()
    } catch (e) {
      toast({
        title: 'Cancellation failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Online and walk-in reservations in a single ledger."
        actions={
          <Button size="sm" asChild>
            <Link href="/admin/bookings/new">
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              New booking
            </Link>
          </Button>
        }
      />

      {/* Rooms and tables are different operations — the desk works one at a
          time, so they get their own views rather than one mixed list. */}
      <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/40 p-1">
        {([
          [ALL, 'All bookings', data ? data.totals.rooms + data.totals.tables : null],
          ['ROOM', 'Room bookings', data?.totals.rooms ?? null],
          ['TABLE', 'Table bookings', data?.totals.tables ?? null],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setPage(1); setFilter('type', value) }}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              filters.type === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {value === 'ROOM' && <BedDouble className="h-3.5 w-3.5" />}
            {value === 'TABLE' && <UtensilsCrossed className="h-3.5 w-3.5" />}
            {label}
            {count !== null && (
              <span className="rounded bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard
              label={filters.type === 'TABLE' ? 'Online reservations' : 'Online bookings'}
              value={data.totals.online} accent="blue"
            />
            <StatCard
              label={filters.type === 'TABLE' ? 'Walk-in reservations' : 'Walk-in bookings'}
              value={data.totals.walkIn} accent="amber"
            />
            <StatCard label="Online value" value={inr(data.totals.onlineRevenue, true)} accent="blue" />
            <StatCard label="Walk-in value" value={inr(data.totals.walkInRevenue, true)} accent="amber" />
          </>
        ) : null}
      </div>

      {/* ---- search + filters ---- */}
      <Panel className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Search guest name, email, phone or booking number (HB-…)"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
            />
          </div>

          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setShowFilters((s) => !s)}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {(activeFilterCount > 0 || filters.q) && (
            <Button
              variant="ghost" size="sm" className="h-9 text-muted-foreground"
              onClick={() => {
                setPage(1)
                setFilters(EMPTY_FILTERS)
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 lg:grid-cols-6">
            <FilterSelect
              label="Source" value={filters.source} onChange={(v) => setFilter('source', v)}
              options={[[ALL, 'All sources'], ['ONLINE', 'Online'], ['WALK_IN', 'Walk-in']]}
            />
            <FilterSelect
              label="Status" value={filters.status} onChange={(v) => setFilter('status', v)}
              options={[
                [ALL, 'All statuses'], ['PENDING', 'Pending'], ['CONFIRMED', 'Confirmed'],
                ['CHECKED_IN', 'Checked in'], ['CHECKED_OUT', 'Checked out'], ['CANCELLED', 'Cancelled'],
              ]}
            />
            <FilterSelect
              label="Payment" value={filters.payment} onChange={(v) => setFilter('payment', v)}
              options={[
                [ALL, 'All payments'], ['PAID', 'Paid'], ['PENDING', 'Unpaid'],
                ['FAILED', 'Failed'], ['REFUNDED', 'Refunded'],
              ]}
            />
            <div>
              <Label htmlFor="from" className="text-xs text-muted-foreground">Stay from</Label>
              <Input
                id="from" type="date" className="mt-1 h-9"
                value={filters.from} onChange={(e) => setFilter('from', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs text-muted-foreground">Stay to</Label>
              <Input
                id="to" type="date" className="mt-1 h-9"
                value={filters.to} onChange={(e) => setFilter('to', e.target.value)}
              />
            </div>
          </div>
        )}
      </Panel>

      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      {/* ---- ledger ---- */}
      <Panel className="mt-4 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !data?.bookings.length ? (
          <EmptyState
            icon={Inbox}
            title="No bookings match these filters"
            description="Try widening the date range, or clear the filters to see everything."
            action={
              <Button
                variant="outline" size="sm"
                onClick={() => { setPage(1); setFilters(EMPTY_FILTERS) }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {['Guest', 'Channel', 'Allocation', 'Stay', 'Status', 'Payment', 'Amount', ''].map(
                    (h, i) => (
                      <th
                        key={h || i}
                        className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${
                          i >= 6 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.bookings.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{b.guestName}</p>
                      <p className="font-mono text-xs font-semibold tracking-wider text-foreground">
                        {b.reference}
                      </p>
                      <p className="text-xs text-muted-foreground">{b.guestEmail}</p>
                      {b.guestPhone && (
                        <p className="text-xs text-muted-foreground">{b.guestPhone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={b.source} />
                      {b.bookedBy && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          by {b.bookedBy.name || b.bookedBy.email}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <TypeBadge type={b.type} />
                        <span className="text-sm text-foreground">
                          {b.type === 'ROOM' ? b.roomNo ?? '—' : b.tableNo ?? '—'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {b.type === 'ROOM' ? b.roomName ?? '' : ''} · {b.guestCount} pax
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {b.type === 'ROOM'
                        ? `${day(b.checkInDate)} → ${day(b.checkOutDate)}`
                        : dayTime(b.bookingDate)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3">
                      <PaymentBadge status={b.paymentStatus} mode={b.paymentMode} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span className="font-medium tabular-nums">{inr(b.totalPrice)}</span>
                      {b.refundAmount > 0 && (
                        <p className="text-[11px] tabular-nums text-violet-600">
                          −{inr(b.refundAmount)} refunded
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {b.status === 'PENDING' && (
                          <RowAction
                            label="Confirm" icon={Check} busy={busy === b.id}
                            onClick={() => runAction(b.id, 'CONFIRM')}
                          />
                        )}
                        {b.status === 'CONFIRMED' && (
                          <RowAction
                            label="Check in" icon={LogIn} busy={busy === b.id}
                            onClick={() => runAction(b.id, 'CHECK_IN')}
                          />
                        )}
                        {b.status === 'CHECKED_IN' && (
                          <RowAction
                            label="Check out" icon={LogOut} busy={busy === b.id}
                            onClick={() => runAction(b.id, 'CHECK_OUT')}
                          />
                        )}
                        {!['CANCELLED', 'CHECKED_OUT'].includes(b.status) && (
                          <Button
                            size="sm" variant="ghost" disabled={busy === b.id}
                            className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => cancel(b)} title="Cancel booking"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pagination.total > 0 && (
          <div className="flex items-center justify-between border-t border-border/70 px-4 py-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Showing{' '}
              <span className="font-medium tabular-nums text-foreground">
                {data.bookings.length}
              </span>{' '}
              of{' '}
              <span className="font-medium tabular-nums text-foreground">
                {data.pagination.total}
              </span>{' '}
              bookings
            </p>
            {data.pagination.pages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  Page {data.pagination.page} / {data.pagination.pages}
                </span>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)}
                >
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

function RowAction({
  label, icon: Icon, busy, onClick,
}: {
  label: string
  icon: React.ElementType
  busy: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="sm" variant="outline" className="h-7 whitespace-nowrap px-2 text-xs"
      disabled={busy} onClick={onClick}
    >
      {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Icon className="mr-1 h-3 w-3" />}
      {!busy && label}
    </Button>
  )
}

/**
 * useSearchParams() forces client-side bailout, which Next requires to sit
 * behind a Suspense boundary or the page fails to prerender at build time.
 */
export default function AdminBookingsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
      <AdminBookingsContent />
    </Suspense>
  )
}
