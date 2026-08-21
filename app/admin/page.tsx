'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  LogIn, LogOut, BedDouble, Wallet, UtensilsCrossed, Users,
  PlusCircle, ArrowRight, RefreshCw, CalendarX2, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SourceBadge, PaymentBadge } from '@/components/admin/booking-badges'
import {
  PageHeader, Panel, PanelHeader, StatCard, StatCardSkeleton,
  EmptyState, ErrorState, MiniBar, SkeletonBlock, inr,
} from '@/components/admin/ui'

type Movement = {
  id: string
  guestName: string
  guestPhone: string | null
  guestCount: number
  source: 'ONLINE' | 'WALK_IN'
  status: string
  paymentStatus: string
  totalPrice: number
  room: { name: string; roomNo: string } | null
}

type Dashboard = {
  metrics: {
    arrivals: number; departures: number; inHouse: number
    totalRooms: number; occupiedRooms: number; occupancyRate: number
    tableReservationsToday: number
    revenueToday: number; onlineRevenueToday: number; walkInRevenueToday: number
    pendingPaymentCount: number; pendingPaymentAmount: number
  }
  arrivals: Movement[]
  departures: Movement[]
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    try {
      const res = await fetch('/api/admin/dashboard')
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load dashboard')
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const act = async (id: string, action: 'CHECK_IN' | 'CHECK_OUT') => {
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
      await load(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const m = data?.metrics

  return (
    <div>
      <PageHeader
        title="Today at a glance"
        description={new Date().toLocaleDateString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/admin/bookings/new">
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                New booking
              </Link>
            </Button>
          </>
        }
      />

      {error && <div className="mb-6"><ErrorState message={error} /></div>}

      {/* ---- primary metrics ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !m ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Arrivals today" value={m.arrivals} icon={LogIn} accent="blue"
              sub={m.arrivals === 0 ? 'Nothing scheduled' : 'Awaiting check-in'}
            />
            <StatCard
              label="Departures today" value={m.departures} icon={LogOut} accent="amber"
              sub={m.departures === 0 ? 'Nothing scheduled' : 'Awaiting check-out'}
            />
            <StatCard
              label="Occupancy" value={`${m.occupancyRate}%`} icon={BedDouble} accent="emerald"
              sub={`${m.occupiedRooms} of ${m.totalRooms} rooms sold`}
              footer={<MiniBar value={m.occupiedRooms} max={m.totalRooms} />}
            />
            <StatCard
              label="Revenue today" value={inr(m.revenueToday, true)} icon={Wallet} accent="violet"
              footer={
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Online {inr(m.onlineRevenueToday, true)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Walk-in {inr(m.walkInRevenueToday, true)}
                  </span>
                </div>
              }
            />
          </>
        )}
      </div>

      {/* ---- secondary metrics ---- */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {loading || !m ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="In-house guests" value={m.inHouse} icon={Users} accent="slate" />
            <StatCard
              label="Table covers today" value={m.tableReservationsToday}
              icon={UtensilsCrossed} accent="slate"
            />
            <StatCard
              label="Outstanding payments" value={inr(m.pendingPaymentAmount, true)}
              icon={Clock} accent={m.pendingPaymentCount > 0 ? 'rose' : 'slate'}
              sub={`${m.pendingPaymentCount} booking${m.pendingPaymentCount === 1 ? '' : 's'} unpaid`}
            />
          </>
        )}
      </div>

      {/* ---- movements ---- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <MovementPanel
          title="Arrivals" description="Guests due to check in today"
          icon={LogIn} rows={data?.arrivals ?? []} loading={loading}
          emptyText="No arrivals scheduled for today."
          actionLabel="Check in" onAction={(id) => act(id, 'CHECK_IN')} busy={busy}
        />
        <MovementPanel
          title="Departures" description="Guests due to check out today"
          icon={LogOut} rows={data?.departures ?? []} loading={loading}
          emptyText="No departures scheduled for today."
          actionLabel="Check out" onAction={(id) => act(id, 'CHECK_OUT')} busy={busy}
        />
      </div>
    </div>
  )
}

function MovementPanel({
  title, description, icon: Icon, rows, loading,
  emptyText, actionLabel, onAction, busy,
}: {
  title: string
  description: string
  icon: React.ElementType
  rows: Movement[]
  loading: boolean
  emptyText: string
  actionLabel: string
  onAction: (id: string) => void
  busy: string | null
}) {
  return (
    <Panel>
      <PanelHeader
        title={title}
        description={description}
        actions={
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {loading ? '—' : rows.length}
          </span>
        }
      />

      {loading ? (
        <div className="divide-y divide-border/70">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="flex-1">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-2 h-3 w-48" />
              </div>
              <SkeletonBlock className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarX2} title={emptyText} />
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  {b.room?.roomNo ?? <Icon className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{b.guestName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.room?.name ?? '—'} · {b.guestCount} guest{b.guestCount > 1 ? 's' : ''}
                    {b.guestPhone ? ` · ${b.guestPhone}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <SourceBadge source={b.source} />
                    <PaymentBadge status={b.paymentStatus} />
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-medium tabular-nums">{inr(b.totalPrice)}</span>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={busy === b.id} onClick={() => onAction(b.id)}
                >
                  {busy === b.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      {actionLabel}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
