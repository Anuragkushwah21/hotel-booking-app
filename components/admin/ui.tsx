/**
 * Shared building blocks for the dashboard.
 *
 * Every admin page composes these so spacing, type scale, borders and empty
 * states stay identical across screens — the thing that actually makes an
 * admin area read as "professional" rather than each page inventing its own.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

/** Whole-rupee formatter. Compact form for tight stat tiles. */
export function inr(value: number | null | undefined, compact = false): string {
  // A missing field must render as ₹0, not take the whole page down.
  const n = Number.isFinite(value) ? (value as number) : 0
  if (compact && Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (compact && Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`
  return `₹${n.toLocaleString('en-IN')}`
}

// ------------------------------------------------------------------
// Page scaffolding
// ------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Standard surface. One border, one shadow — used everywhere. */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/70 bg-card shadow-sm shadow-black/[0.02]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

// ------------------------------------------------------------------
// Metrics
// ------------------------------------------------------------------

const ACCENTS = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
} as const

export type Accent = keyof typeof ACCENTS

/**
 * One metric. Deliberately restrained: the number carries the emphasis, the
 * icon is a quiet tint rather than a filled block.
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'slate',
  footer,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ElementType
  accent?: Accent
  footer?: React.ReactNode
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <span className={cn('rounded-lg p-1.5', ACCENTS[accent])}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {footer && <div className="mt-3 border-t border-border/70 pt-3">{footer}</div>}
    </Panel>
  )
}

/** Thin proportion bar, used for occupancy and channel splits. */
export function MiniBar({
  value,
  max = 100,
  className,
}: {
  value: number
  max?: number
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ------------------------------------------------------------------
// States
// ------------------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="mb-1 rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </div>
  )
}

/** Skeletons instead of spinners — the page keeps its shape while loading. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

export function StatCardSkeleton() {
  return (
    <Panel className="p-5">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-4 h-7 w-20" />
      <SkeletonBlock className="mt-2 h-3 w-32" />
    </Panel>
  )
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border/70">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={c}
              className={cn('h-4', c === 0 ? 'w-40' : c === cols - 1 ? 'ml-auto w-16' : 'w-24')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
