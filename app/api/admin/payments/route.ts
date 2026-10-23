import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { istDayBounds } from '@/lib/format'
import type { PaymentKind, PaymentMode, PaymentRecordStatus, Prisma } from '@prisma/client'

/**
 * GET /api/admin/payments — the payment ledger (ADMIN).
 *   from,to  YYYY-MM-DD (IST) on createdAt
 *   kind     ADVANCE | BALANCE | FULL | REFUND
 *   status   CREATED | SUCCEEDED | FAILED
 *   mode     ONLINE | CASH | CARD | UPI
 *   gateway  RAZORPAY | MOCK | DESK | LEGACY
 *   q        booking number / guest name / gateway id
 *   page,limit
 * Also returns totals for the filtered range and the pending refund queue.
 */
const KINDS: PaymentKind[] = ['ADVANCE', 'BALANCE', 'FULL', 'REFUND']
const STATUSES: PaymentRecordStatus[] = ['CREATED', 'SUCCEEDED', 'FAILED']
const MODES: PaymentMode[] = ['ONLINE', 'CASH', 'CARD', 'UPI']

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 25))

    const and: Prisma.PaymentWhereInput[] = []
    const from = sp.get('from')
    const to = sp.get('to')
    if (from || to) {
      and.push({
        createdAt: {
          ...(from && { gte: istDayBounds(from.slice(0, 10)).start }),
          ...(to && { lt: istDayBounds(to.slice(0, 10)).end }),
        },
      })
    }
    const kind = sp.get('kind') as PaymentKind | null
    if (kind && KINDS.includes(kind)) and.push({ kind })
    const status = sp.get('status') as PaymentRecordStatus | null
    if (status && STATUSES.includes(status)) and.push({ status })
    const mode = sp.get('mode') as PaymentMode | null
    if (mode && MODES.includes(mode)) and.push({ mode })
    const gateway = sp.get('gateway')
    if (gateway) and.push({ gateway })
    const q = sp.get('q')?.trim()
    if (q) {
      and.push({
        OR: [
          { gatewayOrderId: { contains: q } },
          { gatewayPaymentId: { contains: q } },
          { booking: { reference: { contains: q.toUpperCase() } } },
          { booking: { guestName: { contains: q, mode: 'insensitive' } } },
        ],
      })
    }
    const where: Prisma.PaymentWhereInput = { AND: and }

    const [total, payments, sums, refundQueue] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          booking: {
            select: { id: true, reference: true, guestName: true, type: true, source: true, totalPrice: true },
          },
          recordedBy: { select: { name: true, email: true } },
        },
      }),
      prisma.payment.groupBy({
        by: ['kind'],
        where: { AND: [...and, { status: 'SUCCEEDED' }] },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.booking.findMany({
        where: { refundStatus: 'REFUND_PENDING' },
        orderBy: { refundRequestedAt: 'asc' },
        select: {
          id: true, reference: true, guestName: true, type: true, source: true, status: true,
          paidAmount: true, refundAmount: true, refundRequestedAt: true, cancelReason: true,
          checkInDate: true, bookingDate: true,
        },
      }),
    ])

    const collected = sums.filter((s) => s.kind !== 'REFUND').reduce((s, r) => s + (r._sum.amount ?? 0), 0)
    const refunded = sums.find((s) => s.kind === 'REFUND')?._sum.amount ?? 0

    return NextResponse.json({
      payments,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      totals: { collected, refunded, net: collected - refunded },
      refundQueue,
    })
  } catch (error) {
    console.error('[admin/payments] GET error:', error)
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 })
  }
}
