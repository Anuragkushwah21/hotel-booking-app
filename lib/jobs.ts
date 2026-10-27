/**
 * Scheduled maintenance, run by /api/cron/maintenance (Vercel Cron — see
 * vercel.json). Every task is idempotent, so running twice is harmless and a
 * missed run just catches up next time.
 */

import { prisma } from './prisma'
import { releaseExpiredHolds } from './booking-engine'
import { dispatchNotifications, sendCheckInReminder } from './notifications'
import { purgeOldOtps } from './otp'
import { purgeExpiredRateLimits } from './rate-limit'
import { addDaysToKey, dateKey } from './format'

/** Notifications that failed (SMTP blip, WhatsApp outage) get retried up to their attempt cap. */
async function retryFailedNotifications(): Promise<number> {
  const stale = await prisma.notificationLog.findMany({
    where: {
      status: { in: ['FAILED', 'PENDING'] },
      attempts: { lt: 3 },
      createdAt: { gt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      // Leave brand-new rows to the request that queued them.
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    select: { id: true },
    take: 100,
  })
  await dispatchNotifications(stale.map((n) => n.id))
  return stale.length
}

/** "See you tomorrow" for stays starting tomorrow (IST), once per booking. */
async function sendCheckInReminders(): Promise<number> {
  const tomorrow = addDaysToKey(dateKey(new Date()), 1)
  const start = new Date(`${tomorrow}T00:00:00Z`)
  const end = new Date(`${addDaysToKey(tomorrow, 1)}T00:00:00Z`)
  const due = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      type: { in: ['ROOM', 'ROOM_TABLE'] },
      checkInDate: { gte: start, lt: end },
      notifications: { none: { event: 'CHECKIN_REMINDER' } },
    },
    select: { id: true },
    take: 200,
  })
  for (const b of due) await sendCheckInReminder(b)
  return due.length
}

export async function runMaintenance() {
  const results: Record<string, number | string> = {}
  const tasks: [string, () => Promise<number>][] = [
    ['releasedHolds', async () => (await releaseExpiredHolds()).released],
    ['retriedNotifications', retryFailedNotifications],
    ['checkInReminders', sendCheckInReminders],
    ['purgedOtps', purgeOldOtps],
    ['purgedRateLimits', purgeExpiredRateLimits],
  ]
  // One failing task must not stop the others.
  for (const [name, task] of tasks) {
    try {
      results[name] = await task()
    } catch (error) {
      console.error(`[jobs] ${name} failed:`, error)
      results[name] = `error: ${(error as Error).message}`
    }
  }
  return results
}
