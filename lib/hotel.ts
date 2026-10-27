/**
 * Single source of truth for everything about the property itself.
 *
 * This is a single-hotel application, so the profile lives in config rather
 * than the database — edit this file to change what the public site says.
 * Room inventory and bookings stay in Postgres; only the marketing/­static
 * content is here.
 */

export const HOTEL = {
  name: 'HotelBook Grand',
  tagline: 'Where every stay feels like coming home',
  shortAbout:
    'A boutique property in the heart of the city, pairing warm Indian hospitality with the quiet comfort of a modern hotel.',
  about: [
    'HotelBook Grand has hosted travellers, families and business guests for over a decade. Twenty-four thoughtfully appointed rooms, a multi-cuisine restaurant, and a team that remembers how you take your chai.',
    'We are five minutes from the business district and a short drive from the old city, which makes us equally suited to a working week or a weekend of wandering.',
  ],

  contact: {
    addressLines: ['12 Residency Road', 'Civil Lines', 'Jaipur, Rajasthan 302006'],
    phone: '+91 141 400 1200',
    whatsapp: '+91 98290 00000',
    email: 'stay@hotelbook.example',
    mapQuery: 'Civil Lines, Jaipur, Rajasthan',
  },

  policies: {
    checkIn: '2:00 PM',
    checkOut: '11:00 AM',
    items: [
      'Government-issued photo ID is required for all guests at check-in.',
      'Children under 6 stay free when sharing the existing bedding.',
      'Cancellation and refunds follow the policy shown at checkout and on your booking.',
      'Pets are welcome in ground-floor rooms on request.',
      'The property is entirely non-smoking; smoking is permitted in the courtyard.',
    ],
  },

  /** Included with every stay — not billable, purely informational. */
  facilities: [
    { icon: 'Wifi', label: 'High-speed Wi-Fi', note: 'Free across the property' },
    { icon: 'Car', label: 'Free parking', note: 'Valet available on request' },
    { icon: 'Dumbbell', label: 'Fitness centre', note: 'Open 6 AM – 10 PM' },
    { icon: 'Waves', label: 'Outdoor pool', note: 'Open 7 AM – 8 PM' },
    { icon: 'ConciergeBell', label: '24×7 front desk', note: 'Round-the-clock assistance' },
    { icon: 'UtensilsCrossed', label: 'Multi-cuisine restaurant', note: 'Breakfast to late dinner' },
    { icon: 'Shirt', label: 'Laundry & pressing', note: 'Same-day service' },
    { icon: 'Snowflake', label: 'Air conditioning', note: 'In every room' },
    { icon: 'ShieldCheck', label: 'CCTV & 24×7 security', note: 'Monitored entrances' },
    { icon: 'Briefcase', label: 'Business centre', note: 'Meeting room for 12' },
    { icon: 'Accessibility', label: 'Step-free access', note: 'Lift to all floors' },
    { icon: 'Baby', label: 'Family friendly', note: 'Cots and high chairs' },
  ],

  dining: {
    name: 'The Courtyard',
    blurb:
      'Our all-day restaurant serves North Indian classics alongside a short continental menu. Tables can be reserved online, whether or not you are staying with us.',
    hours: [
      { label: 'Breakfast', time: '7:00 AM – 10:30 AM' },
      { label: 'Lunch', time: '12:30 PM – 3:00 PM' },
      { label: 'Dinner', time: '7:00 PM – 11:00 PM' },
    ],
    highlights: ['Live counters at breakfast', 'Vegetarian & Jain menus', 'Private dining for 12'],
  },

  gallery: [
    { url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80', caption: 'The facade at dusk' },
    { url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200&q=80', caption: 'Deluxe room' },
    { url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80', caption: 'Suite living area' },
    { url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80', caption: 'The Courtyard restaurant' },
    { url: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=80', caption: 'Outdoor pool' },
    { url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&q=80', caption: 'Lobby lounge' },
  ],

  testimonials: [
    {
      name: 'Priya Sharma',
      city: 'Mumbai',
      rating: 5,
      quote:
        'The staff remembered our anniversary and left a cake in the room. Spotless, quiet, and the breakfast spread is genuinely excellent.',
    },
    {
      name: 'Rahul Verma',
      city: 'Delhi',
      rating: 5,
      quote:
        'Stayed four nights for work. Fast Wi-Fi, a proper desk, and the airport pickup was waiting exactly on time.',
    },
    {
      name: 'Anjali Nair',
      city: 'Bengaluru',
      rating: 4,
      quote:
        'Lovely property with a warm feel. The pool is small but very well kept, and the restaurant is worth staying in for.',
    },
  ],

  faq: [
    {
      q: 'What are the check-in and check-out times?',
      a: 'Check-in opens at 2:00 PM and check-out is 11:00 AM. Early check-in and late checkout are subject to availability — late checkout can be added to your booking as a paid extra.',
    },
    {
      q: 'Can I add breakfast or an airport pickup to my booking?',
      a: 'Yes. Every paid extra is offered on the room page while you book, and the total updates as you select them. You can also ask the front desk to add them later.',
    },
    {
      q: 'Do I need an account to book?',
      a: 'Yes — booking requires a verified account so you can view and manage your reservations afterwards. Signing up takes under a minute.',
    },
    {
      q: 'Is the restaurant open to non-residents?',
      a: 'Absolutely. The Courtyard takes table reservations from anyone; you do not need a room booking to reserve a table.',
    },
    {
      q: 'What is your cancellation policy?',
      a: 'Free cancellation up to 24 hours before check-in. Cancellations after that may be charged one night, at the front desk’s discretion.',
    },
  ],
} as const

/** Placeholder used wherever a room has no photograph uploaded yet. */
export const ROOM_PLACEHOLDER =
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80'

/** Icon name → label, for amenity chips coming out of the database. */
export const AMENITY_LABELS: Record<string, string> = {
  WiFi: 'Wi-Fi',
  AC: 'Air conditioning',
  TV: 'Television',
  Bathroom: 'Private bathroom',
  'Mini Bar': 'Mini bar',
  'Living Area': 'Living area',
  Kitchenette: 'Kitchenette',
  'Extra Beds': 'Extra beds',
  Fan: 'Ceiling fan',
  Jacuzzi: 'Jacuzzi',
  'Butler Service': 'Butler service',
  'Dining Area': 'Dining area',
}
