# HotelBook - Hotel Booking Platform

A full-stack hotel booking application with Prisma ORM, Next.js, PostgreSQL, and Stripe integration.

## Features

- Hotel search & filtering
- Multi-step booking checkout
- User authentication with email verification
- Admin dashboard for management
- Stripe payment processing
- Hotel reviews & ratings

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes with Prisma ORM
- **Database**: PostgreSQL (Neon)
- **Payment**: Stripe
- **UI**: shadcn/ui components

## Setup

### 1. Environment Variables

Add to `.env.local`:

```env
DATABASE_URL=your_postgres_connection_string
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Database Setup

```bash
pnpm prisma:migrate     # Create database schema
pnpm prisma:seed        # Add sample data (optional)
```

### 3. Start Development

```bash
pnpm dev
```

Visit `http://localhost:3000`

## Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm prisma:migrate` - Run database migrations
- `pnpm prisma:seed` - Seed database with sample data
- `pnpm db:studio` - Open Prisma Studio

## Project Structure
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up the database schema in Neon Console or using the provided SQL:

```sql
-- Hotels table
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  country VARCHAR(255) NOT NULL,
  description TEXT,
  rating DECIMAL(3, 2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  image_url TEXT,
  amenities TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type VARCHAR(100) NOT NULL,
  capacity INTEGER NOT NULL,
  price_per_night DECIMAL(10, 2) NOT NULL,
  description TEXT,
  amenities TEXT[] DEFAULT '{}',
  image_urls TEXT[] DEFAULT '{}',
  total_rooms INTEGER DEFAULT 1,
  available_rooms INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bookings table
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  guest_count INTEGER NOT NULL,
  guest_name VARCHAR(255) NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(20),
  total_price DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  stripe_payment_id VARCHAR(255),
  special_requests TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Room availability table
CREATE TABLE room_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  availability_date DATE NOT NULL,
  available_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, availability_date)
);
```

3. Create indexes for better performance:

```sql
CREATE INDEX idx_rooms_hotel_id ON rooms(hotel_id);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_room_id ON bookings(room_id);
CREATE INDEX idx_bookings_hotel_id ON bookings(hotel_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_reviews_hotel_id ON reviews(hotel_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_room_availability_room_id ON room_availability(room_id);
CREATE INDEX idx_room_availability_date ON room_availability(availability_date);
```

4. Run the development server:

```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) to see your application.

## Project Structure

```
app/
├── admin/                    # Admin dashboard pages
│   ├── layout.tsx           # Admin layout with sidebar
│   ├── page.tsx             # Dashboard overview
│   ├── hotels/page.tsx      # Hotels management
│   ├── bookings/page.tsx    # Bookings management
│   └── analytics/page.tsx   # Analytics dashboard
├── api/
│   ├── auth/                # Authentication routes
│   │   ├── login/route.ts
│   │   ├── signup/route.ts
│   │   └── logout/route.ts
│   ├── hotels/              # Hotels API
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── bookings/            # Bookings API
│   │   └── route.ts
│   └── payments/            # Payment routes
│       ├── checkout-session/route.ts
│       └── webhook/route.ts
├── checkout/page.tsx        # Checkout page with payment
├── hotels/page.tsx          # Hotel listing page
├── hotels/[id]/page.tsx     # Hotel detail page
├── bookings/page.tsx        # My bookings page
├── login/page.tsx           # Login page
├── signup/page.tsx          # Signup page
└── page.tsx                 # Home page

components/
├── header.tsx               # Main navigation header
├── footer.tsx               # Footer component
├── hotel-card.tsx           # Hotel card component
└── stripe-payment.tsx       # Stripe payment component

lib/
├── db.ts                    # Database connection and types
├── auth.ts                  # Authentication utilities
└── utils.ts                 # Utility functions
```

## API Endpoints

### Hotels
- `GET /api/hotels` - Get all hotels with pagination
- `GET /api/hotels/[id]` - Get hotel details with rooms and reviews

### Bookings
- `GET /api/bookings` - Get user's bookings (requires auth)
- `POST /api/bookings` - Create a new booking (requires auth)

### Authentication
- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Payments
- `POST /api/payments/checkout-session` - Create Stripe checkout session
- `POST /api/payments/webhook` - Handle Stripe webhooks

## Deployment

### Deploy to Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel project settings
3. Deploy automatically on push to main branch

```bash
# Or deploy manually
pnpm build
pnpm start
```

## Security Notes

- All passwords are hashed with bcrypt (10 rounds)
- Session tokens are stored as HTTP-only cookies
- CSRF protection via same-site cookies
- SQL injection prevention via parameterized queries
- PCI compliance through Stripe for payments
- Row-level security can be enabled in Neon for multi-tenant scenarios

## Future Enhancements

- Email notifications for bookings and confirmations
- Review system for guests to rate hotels
- Advanced search filters (amenities, price range, ratings)
- Wishlist/favorites functionality
- Multi-currency support
- Real-time availability updates
- Guest messaging system
- Integration with mapping APIs (Google Maps, Mapbox)

## Support

For issues or questions, please create an issue in the repository or contact the development team.

## License

MIT
