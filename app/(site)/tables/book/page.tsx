'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// Agar tumne Textarea banaya hai:
import { Textarea } from '@/components/ui/textarea'
import {
  TableAvailabilityNote,
  useTableAvailability,
} from '@/components/site/table-availability'

export default function TableBookingPage() {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [guestCount, setGuestCount] = useState(2)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [specialRequest, setSpecialRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Answers "is this slot bookable?" as soon as the slot is picked.
  const availability = useTableAvailability(date, time, guestCount)

  // Booking number of the table booking just made — the guest needs it to look
  // the booking up later, exactly like a room booking.
  const [reference, setReference] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setReference('')

    if (!date || !time) {
      setError('Please select date and time')
      return
    }

    if (!guestName || !guestEmail) {
      setError('Please enter your name and email')
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/bookings/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time,
          guestCount,
          guestName,
          guestEmail,
          guestPhone,
          specialRequest,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to book table')
      }
      setReference(data.reference || data.booking?.reference || '')
      // optional: reset form
      // setDate(''); setTime(''); ...
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to book table',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-4">
        Book a table at our restaurant
      </h1>

      <Card className="p-6">
        {error && (
          <div className="mb-3 text-sm text-red-500">{error}</div>
        )}
        {reference && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-700">
              Table booked successfully!
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your booking number:{' '}
              <span className="font-mono font-semibold tracking-wider text-foreground">
                {reference}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ve emailed the details too. Keep this number to check your
              booking any time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  (window.location.href = `/booking-status?ref=${encodeURIComponent(reference)}`)
                }
              >
                See your booking
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => (window.location.href = '/bookings')}
              >
                My Bookings
              </Button>
            </div>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Date</label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Time</label>
              <Input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">Guests</label>
            <Input
              type="number"
              min={1}
              value={guestCount}
              onChange={e => setGuestCount(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Full Name</label>
            <Input
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Email</label>
            <Input
              type="email"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Phone</label>
            <Input
              value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1">
              Special Requests
            </label>
            <Textarea
              value={specialRequest}
              onChange={e =>
                setSpecialRequest(e.target.value)
              }
            />
          </div>

          <TableAvailabilityNote state={availability} />

          <Button
            type="submit"
            disabled={loading || availability.checking || availability.available === false}
            className="w-full"
          >
            {loading ? 'Booking...' : 'Book table'}
          </Button>
        </form>
      </Card>
    </div>
  )
}