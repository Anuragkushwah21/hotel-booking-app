// User Types
export interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
}

// Hotel Types
export interface Hotel {
  id: string
  name: string
  location: string
  country: string
  description: string | null
  rating: number
  totalReviews: number
  imageUrl: string | null
  amenities: string[]
  createdAt: Date
  updatedAt: Date
}

export interface HotelWithRooms extends Hotel {
  rooms: Room[]
  reviews: Review[]
  averageRating: number
}

// Room Types
export interface Room {
  id: string
  hotelId: string
  roomType: string
  capacity: number
  pricePerNight: number
  description: string | null
  amenities: string[]
  imageUrls: string[]
  totalRooms: number
  availableRooms: number
  createdAt: Date
  updatedAt: Date
}

export interface RoomWithAvailability extends Room {
  availability: RoomAvailability[]
}

// Booking Types
export interface Booking {
  id: string
  userId: string
  roomId: string
  hotelId: string
  checkInDate: Date
  checkOutDate: Date
  guestCount: number
  guestName: string
  guestEmail: string
  guestPhone: string | null
  totalPrice: number
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  stripePaymentId: string | null
  specialRequests: string | null
  createdAt: Date
  updatedAt: Date
}

export interface BookingWithDetails extends Booking {
  room: Room
  hotel: Hotel
  user: User
}

// Review Types
export interface Review {
  id: string
  bookingId: string
  userId: string
  hotelId: string
  rating: number
  title: string | null
  comment: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ReviewWithUser extends Review {
  user: User
}

// Room Availability Types
export interface RoomAvailability {
  id: string
  roomId: string
  availabilityDate: Date
  availableCount: number
  createdAt: Date
  updatedAt: Date
}

// API Request/Response Types
export interface SearchHotelsRequest {
  destination?: string
  checkIn: string
  checkOut: string
  guests: number
  page?: number
  limit?: number
}

export interface CreateBookingRequest {
  roomId: string
  hotelId: string
  checkInDate: string
  checkOutDate: string
  guestCount: number
  guestName: string
  guestEmail: string
  guestPhone?: string
  specialRequests?: string
  totalPrice: number
}

export interface CreateReviewRequest {
  bookingId: string
  hotelId: string
  rating: number
  title?: string
  comment?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface SignupRequest {
  email: string
  password: string
  name: string
  confirmPassword: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Admin Types
export interface DashboardStats {
  totalHotels: number
  totalBookings: number
  totalRevenue: number
  activeBookings: number
  pendingPayments: number
  completedBookings: number
  averageRating: number
}

export interface MonthlyRevenue {
  month: string
  revenue: number
  bookings: number
}

export interface RoomPerformance {
  roomType: string
  bookingCount: number
  revenue: number
  occupancyRate: number
}
