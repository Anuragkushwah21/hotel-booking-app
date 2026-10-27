/**
 * Fixed-window rate limiting backed by the RateLimit table.
 *
 * An in-memory Map (what the lookup route used before) resets on every cold
 * start and isn't shared between serverless instances, so it limits nothing in
 * production. One atomic upsert per check keeps the counter in Postgres
 * instead.
 *
 *   const rl = await rateLimit(`login:ip:${ip}`, 10, 15 * 60)
 *   if (!rl.ok) return tooManyRequests(rl)
 */

import { NextResponse } from 'next/server'
import { prisma } from './prisma'

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number }

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = new Date()
  const resetAt = new Date(now.getTime() + windowSeconds * 1000)
  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"
    `
    const row = rows[0]
    const count = Number(row.count)
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000)),
    }
  } catch (error) {
    // Fail open: a limiter outage must not take login and booking down with it.
    console.error('[rate-limit] check failed:', (error as Error).message)
    return { ok: true, remaining: limit, retryAfterSeconds: 0 }
  }
}

/** Run several limits (e.g. per IP and per email); the first one tripped wins. */
export async function rateLimitAll(
  checks: { key: string; limit: number; windowSeconds: number }[],
): Promise<RateLimitResult> {
  let last: RateLimitResult = { ok: true, remaining: Infinity, retryAfterSeconds: 0 }
  for (const c of checks) {
    const r = await rateLimit(c.key, c.limit, c.windowSeconds)
    if (!r.ok) return r
    last = r
  }
  return last
}

export function tooManyRequests(rl: RateLimitResult, message = 'Too many attempts. Please wait and try again.') {
  return NextResponse.json(
    { error: message, retryAfterSeconds: rl.retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
  )
}

/** Housekeeping for the cron job. */
export async function purgeExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  return count
}
