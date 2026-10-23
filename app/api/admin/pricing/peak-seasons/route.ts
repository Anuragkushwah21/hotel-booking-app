import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson, peakSeasonSchema } from '@/lib/validation'

/** @db.Date columns: store the calendar date at UTC midnight. */
const day = (key: string) => new Date(`${key.slice(0, 10)}T00:00:00Z`)

/** GET /api/admin/pricing/peak-seasons — every peak season (ADMIN). */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const items = await prisma.peakSeason.findMany({ orderBy: { startDate: 'asc' } })
  return NextResponse.json({ items })
}

/** POST /api/admin/pricing/peak-seasons — add a peak season. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, peakSeasonSchema)
  if (!parsed.ok) return parsed.response
  const d = parsed.data

  try {
    const item = await prisma.peakSeason.create({ data: { name: d.name, startDate: day(d.startDate), endDate: day(d.endDate), active: d.active } })
    await logManagerAction(auth.user.id, 'UPDATE_SETTINGS', {
      metadata: { action: 'create', entity: 'peakSeason', item },
    })
    return NextResponse.json({ item, message: 'Saved' }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'That date is already listed' }, { status: 409 })
    }
    console.error('[admin/pricing/peak-seasons] POST error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
