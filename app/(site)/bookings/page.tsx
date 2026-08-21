'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Calendar, 
  MapPin, 
  Users, 
  Mail, 
  Phone, 
  CreditCard,
  MessageSquare,
  Search,
  X 
} from 'lucide-react'
import { ReviewForm, type BookingReview } from '@/components/site/review-form'

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN' | 'CHECKED_OUT'
type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

type Booking = {
  id: string
  reference: string
  type: 'ROOM' | 'TABLE'
  roomName: string | null
  roomNo: string | null
  tableNo: string | null
  checkInDate: string | null
  checkOutDate: string | null
  bookingDate: string | null
  guestCount: number
  guestName: string
  guestEmail: string
  guestPhone: string | null
  specialRequest: string | null
  totalPrice: number
  status: BookingStatus
  paymentStatus: PaymentStatus
  checkedOutAt: string | null
  canReview: boolean
  review: BookingReview | null
  createdAt: string
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState<string | null>(null)

  const fetchBookings = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/bookings/me')
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load bookings')
      }
      
      setBookings(data.bookings || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load bookings'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()
  }, [])

  // Fold a freshly saved review back into the list without a refetch
  const handleReviewSaved = (bookingId: string, review: BookingReview) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, review, canReview: false } : b)),
    )
  }

  // Cancel booking handler
 // Cancel booking handler
const handleCancelBooking = async (bookingId: string, bookingType: 'ROOM' | 'TABLE') => {
  const confirmed = window.confirm(
    'Are you sure you want to cancel this booking? This action cannot be undone.'
  )
  
  if (!confirmed) return

  try {
    setCancelling(bookingId)

    // ✅ FIXED: Removed extra 's' from rooms and tables
    const endpoint = bookingType === 'ROOM' 
      ? `/api/bookings/rooms/${bookingId}`      // ✅ room (not rooms)
      : `/api/bookings/tables/${bookingId}`     // ✅ table (not tables)

    const response = await fetch(endpoint, {
      method: 'DELETE',
    })

    const data = await response.json()

    if (!response.ok) {
      toast.error(data.error || 'Failed to cancel booking')
      return
    }

    toast.success('🎉 Booking cancelled successfully!')
    
    // Refresh bookings
    fetchBookings()
  } catch (error) {
    console.error('Error:', error)
    toast.error('Something went wrong. Please try again.')
  } finally {
    setCancelling(null)
  }
}

  // Status badge component
  const StatusBadge = ({ status }: { status: BookingStatus }) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
      CANCELLED: 'bg-red-100 text-red-800 border-red-200',
      CHECKED_IN: 'bg-blue-100 text-blue-800 border-blue-200',
      CHECKED_OUT: 'bg-purple-100 text-purple-800 border-purple-200',
    }

    return (
      <Badge 
        variant="outline" 
        className={`${colors[status]} font-semibold`}
      >
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  // Payment status badge
  const PaymentBadge = ({ status }: { status: PaymentStatus }) => {
    const colors = {
      PENDING: 'bg-orange-100 text-orange-800',
      PAID: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      REFUNDED: 'bg-gray-100 text-gray-800',
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
        <CreditCard className="h-3 w-3" />
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-4">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-4">
        <Card className="p-10 text-center">
          <p className="text-red-500 text-lg font-semibold mb-2">Error</p>
          <p className="text-muted-foreground">{error}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <Button onClick={fetchBookings}>Try Again</Button>
            {/* Signed-out or front-desk guests can still get to their booking. */}
            <Button
              variant="outline"
              onClick={() => (window.location.href = '/booking-status')}
            >
              <Search className="h-4 w-4 mr-2" />
              See your booking
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (bookings.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-4">
        <Card className="p-10 text-center">
          <p className="text-lg font-semibold mb-2">No bookings yet</p>
          <p className="text-muted-foreground mb-4">
            You haven't made any bookings. Start exploring rooms and tables!
          </p>
          <Button onClick={() => window.location.href = '/rooms'}>
            Browse Rooms
          </Button>
          <p className="text-sm text-muted-foreground mt-6 mb-3">
            Booked at our front desk? Those don't appear here — look it up with
            your booking number.
          </p>
          <Button
            variant="outline"
            onClick={() => (window.location.href = '/booking-status')}
          >
            <Search className="h-4 w-4 mr-2" />
            See your booking
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Bookings</h1>
          <p className="text-muted-foreground mt-1">
            Manage and view all your bookings
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {bookings.length} {bookings.length === 1 ? 'Booking' : 'Bookings'}
        </Badge>
      </div>

      {/* Walk-in bookings live on the front desk's records, not here. */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          This list covers the bookings you made online. Booked at our front desk?
          Look it up with your booking number.
        </p>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => (window.location.href = '/booking-status')}
        >
          <Search className="h-4 w-4 mr-2" />
          See your booking
        </Button>
      </Card>

      {/* Bookings List */}
      <div className="space-y-4">
        {bookings.map((booking) => {
          const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED'
          const showReview = booking.status === 'CHECKED_OUT'

          return (
            <Card key={booking.id} className="overflow-hidden">
              <div className="p-6 space-y-4">
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold">
                        {booking.type === 'ROOM' 
                          ? booking.roomName || 'Room Booking'
                          : `Table ${booking.tableNo || 'Booking'}`}
                      </h3>
                      <StatusBadge status={booking.status} />
                      <PaymentBadge status={booking.paymentStatus} />
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      Booking number:{' '}
                      <span className="font-mono font-semibold tracking-wider text-foreground">
                        {booking.reference}
                      </span>
                    </p>

                    {booking.type === 'ROOM' && booking.roomNo && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <MapPin className="h-4 w-4" />
                        Room #{booking.roomNo}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      ₹{booking.totalPrice.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total Amount
                    </p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                  {/* Dates */}
                  {booking.type === 'ROOM' && booking.checkInDate && booking.checkOutDate && (
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Check-in & Check-out</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(booking.checkInDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {' → '}
                          {new Date(booking.checkOutDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                  {booking.type === 'TABLE' && booking.bookingDate && (
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Dining Date & Time</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(booking.bookingDate).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Guests */}
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Guests</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.guestCount} {booking.guestCount === 1 ? 'Guest' : 'Guests'}
                      </p>
                    </div>
                  </div>

                  {/* Guest Name */}
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Guest Name</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.guestName}
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.guestEmail}
                      </p>
                    </div>
                  </div>

                  {/* Phone */}
                  {booking.guestPhone && (
                    <div className="flex items-start gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <p className="text-sm text-muted-foreground">
                          {booking.guestPhone}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Special Request */}
                  {booking.specialRequest && (
                    <div className="flex items-start gap-3 md:col-span-2">
                      <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Special Request</p>
                        <p className="text-sm text-muted-foreground">
                          {booking.specialRequest}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Post-stay review */}
                {showReview && (
                  <div className="pt-4 border-t">
                    <ReviewForm
                      bookingId={booking.id}
                      review={booking.review}
                      onSaved={(review) => handleReviewSaved(booking.id, review)}
                    />
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Booked on {new Date(booking.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>

                  {canCancel && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancelBooking(booking.id, booking.type)}
                      disabled={cancelling === booking.id}
                    >
                      {cancelling === booking.id ? (
                        'Cancelling...'
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Cancel Booking
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}