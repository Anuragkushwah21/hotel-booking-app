import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeBookingRef } from '@/lib/booking-reference'

/**
 * POST /api/bookings/lookup  { bookingId, email }
 *
 * Public booking lookup for guests who have a booking number but no account —
 * chiefly walk-ins created at the front desk, who never set a password.
 *
 * The email is a second factor: the booking number alone is never enough, and
 * a wrong number and a wrong email return the exact same message so this can't
 * be used to probe for who has stayed here.
 */

const GENERIC_MISS =
  "We couldn't find a booking with that booking number and email. Please check both and try again."

// Per-instance throttle. Serverless spreads requests across instances so this
// is a speed bump, not a guarantee — put a real limiter at the edge if abuse shows up.
const ATTEMPT_WINDOW_MS = 60_000
const MAX_ATTEMPTS = 10
const attempts = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)

  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return false
  }

  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a minute and try again.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!bookingId || !email) {
      return NextResponse.json(
        { error: 'Booking number and email are both required' },
        { status: 400 },
      )
    }

    // Guests quote the short reference (HB-7K4M2Q). Older confirmation emails
    // went out with the raw booking id, so both still resolve.
    const reference = normalizeBookingRef(bookingId)

    const booking = await prisma.booking.findFirst({
      where: reference ? { reference } : { id: bookingId },
      include: {
        room: { select: { name: true, roomNo: true, acType: true } },
        table: { select: { tableNo: true, location: true } },
        user: { select: { email: true } },
      },
    })

    // Either the booking's own contact email or the account it sits under works.
    const matches =
      booking &&
      (booking.guestEmail?.toLowerCase() === email ||
        booking.user?.email?.toLowerCase() === email)

    if (!matches) {
      return NextResponse.json({ error: GENERIC_MISS }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        reference: booking.reference,
        type: booking.type,
        source: booking.source,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMode: booking.paymentMode,
        guestName: booking.guestName,
        guestCount: booking.guestCount,
        guestPhone: booking.guestPhone,
        specialRequest: booking.specialRequest,
        roomName: booking.room?.name ?? null,
        roomNo: booking.room?.roomNo ?? null,
        tableNo: booking.table?.tableNo ?? null,
        tableLocation: booking.table?.location ?? null,
        checkInDate: booking.checkInDate?.toISOString() ?? null,
        checkOutDate: booking.checkOutDate?.toISOString() ?? null,
        bookingDate: booking.bookingDate?.toISOString() ?? null,
        checkedInAt: booking.checkedInAt?.toISOString() ?? null,
        checkedOutAt: booking.checkedOutAt?.toISOString() ?? null,
        addOns: booking.addOns,
        baseAmount: booking.baseAmount,
        addOnsAmount: booking.addOnsAmount,
        totalPrice: booking.totalPrice,
        refundAmount: booking.refundAmount,
        createdAt: booking.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[bookings/lookup] POST error:', error)
    return NextResponse.json({ error: 'Failed to look up booking' }, { status: 500 })
  }
}
