'use client'

/**
 * Chart primitives for the admin reports.
 *
 * Colour is assigned by the job it does, not by taste:
 *   • revenue over time  → one hue (magnitude/trend), no legend needed
 *   • channel comparison → categorical slots 1–2 (identity), legend + labels
 *   • room ranking       → one hue (magnitude), value labels at the tip
 *
 * The palette is the validated default (blue #2a78d6 / orange #eb6834 /
 * aqua #1baf7a, dark-mode steps alongside): every adjacent pair clears the
 * colour-blindness and normal-vision separation floors on both surfaces. Aqua
 * sits under 3:1 on white, so anything wearing it also carries a visible label.
 * Don't swap these hexes without re-running the palette validator.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export const CHART_TOKENS = `
  .viz {
    --series-1: #2a78d6;
    --series-2: #eb6834;
    --series-3: #1baf7a;
    --viz-surface: #ffffff;
    --viz-grid: #e1e0d9;
    --viz-axis: #c3c2b7;
    --viz-muted: #898781;
    --viz-ink: #0b0b0b;
  }
  .dark .viz {
    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --viz-surface: #171717;
    --viz-grid: #2c2c2a;
    --viz-axis: #383835;
    --viz-muted: #898781;
    --viz-ink: #ffffff;
  }
`

const axis = {
  stroke: 'var(--viz-axis)',
  tick: { fill: 'var(--viz-muted)', fontSize: 11 },
  tickLine: false,
}

const compactInr = (n: number) =>
  n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`

/** Tooltip in text tokens — the swatch carries identity, never the text colour. */
function VizTooltip({
  active, payload, label, format,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  format?: (value: number) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: entry.color }}
            aria-hidden
          />
          {entry.name}
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {format ? format(entry.value) : entry.value.toLocaleString('en-IN')}
          </span>
        </p>
      ))}
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** Trend over time, one series — area wash under a 2px line. */
export function RevenueTrendChart({
  data,
}: {
  data: { month: string; revenue: number }[]
}) {
  return (
    <div className="viz h-64 w-full">
      <style>{CHART_TOKENS}</style>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--viz-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="month" {...axis} />
          <YAxis {...axis} width={56} tickFormatter={compactInr} axisLine={false} />
          <Tooltip
            cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
            content={<VizTooltip format={(v) => `₹${v.toLocaleString('en-IN')}`} />}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Collected"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="var(--series-1)"
            fillOpacity={0.1}
            dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--viz-surface)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'var(--series-1)', stroke: 'var(--viz-surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Two series that must be told apart → categorical slots, side by side with a
 * 2px gap. Grouped rather than stacked: the question is "which channel is
 * bigger this month", which a shared baseline answers and a stack doesn't.
 */
export function ChannelTrendChart({
  data,
}: {
  data: { month: string; online: number; walkIn: number }[]
}) {
  return (
    <div className="viz h-64 w-full">
      <style>{CHART_TOKENS}</style>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barGap={2}>
          <CartesianGrid stroke="var(--viz-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="month" {...axis} />
          <YAxis {...axis} width={32} allowDecimals={false} axisLine={false} />
          <Tooltip cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.4 }} content={<VizTooltip />} />
          <Bar dataKey="online" name="Online" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} />
          <Bar dataKey="walkIn" name="Walk-in" fill="var(--series-2)" maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Ranking by magnitude → one hue, horizontal so long room names stay readable.
 * Values ride the bar tips, which is also the relief for any low-contrast hue.
 */
export function RankedBarChart({
  data,
  format = (v: number) => v.toLocaleString('en-IN'),
  accent = 'var(--series-1)',
  height = 240,
}: {
  data: { name: string; value: number }[]
  format?: (value: number) => string
  accent?: string
  height?: number
}) {
  return (
    <div className="viz w-full" style={{ height }}>
      <style>{CHART_TOKENS}</style>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
          barCategoryGap={8}
        >
          <CartesianGrid stroke="var(--viz-grid)" strokeWidth={1} horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            {...axis}
            width={110}
            axisLine={false}
            interval={0}
          />
          <Tooltip cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.4 }} content={<VizTooltip format={format} />} />
          <Bar dataKey="value" name="Revenue" maxBarSize={24} radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={accent} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number) => format(v)}
              className="fill-foreground"
              style={{ fontSize: 11, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Part-to-whole for two segments. Plain HTML rather than a chart library: it is
 * one bar, and a 2px surface gap between the segments is all the separation the
 * two hues need.
 */
export function SplitMeter({
  segments,
  format,
}: {
  segments: { label: string; value: number; color: string }[]
  format: (value: number) => string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="viz space-y-3">
      <style>{CHART_TOKENS}</style>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: total ? `${Math.max((segment.value / total) * 100, segment.value ? 2 : 0)}%` : '0%',
              background: segment.color,
            }}
            aria-hidden
          />
        ))}
      </div>

      <ul className="space-y-1.5">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ background: segment.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {format(segment.value)}
            </span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">
              {total ? Math.round((segment.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const SERIES = {
  one: 'var(--series-1)',
  two: 'var(--series-2)',
  three: 'var(--series-3)',
}
