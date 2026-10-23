import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

const COOKIE_PREFIX = 'booking_access_'
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function secret(): string {
  // DATABASE_URL is always server-only and gives existing installations a
  // stable fallback. Set BOOKING_ACCESS_SECRET explicitly when deploying.
  const value =
    process.env.BOOKING_ACCESS_SECRET ??
    process.env.SESSION_SECRET ??
    process.env.DATABASE_URL

  if (!value) throw new Error('A server secret is required for guest booking access')
  return value
}

function signature(bookingId: string, expiresAt: number): string {
  return createHmac('sha256', secret())
    .update(`booking-access:v1:${bookingId}:${expiresAt}`)
    .digest('base64url')
}

function cookieName(bookingId: string): string {
  return `${COOKIE_PREFIX}${bookingId}`
}

/** Grant this browser access to one anonymous booking, without creating a login session. */
export function grantBookingAccess(response: NextResponse, bookingId: string): void {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
  response.cookies.set({
    name: cookieName(bookingId),
    value: `${expiresAt}.${signature(bookingId, expiresAt)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/** True only when this browser holds the unexpired signed token for this booking. */
export function hasBookingAccess(req: NextRequest, bookingId: string): boolean {
  const value = req.cookies.get(cookieName(bookingId))?.value
  if (!value) return false

  const [expiresRaw, provided] = value.split('.')
  const expiresAt = Number(expiresRaw)
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !provided) {
    return false
  }

  const expected = signature(bookingId, expiresAt)
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}
