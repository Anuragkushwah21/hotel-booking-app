'use client'

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CHART_TOKENS } from '@/components/admin/charts'

const axis = {
  stroke: 'var(--viz-axis)',
  tick: { fill: 'var(--viz-muted)', fontSize: 11 },
  tickLine: false,
}

type Point = { label: string; rate: number; occupied: number; available: number }

function OccTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as Point
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{p.rate}%</span>
        {' · '}
        {p.occupied} of {p.available} rooms
      </p>
    </div>
  )
}

/** Nightly occupancy %, one hue. */
export function OccupancyChart({ data }: { data: Point[] }) {
  return (
    <div className="viz h-56 w-full">
      <style>{CHART_TOKENS}</style>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--viz-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis
            {...axis}
            width={40}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
          />
          <Tooltip cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }} content={<OccTooltip />} />
          <Area
            type="monotone"
            dataKey="rate"
            name="Occupancy"
            stroke="var(--series-3)"
            strokeWidth={2}
            fill="var(--series-3)"
            fillOpacity={0.12}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--series-3)', stroke: 'var(--viz-surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
