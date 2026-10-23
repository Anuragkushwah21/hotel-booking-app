import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logManagerAction } from '@/lib/manager-log'
import { parseJson, specialDateSchema } from '@/lib/validation'

type Ctx = { params: Promise<{ id: string }> }

const day = (key: string) => new Date(`${key.slice(0, 10)}T00:00:00Z`)

/** PATCH — replace a event date (send the full object; toggling `active` included). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const parsed = await parseJson(req, specialDateSchema)
  if (!parsed.ok) return parsed.response
  const d = parsed.data

  try {
    const { id } = await params
    const item = await prisma.specialDate.update({ where: { id }, data: { name: d.name, date: day(d.date), active: d.active } })
    await logManagerAction(auth.user.id, 'UPDATE_SETTINGS', {
      metadata: { action: 'update', entity: 'specialDate', item },
    })
    return NextResponse.json({ item, message: 'Saved' })
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (error?.code === 'P2002') return NextResponse.json({ error: 'That date is already listed' }, { status: 409 })
    console.error('[admin/pricing/special-dates/id] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

/** DELETE — remove a event date. Existing bookings keep the price they were quoted. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const item = await prisma.specialDate.delete({ where: { id } })
    await logManagerAction(auth.user.id, 'UPDATE_SETTINGS', {
      metadata: { action: 'delete', entity: 'specialDate', item },
    })
    return NextResponse.json({ message: 'Deleted' })
  } catch (error: any) {
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    console.error('[admin/pricing/special-dates/id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
