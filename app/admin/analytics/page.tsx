'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp, Wallet, CalendarCheck, Percent, BarChart3, Globe, Store,
} from 'lucide-react'
import {
  PageHeader, Panel, PanelHeader, StatCard, StatCardSkeleton,
  EmptyState, ErrorState, TableSkeleton, MiniBar, inr,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import {
  ChannelTrendChart, ChartLegend, RankedBarChart, RevenueTrendChart, SERIES, SplitMeter,
} from '@/components/admin/charts'

type Booking = {
  id: string
  type: 'ROOM' | 'TABLE'
  source: 'ONLINE' | 'WALK_IN'
  status: string
  paymentStatus: string
  roomName: string | null
  totalPrice: number
  checkInDate: string | null
  bookingDate: string | null
  createdAt: string
}

const MONTH = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

export default function AdminReportsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        // Pull a wide page and aggregate client-side. Fine at this volume;
        // move to a dedicated SQL aggregate endpoint when it grows.
        const res = await fetch('/api/admin/bookings?limit=100')
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load report data')
        const data = await res.json()
        setBookings(data.bookings ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load report data')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const report = useMemo(() => {
    const live = bookings.filter((b) => b.status !== 'CANCELLED')
    const paid = live.filter((b) => b.paymentStatus === 'PAID')

    const revenue = paid.reduce((s, b) => s + b.totalPrice, 0)
    const outstanding = live
      .filter((b) => b.paymentStatus === 'PENDING')
      .reduce((s, b) => s + b.totalPrice, 0)

    const online = live.filter((b) => b.source === 'ONLINE')
    const walkIn = live.filter((b) => b.source === 'WALK_IN')

    // Revenue is paid-only; the channel counts alongside it are every live
    // booking, so an unpaid walk-in still shows up in the mix.
    const monthKey = (b: Booking) => b.checkInDate ?? b.bookingDate ?? b.createdAt
    const byMonth = new Map<
      string,
      { sortKey: number; revenue: number; count: number; online: number; walkIn: number }
    >()

    const monthBucket = (b: Booking) => {
      const when = new Date(monthKey(b))
      const key = MONTH(monthKey(b))
      const cur =
        byMonth.get(key) ??
        { sortKey: when.getFullYear() * 12 + when.getMonth(), revenue: 0, count: 0, online: 0, walkIn: 0 }
      byMonth.set(key, cur)
      return cur
    }

    for (const b of live) {
      const bucket = monthBucket(b)
      if (b.source === 'ONLINE') bucket.online += 1
      else bucket.walkIn += 1
      if (b.paymentStatus === 'PAID') {
        bucket.revenue += b.totalPrice
        bucket.count += 1
      }
    }

    const months = [...byMonth.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.sortKey - b.sortKey)

    // Rooms vs restaurant — two lines of business, one part-to-whole bar.
    const roomRevenue = paid.filter((b) => b.type === 'ROOM').reduce((s, b) => s + b.totalPrice, 0)
    const tableRevenue = paid.filter((b) => b.type === 'TABLE').reduce((s, b) => s + b.totalPrice, 0)

    // revenue by room name (rooms only)
    const byRoom = new Map<string, { revenue: number; count: number }>()
    for (const b of live.filter((x) => x.type === 'ROOM')) {
      const key = b.roomName || 'Unassigned'
      const cur = byRoom.get(key) ?? { revenue: 0, count: 0 }
      cur.revenue += b.totalPrice
      cur.count += 1
      byRoom.set(key, cur)
    }
    const rooms = [...byRoom.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)

    const statuses = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].map(
      (s) => ({ status: s, count: bookings.filter((b) => b.status === s).length }),
    )

    return {
      revenue,
      outstanding,
      totalBookings: live.length,
      avgValue: live.length ? Math.round(revenue / Math.max(paid.length, 1)) : 0,
      online: online.length,
      walkIn: walkIn.length,
      onlineRevenue: online.filter((b) => b.paymentStatus === 'PAID').reduce((s, b) => s + b.totalPrice, 0),
      walkInRevenue: walkIn.filter((b) => b.paymentStatus === 'PAID').reduce((s, b) => s + b.totalPrice, 0),
      months,
      rooms,
      statuses,
      roomRevenue,
      tableRevenue,
    }
  }, [bookings])

  const maxRoom = Math.max(1, ...report.rooms.map((r) => r.revenue))
  const channelTotal = Math.max(1, report.online + report.walkIn)

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Revenue, channel mix and room performance across the last 100 bookings."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Collected revenue" value={inr(report.revenue, true)}
              icon={Wallet} accent="emerald" sub="paid bookings only"
            />
            <StatCard
              label="Outstanding" value={inr(report.outstanding, true)}
              icon={TrendingUp} accent={report.outstanding > 0 ? 'rose' : 'slate'}
              sub="unpaid, not yet cancelled"
            />
            <StatCard
              label="Active bookings" value={report.totalBookings}
              icon={CalendarCheck} accent="blue" sub="excluding cancellations"
            />
            <StatCard
              label="Average booking value" value={inr(report.avgValue)}
              icon={Percent} accent="violet"
            />
          </>
        )}
      </div>

      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* ---- channel split ---- */}
        <Panel>
          <PanelHeader title="Channel mix" description="Online vs front desk" />
          <div className="space-y-5 p-5">
            {loading ? (
              <TableSkeleton rows={2} cols={2} />
            ) : (
              <>
                <ChannelRow
                  icon={Globe} label="Online" tone="bg-sky-500"
                  count={report.online} total={channelTotal} revenue={report.onlineRevenue}
                />
                <ChannelRow
                  icon={Store} label="Walk-in" tone="bg-amber-500"
                  count={report.walkIn} total={channelTotal} revenue={report.walkInRevenue}
                />

                <div className="border-t border-border/70 pt-4">
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">
                    Booking status
                  </p>
                  <ul className="space-y-1.5">
                    {report.statuses.map((s) => (
                      <li key={s.status} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {s.status.replace('_', ' ').toLowerCase()}
                        </span>
                        <span className="font-medium tabular-nums">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </Panel>

        {/* ---- revenue + channel trend ---- */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Revenue by month"
            description="Collected payments, by stay month"
          />
          <div className="p-5">
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : report.months.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No collected revenue yet"
                description="Once bookings are marked paid they'll appear here."
              />
            ) : (
              <RevenueTrendChart data={report.months} />
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Bookings by channel"
            description="Website vs front desk, month by month"
          />
          <div className="space-y-4 p-5">
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : report.months.length === 0 ? (
              <EmptyState icon={BarChart3} title="No bookings yet" />
            ) : (
              <>
                <ChartLegend
                  items={[
                    { label: 'Online', color: SERIES.one },
                    { label: 'Walk-in', color: SERIES.two },
                  ]}
                />
                <ChannelTrendChart data={report.months} />
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Where revenue comes from" description="Rooms vs restaurant" />
          <div className="p-5">
            {loading ? (
              <TableSkeleton rows={2} cols={2} />
            ) : report.roomRevenue + report.tableRevenue === 0 ? (
              <EmptyState icon={BarChart3} title="No collected revenue yet" />
            ) : (
              <SplitMeter
                segments={[
                  { label: 'Rooms', value: report.roomRevenue, color: SERIES.one },
                  { label: 'Restaurant tables', value: report.tableRevenue, color: SERIES.two },
                ]}
                format={(v) => inr(v)}
              />
            )}
          </div>
        </Panel>
      </div>

      {/* ---- room performance ---- */}
      <Panel className="mt-5 overflow-hidden">
        <PanelHeader title="Room performance" description="Ranked by total booking value" />
        {!loading && report.rooms.length > 0 && (
          <div className="border-b border-border/70 p-5">
            <RankedBarChart
              data={report.rooms.slice(0, 6).map((r) => ({ name: r.name, value: r.revenue }))}
              format={(v) => inr(v)}
              height={Math.max(140, Math.min(report.rooms.length, 6) * 42)}
            />
          </div>
        )}
        {loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : report.rooms.length === 0 ? (
          <EmptyState icon={BarChart3} title="No room bookings yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {['Room', 'Bookings', 'Revenue', 'Share'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                        i === 0 ? 'text-left' : i === 3 ? 'text-left' : 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {report.rooms.map((r) => (
                  <tr key={r.name} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {r.count}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {inr(r.revenue)}
                    </td>
                    <td className="w-40 px-4 py-3">
                      <MiniBar value={r.revenue} max={maxRoom} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function ChannelRow({
  icon: Icon, label, tone, count, total, revenue,
}: {
  icon: React.ElementType
  label: string
  tone: string
  count: number
  total: number
  revenue: number
}) {
  const pct = Math.round((count / total) * 100)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {inr(revenue)} collected
      </p>
    </div>
  )
}
