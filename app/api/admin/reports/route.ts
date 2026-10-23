import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { buildReport, rangeFromParams } from '@/lib/admin-stats'

/**
 * GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD — aggregates computed in
 * the database layer over the whole range (ADMIN). Defaults to the last 30 days.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { from, to } = rangeFromParams(req.nextUrl.searchParams)
    return NextResponse.json(await buildReport(from, to))
  } catch (error) {
    console.error('[admin/reports] GET error:', error)
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 })
  }
}
