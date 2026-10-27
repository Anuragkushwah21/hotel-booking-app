import { describe, expect, it } from 'vitest'
import { quoteRefund } from '@/lib/cancellation'

const policy = { earlyCancelHours: 48, earlyRefundPercent: 80, lateCancelHours: 24, lateRefundPercent: 50 }
// Check-in 10 Nov 2026 → starts 14:00 IST = 08:30Z.
const b = { type: 'ROOM' as const, checkInDate: new Date('2026-11-10T00:00:00Z'), bookingDate: null, paidAmount: 10000 }

describe('quoteRefund', () => {
  it('early cancellation gets the early percentage', () => {
    const r = quoteRefund(b, policy, new Date('2026-11-07T08:30:00Z'))
    expect(r.tier).toBe('EARLY')
    expect(r.amount).toBe(8000)
  })
  it('late window gets the late percentage', () => {
    const r = quoteRefund(b, policy, new Date('2026-11-09T06:00:00Z'))
    expect(r.tier).toBe('LATE')
    expect(r.amount).toBe(5000)
  })
  it('inside the last window refunds nothing', () => {
    const r = quoteRefund(b, policy, new Date('2026-11-10T01:00:00Z'))
    expect(r.amount).toBe(0)
    expect(r.eligible).toBe(false)
  })
  it('nothing paid means nothing to refund', () => {
    expect(quoteRefund({ ...b, paidAmount: 0 }, policy, new Date('2026-11-01T00:00:00Z')).amount).toBe(0)
  })
})
