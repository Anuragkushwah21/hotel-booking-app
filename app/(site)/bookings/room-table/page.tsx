'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'react-toastify'

export default function RoomTableBookingPage() {
  const router = useRouter()

  const [roomId, setRoomId] = useState('')           // later: replace with room selector
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')

  const [tableDate, setTableDate] = useState('')
  const [tableTime, setTableTime] = useState('19:00')
  const [tableGuests, setTableGuests] = useState('2')

  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [specialRequest, setSpecialRequest] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (
      !roomId ||
      !checkIn ||
      !checkOut ||
      !tableDate ||
      !tableTime ||
      !guestName ||
      !guestEmail
    ) {
      toast.error('Fill all required fields')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/bookings/room-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          roomGuestCount: Number(tableGuests) || 1,
          tableDate,
          tableTime,
          tableGuestCount: Number(tableGuests) || 1,
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

      toast.success('Room & table booked successfully')
      router.push('/bookings')
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-3xl font-bold">Book Room & Table</h1>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-lg mb-2">Room Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Room ID</label>
            <Input
              placeholder="room id"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Check-in</label>
            <Input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Check-out</label>
            <Input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-lg mb-2">Table Reservation</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <Input
              type="date"
              value={tableDate}
              onChange={(e) => setTableDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time</label>
            <Input
              type="time"
              value={tableTime}
              onChange={(e) => setTableTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Guests</label>
            <Input
              type="number"
              min={1}
              value={tableGuests}
              onChange={(e) => setTableGuests(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-lg mb-2">Guest Details</h2>
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
          <label className="block text-sm font-medium mb-1">Special Requests</label>
          <Input
            value={specialRequest}
            onChange={(e) => setSpecialRequest(e.target.value)}
            placeholder="Allergies, occasion, etc."
          />
        </div>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full h-11 text-base font-semibold"
      >
        {loading ? 'Booking...' : 'Confirm Room & Table Booking'}
      </Button>
    </div>
  )
}