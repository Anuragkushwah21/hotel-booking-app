import { NextRequest, NextResponse } from 'next/server'
import { runMaintenance } from '@/lib/jobs'
import { safeEqual } from '@/lib/security'

/**
 * GET /api/cron/maintenance — scheduled by vercel.json.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET
 * set the route refuses to run, so it can't be triggered by anyone else.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization') ?? ''
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await runMaintenance()
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results })
}
