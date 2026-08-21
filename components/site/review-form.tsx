'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { Star, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export type BookingReview = {
  id: string
  rating: number
  title: string | null
  comment: string | null
  createdAt: string
}

/** Read-only star row. */
export function StarRating({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
          }`}
        />
      ))}
    </span>
  )
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (rating: number) => void
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState(0)
  const active = hovered || value

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={value === star}
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onClick={() => onChange(star)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        >
          <Star
            className={`h-6 w-6 ${
              star <= active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

/**
 * Post-stay review block for a single booking.
 *
 * Rendered only for checked-out bookings: shows the submitted review when one
 * exists (editable), and the "rate your stay" form when it doesn't.
 */
export function ReviewForm({
  bookingId,
  review,
  onSaved,
}: {
  bookingId: string
  review: BookingReview | null
  onSaved: (review: BookingReview) => void
}) {
  const [editing, setEditing] = useState(!review)
  const [rating, setRating] = useState(review?.rating ?? 0)
  const [title, setTitle] = useState(review?.title ?? '')
  const [comment, setComment] = useState(review?.comment ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (rating < 1) {
      toast.error('Please pick a star rating first')
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/reviews', {
        method: review ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, title, comment }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to save your review')
        return
      }

      toast.success(review ? 'Review updated' : '⭐ Thanks for reviewing your stay!')
      onSaved(data.review)
      setEditing(false)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (review && !editing) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StarRating value={review.rating} />
              <span className="text-sm font-medium">Your review</span>
            </div>
            {review.title && <p className="text-sm font-semibold">{review.title}</p>}
            {review.comment && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{review.comment}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Reviewed on{' '}
              {new Date(review.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">How was your stay?</p>
        <p className="text-xs text-muted-foreground">
          Your feedback helps other guests and our team.
        </p>
      </div>

      <StarPicker value={rating} onChange={setRating} disabled={saving} />

      <Input
        placeholder="Sum it up in a line (optional)"
        value={title}
        maxLength={120}
        disabled={saving}
        onChange={(e) => setTitle(e.target.value)}
      />

      <Textarea
        placeholder="Tell us what went well, and what we could do better (optional)"
        value={comment}
        maxLength={2000}
        rows={4}
        disabled={saving}
        onChange={(e) => setComment(e.target.value)}
      />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={saving || rating < 1}>
          {saving ? 'Saving...' : review ? 'Update review' : 'Submit review'}
        </Button>

        {review && (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setRating(review.rating)
              setTitle(review.title ?? '')
              setComment(review.comment ?? '')
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
