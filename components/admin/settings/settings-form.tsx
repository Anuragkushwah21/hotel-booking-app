'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  PageHeader, Panel, PanelHeader, ErrorState, SkeletonBlock,
} from '@/components/admin/ui'
import { Field, NumberInput, SwitchRow } from '@/components/admin/settings/fields'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------------
// Types & conversion
// ------------------------------------------------------------------

type TaxMode = 'FLAT' | 'INDIA_SLABS'
type PremiumRule = 'FULL' | 'FIRST_NIGHT'

/** What GET /api/admin/settings returns under `settings`. */
type Settings = {
  advancePercent: number
  weekendDays: number[]
  premiumPaymentRule: PremiumRule
  sameDayFullPayment: boolean
  longStayEnabled: boolean
  longStayMinNights: number
  gstPercent: number
  tablePricePerGuest: number
  taxMode?: TaxMode
  roomGstThreshold?: number
  roomGstLowPercent?: number
  roomGstHighPercent?: number
  tableGstPercent?: number
  addOnGstPercent?: number
  legalName?: string | null
  gstin?: string | null
  restaurantOpenTime?: string
  restaurantLastSeating?: string
  earlyCancelHours: number
  earlyRefundPercent: number
  lateCancelHours: number
  lateRefundPercent: number
  updatedAt?: string
}

const NUMBER_FIELDS = [
  'advancePercent', 'longStayMinNights', 'gstPercent', 'tablePricePerGuest',
  'roomGstThreshold', 'roomGstLowPercent', 'roomGstHighPercent', 'tableGstPercent',
  'addOnGstPercent', 'earlyCancelHours', 'earlyRefundPercent', 'lateCancelHours',
  'lateRefundPercent',
] as const
type NumberField = (typeof NUMBER_FIELDS)[number]

type Form = Record<NumberField, string> & {
  weekendDays: number[]
  premiumPaymentRule: PremiumRule
  sameDayFullPayment: boolean
  longStayEnabled: boolean
  taxMode: TaxMode
  legalName: string
  gstin: string
  restaurantOpenTime: string
  restaurantLastSeating: string
}

type FieldKey = keyof Form
type Errors = Partial<Record<FieldKey, string>>

/** Same bounds the API enforces, so most mistakes are caught before a round-trip. */
const RANGES: Record<NumberField, [number, number]> = {
  advancePercent: [0, 100],
  longStayMinNights: [2, 60],
  gstPercent: [0, 28],
  tablePricePerGuest: [0, 100000],
  roomGstThreshold: [0, 1000000],
  roomGstLowPercent: [0, 28],
  roomGstHighPercent: [0, 28],
  tableGstPercent: [0, 28],
  addOnGstPercent: [0, 28],
  earlyCancelHours: [1, 720],
  earlyRefundPercent: [0, 100],
  lateCancelHours: [0, 720],
  lateRefundPercent: [0, 100],
}

const DEFAULTS = {
  taxMode: 'FLAT' as TaxMode,
  roomGstThreshold: 7500,
  roomGstLowPercent: 5,
  roomGstHighPercent: 18,
  tableGstPercent: 5,
  addOnGstPercent: 18,
  restaurantOpenTime: '12:00',
  restaurantLastSeating: '22:00',
}

function toForm(s: Settings): Form {
  const n = (v: number | undefined, d: number) => String(v ?? d)
  return {
    advancePercent: String(s.advancePercent),
    longStayMinNights: String(s.longStayMinNights),
    gstPercent: String(s.gstPercent),
    tablePricePerGuest: String(s.tablePricePerGuest),
    roomGstThreshold: n(s.roomGstThreshold, DEFAULTS.roomGstThreshold),
    roomGstLowPercent: n(s.roomGstLowPercent, DEFAULTS.roomGstLowPercent),
    roomGstHighPercent: n(s.roomGstHighPercent, DEFAULTS.roomGstHighPercent),
    tableGstPercent: n(s.tableGstPercent, DEFAULTS.tableGstPercent),
    addOnGstPercent: n(s.addOnGstPercent, DEFAULTS.addOnGstPercent),
    earlyCancelHours: String(s.earlyCancelHours),
    earlyRefundPercent: String(s.earlyRefundPercent),
    lateCancelHours: String(s.lateCancelHours),
    lateRefundPercent: String(s.lateRefundPercent),
    weekendDays: [...(s.weekendDays ?? [])].sort(),
    premiumPaymentRule: s.premiumPaymentRule,
    sameDayFullPayment: s.sameDayFullPayment,
    longStayEnabled: s.longStayEnabled,
    taxMode: s.taxMode ?? DEFAULTS.taxMode,
    legalName: s.legalName ?? '',
    gstin: s.gstin ?? '',
    restaurantOpenTime: s.restaurantOpenTime ?? DEFAULTS.restaurantOpenTime,
    restaurantLastSeating: s.restaurantLastSeating ?? DEFAULTS.restaurantLastSeating,
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
/** 2-digit state code, 10-char PAN, entity no., 'Z', checksum. */
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

function validate(f: Form): Errors {
  const e: Errors = {}
  for (const k of NUMBER_FIELDS) {
    const raw = f[k].trim()
    const [min, max] = RANGES[k]
    if (raw === '') { e[k] = 'Required'; continue }
    const v = Number(raw)
    if (!Number.isInteger(v)) e[k] = 'Use a whole number'
    else if (v < min || v > max) e[k] = `Must be between ${min} and ${max}`
  }
  if (!e.earlyCancelHours && !e.lateCancelHours && Number(f.earlyCancelHours) < Number(f.lateCancelHours)) {
    e.earlyCancelHours = 'Must be at least as long as the late window'
  }
  if (f.taxMode === 'INDIA_SLABS' && !e.roomGstLowPercent && !e.roomGstHighPercent
    && Number(f.roomGstLowPercent) > Number(f.roomGstHighPercent)) {
    e.roomGstHighPercent = 'Usually at least the lower-slab rate'
  }
  const gstin = f.gstin.trim().toUpperCase()
  if (gstin && gstin.length !== 15) e.gstin = 'A GSTIN is exactly 15 characters'
  else if (gstin && !GSTIN_RE.test(gstin)) e.gstin = 'That does not look like a valid GSTIN'
  if (f.legalName.trim().length > 200) e.legalName = 'Keep it under 200 characters'
  if (!TIME_RE.test(f.restaurantOpenTime)) e.restaurantOpenTime = 'Use an HH:MM time'
  if (!TIME_RE.test(f.restaurantLastSeating)) e.restaurantLastSeating = 'Use an HH:MM time'
  if (!e.restaurantOpenTime && !e.restaurantLastSeating && f.restaurantLastSeating < f.restaurantOpenTime) {
    e.restaurantLastSeating = 'Must be at or after opening time'
  }
  return e
}

function toPayload(f: Form) {
  const nums = Object.fromEntries(NUMBER_FIELDS.map((k) => [k, Number(f[k])]))
  return {
    ...nums,
    weekendDays: [...f.weekendDays].sort(),
    premiumPaymentRule: f.premiumPaymentRule,
    sameDayFullPayment: f.sameDayFullPayment,
    longStayEnabled: f.longStayEnabled,
    taxMode: f.taxMode,
    legalName: f.legalName.trim() || null,
    gstin: f.gstin.trim().toUpperCase() || null,
    restaurantOpenTime: f.restaurantOpenTime,
    restaurantLastSeating: f.restaurantLastSeating,
  }
}

/** Client copy of lib/cancellation#refundPolicyLines (that module is server-only). */
function policyLines(f: Form): string[] | null {
  const early = Number(f.earlyCancelHours)
  const earlyPct = Number(f.earlyRefundPercent)
  const late = Number(f.lateCancelHours)
  const latePct = Number(f.lateRefundPercent)
  if ([early, earlyPct, late, latePct].some((v) => !Number.isFinite(v)) ||
    [f.earlyCancelHours, f.earlyRefundPercent, f.lateCancelHours, f.lateRefundPercent].some((v) => v.trim() === '')) {
    return null
  }
  const lines: string[] = []
  if (earlyPct === latePct) {
    lines.push(`Cancel at least ${late} hours before check-in for a ${latePct}% refund of the amount paid.`)
  } else {
    lines.push(
      `Cancel at least ${early} hours before check-in for a ${earlyPct}% refund of the amount paid.`,
      `Cancel ${late}–${early} hours before check-in for a ${latePct}% refund.`,
    )
  }
  lines.push(`Cancellations within ${late} hours of check-in, and no-shows, are not refunded.`)
  return lines
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Which section each field lives in, so a server-side error can scroll to it. */
const FIELD_ID = (k: string) => `setting-${k}`

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function SettingsForm() {
  const { toast } = useToast()
  const [initial, setInitial] = useState<Form | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load settings')
      const f = toForm(data.settings)
      setInitial(f)
      setForm(f)
      setUpdatedAt(data.settings?.updatedAt ?? null)
      setErrors({})
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const dirty = useMemo(
    () => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  // Warn before navigating away with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const set = <K extends FieldKey>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
  }

  const focusField = (k: string) => {
    const el = document.getElementById(FIELD_ID(k))
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      ;(el as HTMLElement).focus?.({ preventScroll: true })
    }
  }

  const save = async () => {
    if (!form) return
    const v = validate(form)
    if (Object.keys(v).length) {
      setErrors(v)
      focusField(Object.keys(v)[0])
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const field = typeof data.field === 'string' ? data.field.split('.')[0] : ''
        if (res.status === 400 && field && field in form) {
          setErrors({ [field]: data.error || 'Invalid value' } as Errors)
          focusField(field)
        } else if (res.status === 400 && /early window/i.test(data.error ?? '')) {
          setErrors({ earlyCancelHours: data.error })
          focusField('earlyCancelHours')
        }
        throw new Error(data.error || 'Failed to save settings')
      }
      const f = toForm(data.settings)
      setInitial(f)
      setForm(f)
      setUpdatedAt(data.settings?.updatedAt ?? null)
      setErrors({})
      toast({ title: data.message || 'Settings saved', description: 'Changes apply to new bookings.' })
    } catch (err) {
      toast({
        title: 'Could not save settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    if (initial) setForm(initial)
    setErrors({})
  }

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={reset} disabled={!dirty || saving}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        Discard
      </Button>
      <Button size="sm" onClick={save} disabled={!dirty || saving}>
        <Save className="mr-1.5 h-3.5 w-3.5" />
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </>
  )

  return (
    <div className="pb-20 sm:pb-0">
      <PageHeader
        title="Settings"
        description={
          updatedAt
            ? `Payment, tax, restaurant and cancellation rules. Last saved ${new Date(updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`
            : 'Payment, tax, restaurant and cancellation rules.'
        }
        actions={<div className="hidden items-center gap-2 sm:flex">{actions}</div>}
      />

      {loadError && (
        <div className="mb-4 space-y-3">
          <ErrorState message={loadError} />
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Panel key={i} className="p-5">
              <SkeletonBlock className="h-4 w-40" />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <SkeletonBlock className="h-9" />
                <SkeletonBlock className="h-9" />
                <SkeletonBlock className="h-9" />
                <SkeletonBlock className="h-9" />
              </div>
            </Panel>
          ))}
        </div>
      ) : form ? (
        <form
          className="grid gap-6"
          onSubmit={(e) => { e.preventDefault(); save() }}
          noValidate
        >
          {/* -------------------------------------------------- Payments */}
          <Panel>
            <PanelHeader
              title="Payments & advance"
              description="How much a guest pays online when booking a stay."
            />
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Field
                label="Advance for normal stays" htmlFor={FIELD_ID('advancePercent')}
                error={errors.advancePercent}
                hint="Share of the stay total taken online; the rest is paid at the hotel."
              >
                <NumberInput
                  id={FIELD_ID('advancePercent')} unit="%" min={0} max={100}
                  value={form.advancePercent} onChange={(v) => set('advancePercent', v)}
                  invalid={!!errors.advancePercent}
                />
              </Field>

              <Field
                label="Premium-night stays pay" htmlFor={FIELD_ID('premiumPaymentRule')}
                error={errors.premiumPaymentRule}
                hint="Applies when a stay touches a weekend, peak-season or event night."
              >
                <Select
                  value={form.premiumPaymentRule}
                  onValueChange={(v) => set('premiumPaymentRule', v as PremiumRule)}
                >
                  <SelectTrigger id={FIELD_ID('premiumPaymentRule')} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">Full amount up front</SelectItem>
                    <SelectItem value="FIRST_NIGHT">First night up front</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Weekend nights" className="sm:col-span-2"
                error={errors.weekendDays}
                hint="Nights charged at the weekend rate. A 'Fri' night is the night starting Friday."
              >
                <div id={FIELD_ID('weekendDays')} className="flex flex-wrap gap-1.5" role="group" aria-label="Weekend nights">
                  {WEEKDAYS.map((d, i) => {
                    const on = form.weekendDays.includes(i)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set(
                            'weekendDays',
                            on ? form.weekendDays.filter((x) => x !== i) : [...form.weekendDays, i].sort(),
                          )
                        }
                        className={cn(
                          'h-8 min-w-[3rem] rounded-md border px-3 text-xs font-medium transition-colors',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div className="space-y-4 sm:col-span-2">
                <SwitchRow
                  id={FIELD_ID('sameDayFullPayment')}
                  title="Same-day bookings pay in full"
                  description="Check-in today means the whole stay is collected online."
                  checked={form.sameDayFullPayment}
                  onCheckedChange={(v) => set('sameDayFullPayment', v)}
                />
                <SwitchRow
                  id={FIELD_ID('longStayEnabled')}
                  title="Long-stay advance"
                  description="Long stays pay only the first night online instead of the percentage above."
                  checked={form.longStayEnabled}
                  onCheckedChange={(v) => set('longStayEnabled', v)}
                />
              </div>

              {form.longStayEnabled && (
                <Field
                  label="Long stay starts at" htmlFor={FIELD_ID('longStayMinNights')}
                  error={errors.longStayMinNights}
                >
                  <NumberInput
                    id={FIELD_ID('longStayMinNights')} unit="nights" min={2} max={60}
                    value={form.longStayMinNights} onChange={(v) => set('longStayMinNights', v)}
                    invalid={!!errors.longStayMinNights}
                  />
                </Field>
              )}
            </div>
          </Panel>

          {/* -------------------------------------------------- Taxes */}
          <Panel>
            <PanelHeader
              title="Taxes & invoice"
              description="GST applied to new bookings and the details printed on invoices."
            />
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Field label="Tax mode" htmlFor={FIELD_ID('taxMode')} className="sm:col-span-2" error={errors.taxMode}>
                <div id={FIELD_ID('taxMode')} className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tax mode">
                  {([
                    { value: 'FLAT', title: 'Flat rate', body: 'One GST percentage on everything.' },
                    { value: 'INDIA_SLABS', title: 'India GST slabs', body: 'Rooms by tariff slab; restaurant and add-ons at their own rates.' },
                  ] as const).map((o) => {
                    const on = form.taxMode === o.value
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set('taxMode', o.value)}
                        className={cn(
                          'rounded-lg border px-4 py-3 text-left transition-colors',
                          on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <span className="block text-sm font-medium text-foreground">{o.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{o.body}</span>
                      </button>
                    )
                  })}
                </div>
              </Field>

              {form.taxMode === 'FLAT' ? (
                <Field
                  label="GST" htmlFor={FIELD_ID('gstPercent')} error={errors.gstPercent}
                  hint="Use 0 if prices are tax-inclusive or you are not registered."
                >
                  <NumberInput
                    id={FIELD_ID('gstPercent')} unit="%" min={0} max={28}
                    value={form.gstPercent} onChange={(v) => set('gstPercent', v)}
                    invalid={!!errors.gstPercent}
                  />
                </Field>
              ) : (
                <>
                  <Field
                    label="Room tariff threshold" htmlFor={FIELD_ID('roomGstThreshold')}
                    error={errors.roomGstThreshold} className="sm:col-span-2"
                    hint="Per-night tariff that separates the lower and higher room slabs."
                  >
                    <NumberInput
                      id={FIELD_ID('roomGstThreshold')} prefix="₹" unit="/night" min={0}
                      value={form.roomGstThreshold} onChange={(v) => set('roomGstThreshold', v)}
                      invalid={!!errors.roomGstThreshold} className="sm:max-w-xs"
                    />
                  </Field>
                  <Field
                    label={`Rooms at or below ₹${Number(form.roomGstThreshold || 0).toLocaleString('en-IN')}`}
                    htmlFor={FIELD_ID('roomGstLowPercent')} error={errors.roomGstLowPercent}
                  >
                    <NumberInput
                      id={FIELD_ID('roomGstLowPercent')} unit="%" min={0} max={28}
                      value={form.roomGstLowPercent} onChange={(v) => set('roomGstLowPercent', v)}
                      invalid={!!errors.roomGstLowPercent}
                    />
                  </Field>
                  <Field
                    label={`Rooms above ₹${Number(form.roomGstThreshold || 0).toLocaleString('en-IN')}`}
                    htmlFor={FIELD_ID('roomGstHighPercent')} error={errors.roomGstHighPercent}
                  >
                    <NumberInput
                      id={FIELD_ID('roomGstHighPercent')} unit="%" min={0} max={28}
                      value={form.roomGstHighPercent} onChange={(v) => set('roomGstHighPercent', v)}
                      invalid={!!errors.roomGstHighPercent}
                    />
                  </Field>
                  <Field
                    label="Table reservations" htmlFor={FIELD_ID('tableGstPercent')}
                    error={errors.tableGstPercent}
                  >
                    <NumberInput
                      id={FIELD_ID('tableGstPercent')} unit="%" min={0} max={28}
                      value={form.tableGstPercent} onChange={(v) => set('tableGstPercent', v)}
                      invalid={!!errors.tableGstPercent}
                    />
                  </Field>
                  <Field
                    label="Add-ons" htmlFor={FIELD_ID('addOnGstPercent')}
                    error={errors.addOnGstPercent}
                  >
                    <NumberInput
                      id={FIELD_ID('addOnGstPercent')} unit="%" min={0} max={28}
                      value={form.addOnGstPercent} onChange={(v) => set('addOnGstPercent', v)}
                      invalid={!!errors.addOnGstPercent}
                    />
                  </Field>
                </>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 sm:col-span-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  GST rates and slab thresholds change from time to time. Confirm the rates that apply to
                  your property with your CA before saving.
                </span>
              </div>

              <Field
                label="Legal name" htmlFor={FIELD_ID('legalName')} error={errors.legalName}
                hint="Registered business name printed on invoices."
              >
                <Input
                  id={FIELD_ID('legalName')} className="h-9" placeholder="Hotel Pvt. Ltd."
                  value={form.legalName} maxLength={200}
                  aria-invalid={!!errors.legalName || undefined}
                  onChange={(e) => set('legalName', e.target.value)}
                />
              </Field>
              <Field
                label="GSTIN" htmlFor={FIELD_ID('gstin')} error={errors.gstin}
                hint="15 characters, printed on invoices. Leave blank if not registered."
              >
                <Input
                  id={FIELD_ID('gstin')} className="h-9 font-mono uppercase tracking-wide"
                  placeholder="22AAAAA0000A1Z5" maxLength={15} autoCapitalize="characters"
                  value={form.gstin}
                  aria-invalid={!!errors.gstin || undefined}
                  onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/\s/g, ''))}
                />
              </Field>
            </div>
          </Panel>

          {/* -------------------------------------------------- Restaurant */}
          <Panel>
            <PanelHeader
              title="Restaurant"
              description="Table reservation pricing and seating hours (IST)."
            />
            <div className="grid gap-5 p-5 sm:grid-cols-3">
              <Field
                label="Table price per guest" htmlFor={FIELD_ID('tablePricePerGuest')}
                error={errors.tablePricePerGuest}
              >
                <NumberInput
                  id={FIELD_ID('tablePricePerGuest')} prefix="₹" min={0}
                  value={form.tablePricePerGuest} onChange={(v) => set('tablePricePerGuest', v)}
                  invalid={!!errors.tablePricePerGuest}
                />
              </Field>
              <Field
                label="Opens at" htmlFor={FIELD_ID('restaurantOpenTime')}
                error={errors.restaurantOpenTime}
              >
                <Input
                  id={FIELD_ID('restaurantOpenTime')} type="time" className="h-9"
                  value={form.restaurantOpenTime}
                  aria-invalid={!!errors.restaurantOpenTime || undefined}
                  onChange={(e) => set('restaurantOpenTime', e.target.value)}
                />
              </Field>
              <Field
                label="Last seating" htmlFor={FIELD_ID('restaurantLastSeating')}
                error={errors.restaurantLastSeating}
                hint="Latest slot a table can start."
              >
                <Input
                  id={FIELD_ID('restaurantLastSeating')} type="time" className="h-9"
                  value={form.restaurantLastSeating}
                  aria-invalid={!!errors.restaurantLastSeating || undefined}
                  onChange={(e) => set('restaurantLastSeating', e.target.value)}
                />
              </Field>
            </div>
          </Panel>

          {/* -------------------------------------------------- Cancellation */}
          <Panel>
            <PanelHeader
              title="Cancellation & refunds"
              description="Refunds are a percentage of what the guest paid, by how early they cancel."
            />
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Field
                label="Early window" htmlFor={FIELD_ID('earlyCancelHours')}
                error={errors.earlyCancelHours} hint="Hours before check-in."
              >
                <NumberInput
                  id={FIELD_ID('earlyCancelHours')} unit="hrs" min={1} max={720}
                  value={form.earlyCancelHours} onChange={(v) => set('earlyCancelHours', v)}
                  invalid={!!errors.earlyCancelHours}
                />
              </Field>
              <Field
                label="Early refund" htmlFor={FIELD_ID('earlyRefundPercent')}
                error={errors.earlyRefundPercent}
              >
                <NumberInput
                  id={FIELD_ID('earlyRefundPercent')} unit="%" min={0} max={100}
                  value={form.earlyRefundPercent} onChange={(v) => set('earlyRefundPercent', v)}
                  invalid={!!errors.earlyRefundPercent}
                />
              </Field>
              <Field
                label="Late window" htmlFor={FIELD_ID('lateCancelHours')}
                error={errors.lateCancelHours} hint="Hours before check-in. Must not exceed the early window."
              >
                <NumberInput
                  id={FIELD_ID('lateCancelHours')} unit="hrs" min={0} max={720}
                  value={form.lateCancelHours} onChange={(v) => set('lateCancelHours', v)}
                  invalid={!!errors.lateCancelHours}
                />
              </Field>
              <Field
                label="Late refund" htmlFor={FIELD_ID('lateRefundPercent')}
                error={errors.lateRefundPercent}
              >
                <NumberInput
                  id={FIELD_ID('lateRefundPercent')} unit="%" min={0} max={100}
                  value={form.lateRefundPercent} onChange={(v) => set('lateRefundPercent', v)}
                  invalid={!!errors.lateRefundPercent}
                />
              </Field>

              <div className="rounded-lg border border-border/70 bg-muted/40 px-4 py-3 sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Guests will see
                </p>
                {(() => {
                  const lines = policyLines(form)
                  return lines ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground">
                      {lines.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Fill in all four values to preview the policy.</p>
                  )
                })()}
              </div>
            </div>
          </Panel>

          {/* Desktop footer actions */}
          <div className="hidden justify-end gap-2 sm:flex">{actions}</div>
        </form>
      ) : null}

      {/* Phone: sticky save bar */}
      {form && (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:hidden',
            !dirty && 'hidden',
          )}
        >
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
          <div className="flex gap-2">{actions}</div>
        </div>
      )}
    </div>
  )
}
