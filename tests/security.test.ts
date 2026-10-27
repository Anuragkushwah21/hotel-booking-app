import { describe, expect, it } from 'vitest'
import { escapeHtml, maskEmail, randomDigits, safeEqual } from '@/lib/security'
import { transfersForBooking } from '@/lib/transfers'

describe('security helpers', () => {
  it('randomDigits is fixed-length numeric', () => {
    for (let i = 0; i < 200; i++) expect(randomDigits(6)).toMatch(/^\d{6}$/)
  })
  it('masks emails', () => {
    expect(maskEmail('rahul@gmail.com')).toBe('ra***@gmail.com')
    expect(maskEmail('ab@x.in')).toBe('a***@x.in')
  })
  it('escapes HTML for email templates', () => {
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;')
  })
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('transfersForBooking', () => {
  const leg = { mode: 'FLIGHT' as const, number: '6E 201', at: '2026-11-02T10:00:00+05:30', location: 'JAI T2', passengers: 2, notes: null }
  it('keeps only legs that were paid for', () => {
    const t = transfersForBooking(['AIRPORT_PICKUP'], { pickup: leg, drop: leg })
    expect(t?.pickup?.status).toBe('REQUESTED')
    expect(t?.drop).toBeUndefined()
  })
  it('returns null when no transfer add-on was booked', () => {
    expect(transfersForBooking(['BREAKFAST'], { pickup: leg })).toBeNull()
  })
})
