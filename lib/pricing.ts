/**
 * Room / table pricing and the "how much is due now" payment rules.
 *
 * Pure functions: no database access, so the quote endpoint, the booking
 * engine and the payment step all compute the same numbers from the same
 * inputs. Amounts are whole INR.
 *
 * Payment rule precedence (first match wins):
 *   1. Same-day check-in          → 100% (if sameDayFullPayment)
 *   2. Any weekend/peak/event night → premiumPaymentRule: FULL or FIRST_NIGHT
 *   3. Long stay (≥ longStayMinNights) → first night now, balance at check-in
 *   4. Otherwise                   → advancePercent of the total
 * A table leg is always paid in full up front.
 */

import type { HotelSettings } from '@prisma/client'
import { addDaysToKey, dateKey, weekdayOfKey } from './format'
import type { PricingCalendar } from './settings'

export type PricingSettings = Pick<
  HotelSettings,
  | 'advancePercent'
  | 'weekendDays'
  | 'premiumPaymentRule'
  | 'sameDayFullPayment'
  | 'longStayEnabled'
  | 'longStayMinNights'
  | 'gstPercent'
  | 'tablePricePerGuest'
>

export type RoomRates = {
  price: number
  weekendPrice: number | null
  peakPrice: number | null
  eventPrice: number | null
}

export type NightKind = 'NORMAL' | 'WEEKEND' | 'PEAK' | 'EVENT'

export type NightRate = {
  /** YYYY-MM-DD (IST) of the night. */
  date: string
  rate: number
  kind: NightKind
  /** Season or event name, when there is one. */
  label?: string
}

export type PaymentRule =
  | 'SAME_DAY_FULL'
  | 'PREMIUM_FULL'
  | 'PREMIUM_FIRST_NIGHT'
  | 'LONG_STAY_FIRST_NIGHT'
  | 'STANDARD_ADVANCE'
  | 'TABLE_FULL'
  | 'DESK'

export const PAYMENT_RULE_LABELS: Record<PaymentRule | 'LEGACY', string> = {
  SAME_DAY_FULL: 'Same-day booking — full payment',
  PREMIUM_FULL: 'Weekend / peak / event dates — full payment',
  PREMIUM_FIRST_NIGHT: 'Weekend / peak / event dates — first night now',
  LONG_STAY_FIRST_NIGHT: 'Long stay — first night now, balance at check-in',
  STANDARD_ADVANCE: 'Advance payment, balance at check-in',
  TABLE_FULL: 'Table reservation — full payment',
  DESK: 'Settled at the front desk',
  LEGACY: 'Paid in full',
}

export function nightlyRates(
  room: RoomRates,
  checkIn: Date,
  nights: number,
  settings: Pick<PricingSettings, 'weekendDays'>,
  calendar: PricingCalendar,
): NightRate[] {
  const first = dateKey(checkIn)
  const out: NightRate[] = []

  for (let i = 0; i < nights; i++) {
    const date = addDaysToKey(first, i)
    const event = calendar.events.get(date)
    const season = calendar.peakSeasons.find((s) => s.startKey <= date && date <= s.endKey)

    if (event) {
      out.push({ date, kind: 'EVENT', label: event, rate: room.eventPrice ?? room.peakPrice ?? room.price })
    } else if (season) {
      out.push({ date, kind: 'PEAK', label: season.name, rate: room.peakPrice ?? room.price })
    } else if (settings.weekendDays.includes(weekdayOfKey(date))) {
      out.push({ date, kind: 'WEEKEND', rate: room.weekendPrice ?? room.price })
    } else {
      out.push({ date, kind: 'NORMAL', rate: room.price })
    }
  }
  return out
}

export function taxOn(amount: number, gstPercent: number): number {
  return Math.round((amount * gstPercent) / 100)
}

export type TableLine = { guests: number; amount: number }

export function priceTable(guests: number, settings: Pick<PricingSettings, 'tablePricePerGuest'>): TableLine {
  const g = Math.max(1, Math.floor(guests) || 1)
  return { guests: g, amount: g * settings.tablePricePerGuest }
}

export type Quote = {
  nights: NightRate[]
  roomAmount: number
  addOnsAmount: number
  tableAmount: number
  subtotal: number
  taxAmount: number
  total: number
  /** Taken online at booking time. */
  dueNow: number
  /** Collected at check-in. */
  dueLater: number
  rule: PaymentRule
  ruleLabel: string
  gstPercent: number
  hasPremiumNight: boolean
}

export function quoteStay(input: {
  room: RoomRates
  checkIn: Date
  nights: number
  addOnsAmount: number
  table?: TableLine | null
  settings: PricingSettings
  calendar: PricingCalendar
  now?: Date
}): Quote {
  const { settings } = input
  const nights = nightlyRates(input.room, input.checkIn, input.nights, settings, input.calendar)

  const roomAmount = nights.reduce((s, n) => s + n.rate, 0)
  const tableAmount = input.table?.amount ?? 0
  const subtotal = roomAmount + input.addOnsAmount + tableAmount
  const taxAmount = taxOn(subtotal, settings.gstPercent)
  const total = subtotal + taxAmount

  const tableWithTax = tableAmount + taxOn(tableAmount, settings.gstPercent)
  const firstNightWithTax = nights.length
    ? nights[0].rate + taxOn(nights[0].rate, settings.gstPercent)
    : 0

  const hasPremiumNight = nights.some((n) => n.kind !== 'NORMAL')
  const sameDay = dateKey(input.checkIn) === dateKey(input.now ?? new Date())

  let rule: PaymentRule
  let dueNow: number

  if (sameDay && settings.sameDayFullPayment) {
    rule = 'SAME_DAY_FULL'
    dueNow = total
  } else if (hasPremiumNight) {
    if (settings.premiumPaymentRule === 'FIRST_NIGHT') {
      rule = 'PREMIUM_FIRST_NIGHT'
      dueNow = firstNightWithTax + tableWithTax
    } else {
      rule = 'PREMIUM_FULL'
      dueNow = total
    }
  } else if (settings.longStayEnabled && nights.length >= settings.longStayMinNights) {
    rule = 'LONG_STAY_FIRST_NIGHT'
    dueNow = firstNightWithTax + tableWithTax
  } else {
    rule = 'STANDARD_ADVANCE'
    const pct = Math.min(100, Math.max(0, settings.advancePercent))
    // The table leg is never split; only the stay is taken as an advance.
    dueNow = Math.round(((total - tableWithTax) * pct) / 100) + tableWithTax
  }

  dueNow = Math.min(total, Math.max(total > 0 ? 1 : 0, dueNow))

  return {
    nights,
    roomAmount,
    addOnsAmount: input.addOnsAmount,
    tableAmount,
    subtotal,
    taxAmount,
    total,
    dueNow,
    dueLater: total - dueNow,
    rule,
    ruleLabel: PAYMENT_RULE_LABELS[rule],
    gstPercent: settings.gstPercent,
    hasPremiumNight,
  }
}

/** Table-only reservations are paid in full. */
export function quoteTableOnly(
  guests: number,
  addOnsAmount: number,
  settings: PricingSettings,
): Quote {
  const table = priceTable(guests, settings)
  const subtotal = table.amount + addOnsAmount
  const taxAmount = taxOn(subtotal, settings.gstPercent)
  const total = subtotal + taxAmount
  return {
    nights: [],
    roomAmount: 0,
    addOnsAmount,
    tableAmount: table.amount,
    subtotal,
    taxAmount,
    total,
    dueNow: total,
    dueLater: 0,
    rule: 'TABLE_FULL',
    ruleLabel: PAYMENT_RULE_LABELS.TABLE_FULL,
    gstPercent: settings.gstPercent,
    hasPremiumNight: false,
  }
}
