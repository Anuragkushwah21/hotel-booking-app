'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Wallet, BedDouble, IndianRupee, Gauge, CalendarCheck, CalendarX, UserX,
  Sparkles, BarChart3, Download, Globe, Store, RefreshCw,
} from 'lucide-react'
import type { Report } from '@/lib/admin-stats'
import { Button } from '@/components/ui/button'
import {
  PageHeader, Panel, PanelHeader, StatCard, StatCardSkeleton,
  EmptyState, ErrorState, TableSkeleton, MiniBar, inr,
} from '@/components/admin/ui'
import {
  ChannelTrendChart, ChartLegend, RankedBarChart, RevenueTrendChart, SERIES, SplitMeter,
} from '@/components/admin/charts'
import { cn } from '@/lib/utils'
import { DateRangePicker, lastNDays, type Range } from './date-range-picker'
import { OccupancyChart } from './occupancy-chart'

type Grain = 'daily' | 'weekly' | 'monthly'

const dayCount = (r: Range) =>
  Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86400000) + 1

const grainFor = (r: Range): Grain => {
  const n = dayCount(r)
  return n <= 31 ? 'daily' : n <= 120 ? 'weekly' : 'monthly'
}

const fmtRange = (r: Range) => {
  const f = (k: string) =>
    new Date(`${k}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  return `${f(r.from)} – ${f(r.to)}`
}

const SOURCE_META = {
  ONLINE: { label: 'Online', icon: Globe, color: SERIES.one },
  WALK_IN: { label: 'Walk-in', icon: Store, color: SERIES.two },
} as const

export function AnalyticsView() {
  const [range, setRange] = useState<Range>(() => lastNDays(30))
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (r: Range) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/reports?from=${r.from}&to=${r.to}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load report')
      setReport(data as Report)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(range)
  }, [range, load])

  // The server clamps ranges (max 366 days); show what it actually used.
  const shown: Range = report ? { from: report.from, to: report.to } : range
  const grain = grainFor(shown)
  const grainLabel = { daily: 'per day', weekly: 'per week', monthly: 'per month' }[grain]
  const exportQs = `from=${shown.from}&to=${shown.to}`

  const k = report?.kpis
  const t = report?.totals
  const revenueSeries = report
    ? (report.revenueSeries?.[grain] ?? report.revenue).map((p) => ({ month: p.label, revenue: p.collected }))
    : []
  const channelSeries = report
    ? report.bookings[grain].map((p) => ({ month: p.label, online: p.online, walkIn: p.walkIn }))
    : []
  const hasRevenue = revenueSeries.some((p) => p.revenue > 0)
  const hasBookings = channelSeries.some((p) => p.online + p.walkIn > 0)
  const sources = report?.sources ?? []
  const maxAddOn = Math.max(1, ...(report?.addOns ?? []).map((a) => a.bookings))

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Revenue, occupancy and channel performance · ${fmtRange(shown)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={`/api/admin/reports/export?${exportQs}&kind=summary`}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Summary CSV
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/admin/reports/export?${exportQs}`}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Bookings CSV
              </a>
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <Button
          size="sm" variant="ghost" className="h-8 text-muted-foreground"
          onClick={() => load(range)} disabled={loading}
        >
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {/* ---- headline KPIs ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !k || !t ? (
          Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Net revenue" value={inr(t.net, true)} icon={Wallet} accent="emerald"
              sub={`${inr(t.collected)} collected · ${inr(t.refunded)} refunded`}
            />
            <StatCard
              label="Occupancy" value={`${k.occupancy}%`} icon={Gauge} accent="blue"
              sub={`${k.roomNightsSold} of ${k.availableRoomNights} room-nights${k.blockedRoomNights ? ` · ${k.blockedRoomNights} blocked` : ''}`}
            />
            <StatCard
              label="ADR" value={inr(k.adr)} icon={IndianRupee} accent="violet"
              sub="room revenue ÷ room-nights sold"
            />
            <StatCard
              label="RevPAR" value={inr(k.revpar)} icon={BedDouble} accent="violet"
              sub="room revenue ÷ available room-nights"
            />
            <StatCard
              label="Bookings" value={t.bookings} icon={CalendarCheck} accent="slate"
              sub={`${inr(t.bookedValue, true)} booked value`}
            />
            <StatCard
              label="Cancellations" value={t.cancelled} icon={CalendarX}
              accent={t.cancelled ? 'rose' : 'slate'}
              sub={`${k.cancellationRate}% of bookings made`}
            />
            <StatCard
              label="No-shows" value={k.noShows} icon={UserX}
              accent={k.noShows ? 'amber' : 'slate'}
              sub={`${k.noShowRate}% of ${k.arrivals} arrivals`}
            />
            <StatCard
              label="Add-on revenue" value={inr(k.addOnRevenue, true)} icon={Sparkles} accent="amber"
              sub={`${k.addOnBookings} booking${k.addOnBookings === 1 ? '' : 's'} with add-ons`}
            />
          </>
        )}
      </div>
      {!loading && k && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Room revenue ({inr(k.roomRevenue)}) is the pre-tax room charge of stays, spread over the nights that fall
          in this range. Revenue tiles use the payment ledger; booking counts exclude abandoned online checkouts.
        </p>
      )}

      {/* ---- revenue + occupancy ---- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel className="min-w-0">
          <PanelHeader title="Collected revenue" description={`Payments received, ${grainLabel}`} />
          <div className="p-4 sm:p-5">
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : !hasRevenue ? (
              <EmptyState icon={BarChart3} title="No payments in this range" />
            ) : (
              <RevenueTrendChart data={revenueSeries} />
            )}
          </div>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="Occupancy"
            description={
              report && report.occupancy.length < dayCount(shown)
                ? `Nightly, last ${report.occupancy.length} nights of the range`
                : 'Nightly, rooms in-house ÷ sellable rooms'
            }
          />
          <div className="p-4 sm:p-5">
            {loading || !report ? (
              <TableSkeleton rows={3} cols={3} />
            ) : (
              <OccupancyChart data={report.occupancy} />
            )}
          </div>
        </Panel>
      </div>

      {/* ---- channels ---- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel className="min-w-0 lg:col-span-2">
          <PanelHeader title="Bookings by channel" description={`Website vs front desk, ${grainLabel}`} />
          <div className="space-y-4 p-4 sm:p-5">
            {loading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : !hasBookings ? (
              <EmptyState icon={BarChart3} title="No bookings in this range" />
            ) : (
              <>
                <ChartLegend
                  items={[
                    { label: 'Online', color: SERIES.one },
                    { label: 'Walk-in', color: SERIES.two },
                  ]}
                />
                <ChannelTrendChart data={channelSeries} />
              </>
            )}
          </div>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader title="Revenue by channel" description="Collected, net of refunds" />
          <div className="p-4 sm:p-5">
            {loading ? (
              <TableSkeleton rows={2} cols={2} />
            ) : sources.every((s) => s.collected <= 0) ? (
              <EmptyState icon={BarChart3} title="No payments in this range" />
            ) : (
              <SplitMeter
                segments={sources.map((s) => ({
                  label: SOURCE_META[s.source].label,
                  value: Math.max(0, s.collected),
                  color: SOURCE_META[s.source].color,
                }))}
                format={(v) => inr(v)}
              />
            )}
          </div>
        </Panel>
      </div>

      {/* ---- source table ---- */}
      <Panel className="mt-5 overflow-hidden">
        <PanelHeader title="Source performance" description="Online vs walk-in, side by side" />
        {loading ? (
          <TableSkeleton rows={2} cols={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {['Source', 'Bookings', 'Booked value', 'Collected', 'Room-nights', 'Room revenue', 'ADR', 'Cancelled', 'No-shows'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                        i === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {sources.map((s) => {
                  const meta = SOURCE_META[s.source]
                  const Icon = meta.icon
                  return (
                    <tr key={s.source} className="transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.bookings}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{inr(s.bookedValue)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{inr(s.collected)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.roomNights}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{inr(s.roomRevenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.roomNights ? inr(Math.round(s.roomRevenue / s.roomNights)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.cancelled}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.noShows}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ---- room types, add-ons, statuses ---- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel className="min-w-0 lg:col-span-2">
          <PanelHeader title="Room types" description="Bookings made in range, ranked by count · paid amount" />
          <div className="p-4 sm:p-5">
            {loading || !report ? (
              <TableSkeleton rows={4} cols={2} />
            ) : report.topRoomTypes.length === 0 ? (
              <EmptyState icon={BedDouble} title="No room bookings in this range" />
            ) : (
              <RankedBarChart
                data={report.topRoomTypes.map((r) => ({ name: r.name, value: r.bookings }))}
                format={(v) => `${v} booking${v === 1 ? '' : 's'}`}
                height={Math.max(140, report.topRoomTypes.length * 42)}
              />
            )}
          </div>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader title="Add-ons & status" description="Bookings made in range" />
          <div className="space-y-5 p-4 sm:p-5">
            {loading || !report ? (
              <TableSkeleton rows={4} cols={2} />
            ) : (
              <>
                {report.addOns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No add-ons sold in this range.</p>
                ) : (
                  <ul className="space-y-3">
                    {report.addOns.map((a) => (
                      <li key={a.code}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-foreground">{a.label}</span>
                          <span className="tabular-nums text-muted-foreground">{a.bookings}</span>
                        </div>
                        <MiniBar value={a.bookings} max={maxAddOn} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-border/70 pt-4">
                  <p className="mb-2.5 text-xs font-medium text-muted-foreground">Booking status</p>
                  <ul className="space-y-1.5">
                    {(report.byStatus ?? []).map((s) => (
                      <li key={s.status} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {s.status.replace(/_/g, ' ').toLowerCase()}
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
      </div>
    </div>
  )
}
