'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StripePayment } from '@/components/stripe-payment'
import { ArrowRight, CheckCircle } from 'lucide-react'

interface Room {
  id: string
  room_type: string
  price_per_night: number
}

interface Hotel {
  id: string
  name: string
  location: string
}

function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const hotelId = searchParams.get('hotelId')
  const roomId = searchParams.get('roomId')

  const [step, setStep] = useState(1)
  const [hotel, setHotel] = useState<Hotel | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookingId, setBookingId] = useState<string | null>(null)

  // Form data
  const [dates, setDates] = useState({
    checkIn: '',
    checkOut: '',
  })
  const [guests, setGuests] = useState({
    count: 1,
    name: '',
    email: '',
    phone: '',
  })
  const [specialRequests, setSpecialRequests] = useState('')

  // Calculate stay duration
  const calculateNights = () => {
    if (!dates.checkIn || !dates.checkOut) return 0
    const checkIn = new Date(dates.checkIn)
    const checkOut = new Date(dates.checkOut)
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
    return nights > 0 ? nights : 0
  }

  const nights = calculateNights()
  const totalPrice = room ? room.price_per_night * nights : 0

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!hotelId || !roomId) {
          router.push('/hotels')
          return
        }

        const response = await fetch(`/api/hotels/${hotelId}`)
        if (!response.ok) throw new Error('Failed to fetch hotel')

        const data = await response.json()
        setHotel(data.hotel)

        const foundRoom = data.rooms.find((r: Room) => r.id === roomId)
        if (foundRoom) {
          setRoom(foundRoom)
        }
      } catch (error) {
        console.error('[v0] Error fetching data:', error)
        router.push('/hotels')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [hotelId, roomId, router])

  const handleConfirmBooking = async () => {
    if (!hotelId || !roomId) return

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          hotelId,
          checkInDate: dates.checkIn,
          checkOutDate: dates.checkOut,
          guestCount: guests.count,
          guestName: guests.name,
          guestEmail: guests.email,
          guestPhone: guests.phone,
          specialRequests: specialRequests || null,
          totalPrice,
        }),
      })

      const data = await response.json()

      // Surface what the server actually said — a staff account gets told to
      // use the dashboard, an unavailable room says so, and so on.
      if (!response.ok) throw new Error(data.error || 'Failed to create booking')

      setBookingId(data.bookingId)
      setStep(4)
    } catch (error) {
      console.error('[v0] Error confirming booking:', error)
      alert(error instanceof Error ? error.message : 'Failed to confirm booking. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background py-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="space-y-4">
            <div className="h-12 bg-muted rounded animate-pulse" />
            <div className="h-96 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (!hotel || !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Booking details not found</h1>
          <Link href="/hotels">
            <Button className="bg-primary text-primary-foreground">Back to Hotels</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    step >= s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground/50'
                  }`}
                >
                  {step > s ? '✓' : s}
                </div>
                {s < 5 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > s ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-foreground/70 mt-4">
            <span>Dates</span>
            <span>Guest Info</span>
            <span>Review</span>
            <span>Payment</span>
            <span>Confirmation</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            {/* Step 1: Dates */}
            {step === 1 && (
              <Card className="p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">Select Your Dates</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Check-in Date
                    </label>
                    <Input
                      type="date"
                      value={dates.checkIn}
                      onChange={(e) => setDates({ ...dates, checkIn: e.target.value })}
                      className="text-lg h-12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Check-out Date
                    </label>
                    <Input
                      type="date"
                      value={dates.checkOut}
                      onChange={(e) => setDates({ ...dates, checkOut: e.target.value })}
                      className="text-lg h-12"
                    />
                  </div>

                  {dates.checkIn && dates.checkOut && (
                    <div className="bg-primary/10 p-4 rounded-lg">
                      <p className="text-sm text-foreground/70">Total nights</p>
                      <p className="text-2xl font-bold text-primary">{nights} nights</p>
                    </div>
                  )}

                  <Button
                    onClick={() => setStep(2)}
                    disabled={!dates.checkIn || !dates.checkOut || nights === 0}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12"
                  >
                    Continue <ArrowRight size={20} className="ml-2" />
                  </Button>
                </div>
              </Card>
            )}

            {/* Step 2: Guest Info */}
            {step === 2 && (
              <Card className="p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">Guest Information</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Full Name
                    </label>
                    <Input
                      value={guests.name}
                      onChange={(e) => setGuests({ ...guests, name: e.target.value })}
                      className="text-lg h-12"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      value={guests.email}
                      onChange={(e) => setGuests({ ...guests, email: e.target.value })}
                      className="text-lg h-12"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Phone Number
                    </label>
                    <Input
                      value={guests.phone}
                      onChange={(e) => setGuests({ ...guests, phone: e.target.value })}
                      className="text-lg h-12"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Number of Guests
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={guests.count}
                      onChange={(e) => setGuests({ ...guests, count: parseInt(e.target.value) })}
                      className="text-lg h-12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Special Requests (Optional)
                    </label>
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      className="w-full p-3 border border-border rounded-lg text-foreground bg-card"
                      rows={4}
                      placeholder="Any special requests for your stay..."
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="flex-1 h-12"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep(3)}
                      disabled={!guests.name || !guests.email || !guests.phone}
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-12"
                    >
                      Continue <ArrowRight size={20} className="ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <Card className="p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">Review Your Booking</h2>
                <div className="space-y-6">
                  <div className="border-b border-border pb-4">
                    <h3 className="font-semibold text-foreground mb-2">{room.room_type}</h3>
                    <p className="text-foreground/70 mb-2">{hotel.name}</p>
                    <p className="text-foreground/70">{hotel.location}</p>
                  </div>

                  <div className="border-b border-border pb-4">
                    <p className="text-sm text-foreground/70 mb-1">Dates</p>
                    <p className="font-semibold text-foreground">
                      {dates.checkIn} to {dates.checkOut}
                    </p>
                    <p className="text-foreground/70">{nights} nights</p>
                  </div>

                  <div className="border-b border-border pb-4">
                    <p className="text-sm text-foreground/70 mb-1">Guest</p>
                    <p className="font-semibold text-foreground">{guests.name}</p>
                    <p className="text-foreground/70">{guests.email}</p>
                    <p className="text-foreground/70">{guests.phone}</p>
                  </div>

                  {specialRequests && (
                    <div className="border-b border-border pb-4">
                      <p className="text-sm text-foreground/70 mb-1">Special Requests</p>
                      <p className="text-foreground">{specialRequests}</p>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep(2)}
                      className="flex-1 h-12"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep(4)}
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-12"
                    >
                      Continue to Payment <ArrowRight size={20} className="ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Step 4: Payment */}
            {step === 4 && (
              <>
                <StripePayment
                  bookingId={bookingId || ''}
                  hotelName={hotel?.name || ''}
                  roomType={room?.room_type || ''}
                  totalPrice={totalPrice}
                  nights={nights}
                  guestName={guests.name}
                  guestEmail={guests.email}
                  onSuccess={() => setStep(5)}
                />
              </>
            )}

            {/* Step 5: Confirmation */}
            {step === 5 && (
              <Card className="p-8 text-center">
                <div className="mb-6">
                  <CheckCircle size={64} className="text-primary mx-auto" />
                </div>
                <h2 className="text-3xl font-bold text-foreground mb-4">
                  Booking Confirmed!
                </h2>
                <p className="text-foreground/70 mb-8">
                  Your booking has been confirmed and paid. A confirmation email has been sent to {guests.email}.
                </p>
                <div className="space-y-4">
                  <Link href="/bookings">
                    <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12">
                      View My Bookings
                    </Button>
                  </Link>
                  <Link href="/hotels">
                    <Button variant="outline" className="w-full h-12">
                      Continue Browsing
                    </Button>
                  </Link>
                </div>
              </Card>
            )}
          </div>

          {/* Booking Summary Sidebar */}
          <div>
            <Card className="p-6 sticky top-20">
              <h3 className="text-lg font-bold text-foreground mb-4">Booking Summary</h3>

              <div className="space-y-3 pb-4 border-b border-border mb-4">
                <div className="flex justify-between">
                  <span className="text-foreground/70">Room:</span>
                  <span className="font-semibold text-foreground">{room.room_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">Nights:</span>
                  <span className="font-semibold text-foreground">{nights}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">Price per night:</span>
                  <span className="font-semibold text-foreground">${room.price_per_night}</span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-6">
                <span className="font-semibold text-foreground">Total Price:</span>
                <span className="text-2xl font-bold text-primary">${totalPrice}</span>
              </div>

              <div className="space-y-2 text-sm text-foreground/70">
                <p>✓ Free cancellation</p>
                <p>✓ No hidden fees</p>
                <p>✓ Secure payment</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * useSearchParams() forces client-side bailout, which Next requires to sit
 * behind a Suspense boundary or the page fails to prerender at build time.
 */
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  )
}
