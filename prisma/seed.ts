import 'dotenv/config'
import { PrismaClient, UserRole, RoomStatus, BookingStatus, PaymentStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcryptjs'

// Prisma 7 requires a driver adapter; a bare `new PrismaClient()` throws.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  console.log('🌱 Starting database seed...')

  // Hash password
  const hashedPassword = await bcrypt.hash('password123', 10)

  // ✅ Create sample users
  const user1 = await prisma.user.upsert({
    where: { email: 'user1@example.com' },
    update: {},
    create: {
      email: 'user1@example.com',
      name: 'John Doe',
      passwordHash: hashedPassword,
      role: UserRole.GUEST,
      isAdmin: false,
      emailVerified: true,
    },
  })

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@example.com' },
    update: {},
    create: {
      email: 'user2@example.com',
      name: 'Jane Smith',
      passwordHash: hashedPassword,
      role: UserRole.GUEST,
      isAdmin: false,
      emailVerified: true,
    },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      passwordHash: hashedPassword,
      role: UserRole.ADMIN,
      isAdmin: true,
      emailVerified: true,
    },
  })

  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      name: 'Front Desk Manager',
      passwordHash: hashedPassword,
      role: UserRole.HOTEL_MANAGER,
      isAdmin: false,
      emailVerified: true,
      invitedById: admin.id,
      invitedAt: new Date(),
    },
  })

  console.log('✅ Created users:', {
    user1: user1.email,
    user2: user2.email,
    manager: manager.email,
    admin: admin.email,
  })

  // ✅ Create sample rooms
  const room1 = await prisma.room.create({
    data: {
      roomNo: '101',
      name: 'Deluxe Double Room',
      description: 'Spacious room with city view and premium amenities',
      type: 'Double',
      acType: 'AC',
      capacity: 2,
      price: 2500,
      weekendPrice: 3000,
      peakPrice: 3500,
      eventPrice: 4500,
      amenities: ['WiFi', 'AC', 'TV', 'Bathroom', 'Mini Bar'],
      photos: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32'],
      status: RoomStatus.AVAILABLE,
    },
  })

  const room2 = await prisma.room.create({
    data: {
      roomNo: '102',
      name: 'Luxury Suite',
      description: 'Premium suite with living area and stunning views',
      type: 'Suite',
      acType: 'AC',
      capacity: 4,
      price: 5000,
      amenities: ['WiFi', 'AC', 'TV', 'Bathroom', 'Living Area', 'Kitchenette'],
      photos: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b'],
      status: RoomStatus.AVAILABLE,
    },
  })

  const room3 = await prisma.room.create({
    data: {
      roomNo: '103',
      name: 'Standard Single Room',
      description: 'Comfortable room perfect for solo travelers',
      type: 'Single',
      acType: 'NON_AC',
      capacity: 1,
      price: 1500,
      amenities: ['WiFi', 'TV', 'Bathroom'],
      photos: ['https://images.unsplash.com/photo-1590490360182-c33d57733427'],
      status: RoomStatus.AVAILABLE,
    },
  })

  const room4 = await prisma.room.create({
    data: {
      roomNo: '201',
      name: 'Family Room',
      description: 'Large room suitable for families with children',
      type: 'Family',
      acType: 'AC',
      capacity: 5,
      price: 4000,
      amenities: ['WiFi', 'AC', 'TV', 'Bathroom', 'Extra Beds'],
      photos: ['https://images.unsplash.com/photo-1566665797739-1674de7a421a'],
      status: RoomStatus.AVAILABLE,
    },
  })

  const room5 = await prisma.room.create({
    data: {
      roomNo: '202',
      name: 'Economy Double Room',
      description: 'Budget-friendly room with essential amenities',
      type: 'Double',
      acType: 'NON_AC',
      capacity: 2,
      price: 1800,
      amenities: ['WiFi', 'Fan', 'TV', 'Bathroom'],
      photos: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304'],
      status: RoomStatus.AVAILABLE,
    },
  })

  const room6 = await prisma.room.create({
    data: {
      roomNo: '203',
      name: 'Presidential Suite',
      description: 'Ultimate luxury with panoramic views and exclusive services',
      type: 'Suite',
      acType: 'AC',
      capacity: 6,
      price: 10000,
      amenities: ['WiFi', 'AC', 'TV', 'Bathroom', 'Living Area', 'Dining Area', 'Jacuzzi', 'Butler Service'],
      photos: ['https://images.unsplash.com/photo-1629140727571-9b5c6f6267b4'],
      status: RoomStatus.AVAILABLE,
    },
  })

  console.log('✅ Created 6 rooms')

  // ✅ Create sample tables
  const table1 = await prisma.table.create({
    data: {
      tableNo: 'T-01',
      capacity: 2,
      location: 'Window Side',
      status: 'AVAILABLE',
    },
  })

  const table2 = await prisma.table.create({
    data: {
      tableNo: 'T-02',
      capacity: 4,
      location: 'Garden View',
      status: 'AVAILABLE',
    },
  })

  const table3 = await prisma.table.create({
    data: {
      tableNo: 'T-03',
      capacity: 6,
      location: 'VIP Section',
      status: 'AVAILABLE',
    },
  })

  const table4 = await prisma.table.create({
    data: {
      tableNo: 'T-04',
      capacity: 4,
      location: 'Main Hall',
      status: 'AVAILABLE',
    },
  })

  console.log('✅ Created 4 tables')

  // ✅ Pricing & policy configuration (Admin → Settings / Room Types & Pricing)
  await prisma.hotelSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })
  await prisma.peakSeason.create({
    data: { name: 'Diwali week', startDate: new Date('2026-11-06T00:00:00Z'), endDate: new Date('2026-11-12T00:00:00Z') },
  })
  await prisma.specialDate.upsert({
    where: { date: new Date('2026-12-31T00:00:00Z') },
    update: {},
    create: { name: "New Year's Eve", date: new Date('2026-12-31T00:00:00Z') },
  })
  console.log('✅ Created pricing settings, a peak season and an event date')

  // ✅ Create sample room booking
  const roomBooking1 = await prisma.booking.create({
    data: {
      type: 'ROOM',
      userId: user1.id,
      roomId: room1.id,
      checkInDate: new Date('2026-06-15'),
      checkOutDate: new Date('2026-06-18'),
      guestCount: 2,
      guestName: 'John Doe',
      guestEmail: 'user1@example.com',
      guestPhone: '+919876543210',
      specialRequest: 'Late check-in please',
      source: 'ONLINE',
      paymentMode: 'ONLINE',
      addOns: ['BREAKFAST'],
      baseAmount: 7500,
      roomAmount: 7500,
      addOnsAmount: 2100, // breakfast: ₹350 x 3 nights x 2 guests
      totalPrice: 9600,
      // Paid the 50% advance online; balance due at check-in.
      paymentRule: 'STANDARD_ADVANCE',
      advanceAmount: 4800,
      paidAmount: 4800,
      remainingAmount: 4800,
      assignedRoomNo: '101',
      confirmedAt: new Date(),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
      payments: {
        create: {
          kind: 'ADVANCE', status: 'SUCCEEDED', mode: 'ONLINE', amount: 4800,
          gateway: 'MOCK', gatewayOrderId: 'mock_order_seed_1', gatewayPaymentId: 'mock_pay_seed_1',
          paidAt: new Date(),
        },
      },
    },
  })

  // ✅ Create sample table booking
  const tableBooking1 = await prisma.booking.create({
    data: {
      type: 'TABLE',
      userId: user2.id,
      tableId: table2.id,
      bookingDate: new Date('2026-06-10T19:00:00'),
      guestCount: 4,
      guestName: 'Jane Smith',
      guestEmail: 'user2@example.com',
      guestPhone: '+919876543211',
      specialRequest: 'Birthday celebration',
      source: 'ONLINE',
      paymentMode: 'ONLINE',
      baseAmount: 2000,
      tableAmount: 2000,
      tableGuestCount: 4,
      totalPrice: 2000, // 4 guests x ₹500
      // Table reservations are paid in full online.
      paymentRule: 'TABLE_FULL',
      advanceAmount: 2000,
      paidAmount: 2000,
      remainingAmount: 0,
      confirmedAt: new Date(),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      payments: {
        create: {
          kind: 'FULL', status: 'SUCCEEDED', mode: 'ONLINE', amount: 2000,
          gateway: 'MOCK', gatewayOrderId: 'mock_order_seed_2', gatewayPaymentId: 'mock_pay_seed_2',
          paidAt: new Date(),
        },
      },
    },
  })

  // ✅ Walk-in booking, created at the front desk by the manager
  const walkInGuest = await prisma.user.upsert({
    where: { email: 'walkin.guest@example.com' },
    update: {},
    create: {
      email: 'walkin.guest@example.com',
      name: 'Ramesh Kumar',
      phone: '+919812345678',
      role: UserRole.GUEST,
      emailVerified: false,
    },
  })

  const walkInBooking = await prisma.booking.create({
    data: {
      type: 'ROOM',
      userId: walkInGuest.id,
      roomId: room3.id,
      checkInDate: new Date('2026-06-12'),
      checkOutDate: new Date('2026-06-14'),
      guestCount: 1,
      guestName: 'Ramesh Kumar',
      guestEmail: 'walkin.guest@example.com',
      guestPhone: '+919812345678',
      source: 'WALK_IN',
      bookedById: manager.id,
      paymentMode: 'CASH',
      baseAmount: 3000,
      roomAmount: 3000,
      totalPrice: 3000, // 2 nights x ₹1500
      paymentRule: 'DESK',
      advanceAmount: 3000,
      paidAmount: 3000,
      remainingAmount: 0,
      assignedRoomNo: room3.roomNo,
      confirmedAt: new Date(),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      payments: {
        create: {
          kind: 'FULL', status: 'SUCCEEDED', mode: 'CASH', amount: 3000,
          gateway: 'DESK', recordedById: manager.id, paidAt: new Date(),
        },
      },
    },
  })

  await prisma.managerAction.create({
    data: {
      managerId: manager.id,
      bookingId: walkInBooking.id,
      action: 'CREATE_BOOKING',
      notes: 'Walk-in guest, paid cash at the desk',
      metadata: { source: 'WALK_IN', paymentMode: 'CASH', totalPrice: 3000 },
    },
  })

  console.log('✅ Created sample bookings:', {
    roomBooking: roomBooking1.id,
    tableBooking: tableBooking1.id,
    walkInBooking: walkInBooking.id,
  })

  console.log('🎉 Database seed completed successfully!')
  console.log('\n📋 Summary:')
  console.log('- 5 Users (2 guests + 1 walk-in guest + 1 manager + 1 admin)')
  console.log('- 6 Rooms (various types and prices)')
  console.log('- 4 Tables (different capacities)')
  console.log('- 3 Bookings (1 online room + 1 online table + 1 walk-in room)')
  console.log('\n🔐 Login credentials:')
  console.log('User 1: user1@example.com / password123')
  console.log('User 2: user2@example.com / password123')
  console.log('Manager: manager@example.com / password123')
  console.log('Admin: admin@example.com / password123')
}

main()
  .then(async () => {
    await prisma.$disconnect()
    console.log('✅ Database connection closed')
  })
  .catch(async (e) => {
    console.error('❌ Seed error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })