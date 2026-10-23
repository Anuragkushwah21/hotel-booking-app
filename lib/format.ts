/**
 * Formatting and calendar helpers shared by server code, emails and pages.
 *
 * The hotel runs on Indian time no matter where the server is hosted, so every
 * "which day is this?" question goes through `dateKey()` (a YYYY-MM-DD string
 * in IST) rather than `Date#getDate()`, which answers in the host's timezone.
 */

export const HOTEL_TIME_ZONE = 'Asia/Kolkata'

/** Check-in opens at this local time; refund windows count back from it. */
export const CHECK_IN_HOUR = 14

/** ₹1,23,456 — Indian digit grouping, no decimals (amounts are whole rupees). */
export function formatINR(amount: number | null | undefined): string {
  return `₹${Math.round(amount ?? 0).toLocaleString('en-IN')}`
}

const keyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOTEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function dateKey(d: Date | string): string {
  return keyFormatter.format(new Date(d))
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD key. */
export function weekdayOfKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay()
}

export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** UTC instants bounding an IST calendar day: [start, end). */
export function istDayBounds(key: string = dateKey(new Date())): { start: Date; end: Date } {
  const start = new Date(`${key}T00:00:00+05:30`)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

/** When a stay actually starts: check-in hour, IST, on the check-in date. */
export function checkInInstant(checkInDate: Date | string): Date {
  const hh = String(CHECK_IN_HOUR).padStart(2, '0')
  return new Date(`${dateKey(checkInDate)}T${hh}:00:00+05:30`)
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    timeZone: HOTEL_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', {
    timeZone: HOTEL_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
