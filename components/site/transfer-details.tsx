'use client'

import { PlaneLanding, PlaneTakeoff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Pickup / drop details collected at checkout when the guest adds the
 * AIRPORT_PICKUP and/or AIRPORT_DROP add-on. Sent with the booking as
 * `transfer: { pickup?: TransferLegPayload, drop?: TransferLegPayload }`.
 */

export type TransferMode = 'FLIGHT' | 'TRAIN' | 'OTHER'
export type TransferLegKind = 'pickup' | 'drop'

export type TransferLegForm = {
  mode: TransferMode
  number: string
  /** `datetime-local` value (YYYY-MM-DDTHH:mm), read as hotel time (IST). */
  at: string
  location: string
  passengers: string
  notes: string
}

export type TransferLegPayload = {
  mode: TransferMode
  number: string | null
  at: string
  location: string
  passengers: number
  notes: string | null
}

export type TransferLegErrors = Partial<Record<keyof TransferLegForm, string>>

export const MODE_LABELS: Record<TransferMode, string> = { FLIGHT: 'Flight', TRAIN: 'Train', OTHER: 'Other' }

export function emptyLeg(passengers: number): TransferLegForm {
  return { mode: 'FLIGHT', number: '', at: '', location: '', passengers: String(passengers), notes: '' }
}

/** The hotel runs on IST, so the time the guest types is IST whatever their device says. */
export function legInstant(at: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) return null
  const d = new Date(`${at}:00+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function validateLeg(leg: TransferLegForm, kind: TransferLegKind): TransferLegErrors {
  const errors: TransferLegErrors = {}
  const when = legInstant(leg.at)
  if (!when) errors.at = kind === 'pickup' ? 'Enter your arrival date and time' : 'Enter your departure date and time'
  else if (when.getTime() < Date.now()) errors.at = 'This time is in the past'
  if (leg.location.trim().length < 2) {
    errors.location = kind === 'pickup' ? 'Where should we pick you up?' : 'Where should we drop you?'
  } else if (leg.location.trim().length > 200) errors.location = 'Keep this under 200 characters'
  if (leg.number.trim().length > 20) errors.number = 'Keep this under 20 characters'
  const pax = Number(leg.passengers)
  if (!Number.isInteger(pax) || pax < 1 || pax > 20) errors.passengers = 'Enter 1–20 passengers'
  if (leg.notes.trim().length > 500) errors.notes = 'Notes can be up to 500 characters'
  return errors
}

export function toLegPayload(leg: TransferLegForm): TransferLegPayload {
  return {
    mode: leg.mode,
    number: leg.number.trim() ? leg.number.trim().toUpperCase() : null,
    at: legInstant(leg.at)!.toISOString(),
    location: leg.location.trim(),
    passengers: Number(leg.passengers),
    notes: leg.notes.trim() || null,
  }
}

/** "12 Nov, 2:30 pm" in IST, for summaries. */
export function legWhenLabel(at: string): string {
  const d = legInstant(at)
  if (!d) return ''
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function TransferLegFields({
  kind,
  value,
  errors,
  onChange,
  disabled,
}: {
  kind: TransferLegKind
  value: TransferLegForm
  errors: TransferLegErrors
  onChange: (patch: Partial<TransferLegForm>) => void
  disabled?: boolean
}) {
  const pickup = kind === 'pickup'
  const id = (f: string) => `transfer-${kind}-${f}`
  const Icon = pickup ? PlaneLanding : PlaneTakeoff
  const numberLabel =
    value.mode === 'FLIGHT' ? 'Flight number' : value.mode === 'TRAIN' ? 'Train number' : 'Reference (optional)'
  const numberPlaceholder = value.mode === 'FLIGHT' ? 'e.g. 6E 2131' : value.mode === 'TRAIN' ? 'e.g. 12015' : ''
  const locationPlaceholder =
    value.mode === 'FLIGHT'
      ? 'e.g. Jaipur International Airport, T2'
      : value.mode === 'TRAIN'
        ? 'e.g. Jaipur Junction'
        : 'Full address'

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4" disabled={disabled}>
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {pickup ? 'Pickup details' : 'Drop details'}
      </legend>

      <div role="radiogroup" aria-label={`${pickup ? 'Arriving' : 'Departing'} by`} className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as TransferMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value.mode === m}
            onClick={() => onChange({ mode: m })}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition',
              value.mode === m ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-input hover:border-primary/50',
            )}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id('number')} label={numberLabel} error={errors.number}>
          <Input
            id={id('number')}
            value={value.number}
            onChange={(e) => onChange({ number: e.target.value })}
            placeholder={numberPlaceholder}
            autoCapitalize="characters"
            aria-invalid={!!errors.number}
          />
        </Field>
        <Field id={id('at')} label={pickup ? 'Arrival date & time (IST)' : 'Departure date & time (IST)'} error={errors.at}>
          <Input
            id={id('at')}
            type="datetime-local"
            value={value.at}
            onChange={(e) => onChange({ at: e.target.value })}
            aria-invalid={!!errors.at}
            required
          />
        </Field>
        <Field
          id={id('location')}
          label={pickup ? 'Pickup from' : 'Drop at'}
          error={errors.location}
          className="sm:col-span-2"
        >
          <Input
            id={id('location')}
            value={value.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder={locationPlaceholder}
            aria-invalid={!!errors.location}
            required
          />
        </Field>
        <Field id={id('passengers')} label="Passengers" error={errors.passengers}>
          <Input
            id={id('passengers')}
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={value.passengers}
            onChange={(e) => onChange({ passengers: e.target.value })}
            aria-invalid={!!errors.passengers}
          />
        </Field>
        <Field id={id('notes')} label="Notes (optional)" error={errors.notes} className="sm:col-span-2">
          <Textarea
            id={id('notes')}
            rows={2}
            value={value.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder={pickup ? 'Extra luggage, child seat, wheelchair…' : 'Pickup time from the hotel, luggage…'}
          />
        </Field>
      </div>
    </fieldset>
  )
}

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1 block text-sm">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
