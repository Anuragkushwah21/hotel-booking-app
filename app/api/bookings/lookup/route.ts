import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeBookingRef } from '@/lib/booking-reference'
import { getHotelSettings } from '@/lib/settings'
import { guestBookingInclude, toGuestBookingView } from '@/lib/booking-view'

/**
 * POST /api/bookings/lookup  { query }
 *
 * Guests without an account can look up a booking using one of: booking
 * number, email address, or mobile number. Email/phone can belong to more
 * than one booking, so those searches return a list rather than silently
 * picking an arbitrary stay.
 */

const GENERIC_MISS = "We couldn't find any bookings with those details. Please check and try again."

// Per-instance throttle. Serverless spreads requests across instances so this
// is a speed bump, not a guarantee — put a real limiter at the edge if abuse shows up.
const ATTEMPT_WINDOW_MS = 60_000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)

  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return false
  }

  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

function phoneCandidates(value: string): string[] {
  const digits = value.replace(/\D/g, '')
  return [...new Set([value, value.replace(/[\s-]/g, ''), digits, digits ? `+${digits}` : ''])].filter(Boolean)
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a minute and try again.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    // Keep the old payload fields as a fallback for old links/forms.
    const query = typeof body?.query === 'string'
      ? body.query.trim()
      : typeof body?.bookingId === 'string'
        ? body.bookingId.trim()
        : ''

    if (!query) {
      return NextResponse.json(
        { error: 'Enter a booking number, email address, or mobile number.' },
        { status: 400 },
      )
    }

    const reference = normalizeBookingRef(query)
    const email = query.toLowerCase()
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    const phones = phoneCandidates(query)
    const looksLikePhone = phones.some((phone) => phone.replace(/\D/g, '').length >= 7)

    const where: Prisma.BookingWhereInput = reference
      ? { reference }
      : looksLikeEmail
        ? {
            OR: [
              { guestEmail: { equals: email, mode: 'insensitive' as const } },
              { user: { is: { email: { equals: email, mode: 'insensitive' as const } } } },
            ],
          }
        : looksLikePhone
          ? {
              OR: [
                { guestPhone: { in: phones } },
                { user: { is: { phone: { in: phones } } } },
              ],
            }
          : { id: query }

    const bookings = await prisma.booking.findMany({
      where,
      include: guestBookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    if (bookings.length === 0) {
      return NextResponse.json({ error: GENERIC_MISS }, { status: 404 })
    }

    const settings = await getHotelSettings()
    const views = bookings.map((booking) => {
      const { guestEmail: _email, ...view } = toGuestBookingView(booking, settings)
      return { ...view, baseAmount: booking.baseAmount }
    })

    return NextResponse.json({ success: true, bookings: views, booking: views[0] })
  } catch (error) {
    console.error('[bookings/lookup] POST error:', error)
    return NextResponse.json({ error: 'Failed to look up booking' }, { status: 500 })
  }
}
