import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

/**
 * Guest reviews. A review is earned, not free-form: it can only be attached to
 * one of the guest's own bookings, and only once that booking has been checked
 * out by the front desk (`Booking.status = CHECKED_OUT`). The one-per-booking
 * rule is enforced by the unique index on `Review.bookingId`.
 */

const MAX_TITLE = 120
const MAX_COMMENT = 2000

type ReviewInput = {
  rating: number
  title: string | null
  comment: string | null
}

/** Validate + normalise the shared body of POST and PATCH. */
function parseBody(body: any): { ok: true; data: ReviewInput } | { ok: false; error: string } {
  const rating = Number(body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Rating must be a whole number between 1 and 5' }
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''

  if (title.length > MAX_TITLE) {
    return { ok: false, error: `Title must be ${MAX_TITLE} characters or fewer` }
  }
  if (comment.length > MAX_COMMENT) {
    return { ok: false, error: `Review must be ${MAX_COMMENT} characters or fewer` }
  }

  return { ok: true, data: { rating, title: title || null, comment: comment || null } }
}

/** Only the first name is ever exposed publicly. */
function displayName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'Guest'
}

/**
 * GET /api/reviews                  — recent public reviews + rating summary
 * GET /api/reviews?bookingId=<id>   — the signed-in guest's review for one booking
 */
export async function GET(req: NextRequest) {
  try {
    const bookingId = req.nextUrl.searchParams.get('bookingId')

    if (bookingId) {
      const auth = await requireAuth()
      if (!auth.ok) return auth.response

      const review = await prisma.review.findUnique({
        where: { bookingId },
        include: { booking: { select: { userId: true } } },
      })

      // Don't leak whether someone else's booking exists.
      if (!review || review.booking.userId !== auth.user.id) {
        return NextResponse.json({ success: true, review: null })
      }

      const { booking: _booking, ...rest } = review
      return NextResponse.json({ success: true, review: rest })
    }

    const limitParam = Number(req.nextUrl.searchParams.get('limit'))
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 10

    const [reviews, aggregate] = await Promise.all([
      prisma.review.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { user: { select: { name: true } } },
      }),
      prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    ])

    return NextResponse.json({
      success: true,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        guestName: displayName(r.user.name),
        createdAt: r.createdAt.toISOString(),
      })),
      summary: {
        averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : null,
        totalReviews: aggregate._count._all,
      },
    })
  } catch (error) {
    console.error('[reviews] GET error:', error)
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 })
  }
}

/**
 * POST /api/reviews  { bookingId, rating, title?, comment? }
 * Creates the review for a checked-out booking owned by the caller.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : ''
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 })
    }

    const parsed = parseBody(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, status: true, review: { select: { id: true } } },
    })

    if (!booking || booking.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.status !== 'CHECKED_OUT') {
      return NextResponse.json(
        {
          error: 'You can leave a review once your stay is complete and you have checked out.',
          code: 'NOT_CHECKED_OUT',
          currentStatus: booking.status,
        },
        { status: 409 },
      )
    }

    if (booking.review) {
      return NextResponse.json(
        { error: 'You have already reviewed this booking', code: 'ALREADY_REVIEWED' },
        { status: 409 },
      )
    }

    const review = await prisma.review.create({
      data: { bookingId, userId: auth.user.id, ...parsed.data },
    })

    return NextResponse.json({ success: true, review, message: 'Thanks for your review!' }, { status: 201 })
  } catch (error: any) {
    // Lost the race against a duplicate submit.
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'You have already reviewed this booking', code: 'ALREADY_REVIEWED' },
        { status: 409 },
      )
    }
    console.error('[reviews] POST error:', error)
    return NextResponse.json({ error: 'Failed to save review' }, { status: 500 })
  }
}

/**
 * PATCH /api/reviews  { bookingId, rating, title?, comment? }
 * Lets a guest correct the review they just left.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : ''
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 })
    }

    const parsed = parseBody(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const existing = await prisma.review.findUnique({
      where: { bookingId },
      select: { id: true, userId: true },
    })

    if (!existing || existing.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    const review = await prisma.review.update({
      where: { bookingId },
      data: parsed.data,
    })

    return NextResponse.json({ success: true, review, message: 'Review updated' })
  } catch (error) {
    console.error('[reviews] PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 })
  }
}
