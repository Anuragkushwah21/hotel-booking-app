import { describe, expect, it } from 'vitest'
import { quoteStay, quoteTableOnly, roomNightGstPercent, type PricingSettings } from '@/lib/pricing'
import { EMPTY_CALENDAR } from '@/lib/settings'

const base: PricingSettings = {
  advancePercent: 50,
  weekendDays: [5, 6],
  premiumPaymentRule: 'FULL',
  sameDayFullPayment: true,
  longStayEnabled: true,
  longStayMinNights: 3,
  gstPercent: 12,
  tablePricePerGuest: 500,
  taxMode: 'FLAT',
  roomGstThreshold: 7500,
  roomGstLowPercent: 5,
  roomGstHighPercent: 18,
  tableGstPercent: 5,
  addOnGstPercent: 18,
}
const room = { price: 4000, weekendPrice: 5000, peakPrice: null, eventPrice: null }
// Monday 2026-11-02 (IST), booked well in advance.
const checkIn = new Date('2026-11-02T00:00:00Z')
const now = new Date('2026-10-01T06:00:00Z')

describe('quoteStay', () => {
  it('FLAT: taxes the whole subtotal at one rate and takes the advance', () => {
    const q = quoteStay({ room, checkIn, nights: 2, addOnsAmount: 0, settings: base, calendar: EMPTY_CALENDAR, now })
    expect(q.roomAmount).toBe(8000)
    expect(q.taxAmount).toBe(960)
    expect(q.total).toBe(8960)
    expect(q.rule).toBe('STANDARD_ADVANCE')
    expect(q.dueNow).toBe(4480)
    expect(q.gstLabel).toBe('GST (12%)')
  })

  it('weekend nights use the weekend rate and require full payment', () => {
    // Friday + Saturday
    const fri = new Date('2026-11-06T00:00:00Z')
    const q = quoteStay({ room, checkIn: fri, nights: 2, addOnsAmount: 0, settings: base, calendar: EMPTY_CALENDAR, now })
    expect(q.nights.map((n) => n.kind)).toEqual(['WEEKEND', 'WEEKEND'])
    expect(q.roomAmount).toBe(10000)
    expect(q.rule).toBe('PREMIUM_FULL')
    expect(q.dueNow).toBe(q.total)
  })

  it('same-day check-in is paid in full', () => {
    const q = quoteStay({
      room, checkIn, nights: 1, addOnsAmount: 0, settings: base, calendar: EMPTY_CALENDAR,
      now: new Date('2026-11-02T04:00:00Z'),
    })
    expect(q.rule).toBe('SAME_DAY_FULL')
    expect(q.dueNow).toBe(q.total)
  })

  it('INDIA_SLABS: each night is taxed by its own tariff slab; table and add-ons at their own rates', () => {
    const s = { ...base, taxMode: 'INDIA_SLABS' as const }
    const premium = { price: 9000, weekendPrice: null, peakPrice: null, eventPrice: null }
    const q = quoteStay({
      room: premium, checkIn, nights: 1, addOnsAmount: 1000,
      table: { guests: 2, amount: 1000 }, settings: s, calendar: EMPTY_CALENDAR, now,
    })
    expect(q.taxBreakdown).toEqual({ room: 1620, table: 50, addOns: 180 })
    expect(q.taxAmount).toBe(1850)
    expect(q.total).toBe(9000 + 1000 + 1000 + 1850)
    expect(q.gstLabel).toBe('GST')
  })

  it('slab boundary: tariff equal to the threshold takes the low rate', () => {
    const s = { ...base, taxMode: 'INDIA_SLABS' as const }
    expect(roomNightGstPercent(7500, s)).toBe(5)
    expect(roomNightGstPercent(7501, s)).toBe(18)
    expect(roomNightGstPercent(9999, base)).toBe(12)
  })
})

describe('quoteTableOnly', () => {
  it('is always paid in full', () => {
    const q = quoteTableOnly(4, 0, base)
    expect(q.tableAmount).toBe(2000)
    expect(q.dueNow).toBe(q.total)
    expect(q.rule).toBe('TABLE_FULL')
  })
})
