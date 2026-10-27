/**
 * Small crypto helpers shared by sessions, OTPs, reset links and guest
 * booking access. Everything secret-bearing goes through `serverSecret()`, so
 * there is one place that decides what key the app signs with.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'

let warnedAboutSecret = false

/**
 * The server-side signing key. Production refuses to start signing without an
 * explicit secret; development falls back to a key derived from DATABASE_URL
 * (with a warning) so a fresh checkout still runs.
 */
export function serverSecret(): string {
  const explicit = process.env.BOOKING_ACCESS_SECRET || process.env.SESSION_SECRET
  if (explicit && explicit.length >= 32) return explicit

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set SESSION_SECRET (or BOOKING_ACCESS_SECRET) to a random value of at least 32 characters')
  }
  if (!warnedAboutSecret) {
    warnedAboutSecret = true
    console.warn('[security] SESSION_SECRET is not set; using a development-only fallback key')
  }
  return createHash('sha256').update(`dev-fallback:${process.env.DATABASE_URL ?? 'local'}`).digest('hex')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmac(value: string): string {
  return createHmac('sha256', serverSecret()).update(value).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Uniformly random numeric code, e.g. "042917". */
export function randomDigits(length = 6): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0')
}

/** Best-effort client IP behind Vercel / a reverse proxy. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** ra****@gmail.com — enough for a guest to recognise their own address. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return '****'
  const visible = user.slice(0, Math.min(2, Math.max(1, user.length - 1)))
  return `${visible}${'*'.repeat(Math.max(3, user.length - visible.length))}@${domain}`
}

/** Escape text interpolated into email HTML. */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
