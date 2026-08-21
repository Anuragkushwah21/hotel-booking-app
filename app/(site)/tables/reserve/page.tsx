'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'react-toastify'
import {
  TableAvailabilityNote,
  useTableAvailability,
} from '@/components/site/table-availability'

function ReserveTablePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialDate = searchParams.get('date') || ''
  const initialTime = searchParams.get('time') || '19:00'
  const initialGuests = searchParams.get('guests') || '2'

  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [guestCount, setGuestCount] = useState(initialGuests)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [specialRequest, setSpecialRequest] = useState('')
  const [loading, setLoading] = useState(false)

  // Answers "is this slot bookable?" as soon as the slot is picked.
  const availability = useTableAvailability(date, time, guestCount)

  const handleSubmit = async () => {
    if (!date || !time || !guestName || !guestEmail) {
      toast.error('Date, time, name and email are required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time,
          guestCount: Number(guestCount) || 1,
          guestName,
          guestEmail,
          guestPhone,
          specialRequest,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to create booking')
        setLoading(false)
        return
      }

      toast.success('Table booked successfully')
      router.push('/bookings')
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6">Reserve a Table</h1>

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Guests</label>
            <Input
              type="number"
              min={1}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
            />
          </div>
        </div>

        <hr className="my-4" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <Input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <Input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Special Requests
          </label>
          <Input
            value={specialRequest}
            onChange={(e) => setSpecialRequest(e.target.value)}
            placeholder="Allergies, occasion, seating preference..."
          />
        </div>

        <TableAvailabilityNote state={availability} />

        <Button
          onClick={handleSubmit}
          disabled={loading || availability.checking || availability.available === false}
          className="w-full h-11 text-base font-semibold"
        >
          {loading ? 'Booking...' : 'Confirm Reservation'}
        </Button>
      </Card>
    </div>
  )
}

/**
 * useSearchParams() forces client-side bailout, which Next requires to sit
 * behind a Suspense boundary or the page fails to prerender at build time.
 */
export default function ReserveTablePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ReserveTablePageContent />
    </Suspense>
  )
}
