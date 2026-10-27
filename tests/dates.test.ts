import { describe, expect, it } from 'vitest'
import { nightsBetween, startOfDay } from '@/lib/booking-engine'
import { fiscalYear } from '@/lib/invoice'

describe('IST date math', () => {
  it('counts nights on the IST calendar regardless of the time of day', () => {
    // 23:30 IST on 1 Nov → 00:30 IST on 3 Nov is still a two-night stay.
    expect(nightsBetween(new Date('2026-11-01T18:00:00Z'), new Date('2026-11-02T19:00:00Z'))).toBe(2)
    expect(nightsBetween(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-04T00:00:00Z'))).toBe(3)
  })
  it('startOfDay is IST midnight', () => {
    expect(startOfDay(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-01T18:30:00.000Z')
  })
  it('fiscal year runs April–March in IST', () => {
    expect(fiscalYear(new Date('2026-03-31T17:00:00Z'))).toBe('2025-26')
    expect(fiscalYear(new Date('2026-03-31T19:00:00Z'))).toBe('2026-27') // already 1 Apr in IST
    expect(fiscalYear(new Date('2027-01-15T00:00:00Z'))).toBe('2026-27')
  })
})
