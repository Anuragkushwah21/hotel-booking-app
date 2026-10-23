import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getHotelSettings } from '@/lib/settings'
import { refundPolicyLines } from '@/lib/cancellation'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson, settingsSchema } from '@/lib/validation'

/** GET /api/admin/settings — pricing & policy configuration (ADMIN). */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const settings = await getHotelSettings()
  return NextResponse.json({ settings, policy: refundPolicyLines(settings) })
}

/** PUT /api/admin/settings — partial update; every field is validated. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, settingsSchema)
  if (!parsed.ok) return parsed.response

  try {
    const before = await getHotelSettings()
    const data = parsed.data
    const merged = { ...before, ...data }
    if (merged.earlyCancelHours < merged.lateCancelHours) {
      return NextResponse.json(
        { error: 'The early window must be at least as long as the late window' },
        { status: 400 },
      )
    }
    if (data.weekendDays) data.weekendDays = [...new Set(data.weekendDays)].sort()

    const settings = await prisma.hotelSettings.update({
      where: { id: 1 },
      data: { ...data, updatedById: auth.user.id },
    })

    const changes = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => JSON.stringify((before as any)[k]) !== JSON.stringify(v)),
    )
    await logManagerAction(auth.user.id, 'UPDATE_SETTINGS', { metadata: { changes } })

    return NextResponse.json({ settings, policy: refundPolicyLines(settings), message: 'Settings saved' })
  } catch (error) {
    console.error('[admin/settings] PUT error:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
