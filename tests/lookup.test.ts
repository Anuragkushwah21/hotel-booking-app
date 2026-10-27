import { describe, expect, it } from 'vitest'
import { parseLookupQuery, phoneCandidates } from '@/lib/booking-lookup'
import { normalizeBookingRef } from '@/lib/booking-reference'

describe('booking lookup parsing', () => {
  it('normalises booking references however they are typed', () => {
    expect(normalizeBookingRef('hb 7k4m2q')).toBe('HB-7K4M2Q')
    expect(normalizeBookingRef('7K4M2Q')).toBe('HB-7K4M2Q')
    expect(normalizeBookingRef('HB-7K4M2O')).toBeNull() // O is not in the alphabet
  })
  it('binds each OTP to a stable subject', () => {
    expect(parseLookupQuery('hb-7k4m2q')?.subject).toBe('ref:HB-7K4M2Q')
    expect(parseLookupQuery(' Guest@Example.com ')?.subject).toBe('email:guest@example.com')
    expect(parseLookupQuery('+91 98290 00000')?.subject).toBe('phone:9829000000')
    expect(parseLookupQuery('98290-00000')?.subject).toBe('phone:9829000000')
  })
  it('rejects input that cannot be a lookup', () => {
    expect(parseLookupQuery('')).toBeNull()
    expect(parseLookupQuery('hello world')).toBeNull()
  })
  it('matches Indian numbers stored in any common format', () => {
    const c = phoneCandidates('9829000000')
    expect(c).toEqual(expect.arrayContaining(['9829000000', '+919829000000', '919829000000', '+91 9829000000']))
  })
})
