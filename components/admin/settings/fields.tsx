'use client'

/**
 * Small form primitives shared by the settings and pricing screens: a labelled
 * field with an inline error, a switch, and a numeric input with a unit suffix.
 */

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[11px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Number input with an optional trailing unit ("%", "hrs", "₹"). */
export function NumberInput({
  id,
  value,
  onChange,
  unit,
  prefix,
  min,
  max,
  placeholder,
  invalid,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  unit?: string
  prefix?: string
  min?: number
  max?: number
  placeholder?: string
  invalid?: boolean
  className?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <div className={cn('relative', className)}>
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-9 tabular-nums', prefix && 'pl-7', unit && 'pr-12')}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border border-transparent transition-colors',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/** A full-width row: title + description on the left, a switch on the right. */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  title: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        )}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
