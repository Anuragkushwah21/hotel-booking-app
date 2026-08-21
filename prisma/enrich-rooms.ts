/**
 * Fills in photos, amenities and descriptions for rooms that have none.
 *
 * Purely additive: rooms that already have a photo or a description are left
 * untouched, so it is safe to re-run. Content is matched loosely by room type
 * (suite / deluxe / everything else).
 *
 *   npx tsx prisma/enrich-rooms.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Prisma 7 requires a driver adapter; a bare `new PrismaClient()` throws.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const PRESETS = {
  suite: {
    photos: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1600&q=80',
      'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=1600&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&q=80',
    ],
    amenities: ['WiFi', 'AC', 'TV', 'Bathroom', 'Living Area', 'Mini Bar', 'Work Desk', 'Balcony'],
    description:
      'A generous suite with a separate living area, a king bed and a wide window seat looking over the courtyard. Ideal for longer stays.',
  },
  deluxe: {
    photos: [
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1600&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1600&q=80',
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1600&q=80',
    ],
    amenities: ['WiFi', 'AC', 'TV', 'Bathroom', 'Mini Bar', 'Work Desk'],
    description:
      'A bright, comfortable room with a queen bed, a proper work desk and a rain shower. Quiet side of the building.',
  },
  standard: {
    photos: [
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1600&q=80',
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1600&q=80',
    ],
    amenities: ['WiFi', 'TV', 'Bathroom', 'Work Desk'],
    description:
      'A neat, well-sized room with everything you need for a short stay — comfortable bed, fast Wi-Fi and a clean private bathroom.',
  },
}

function presetFor(type: string | null, name: string) {
  const hay = `${type ?? ''} ${name}`.toLowerCase()
  if (hay.includes('suite') || hay.includes('presidential')) return PRESETS.suite
  if (hay.includes('delux') || hay.includes('luxury')) return PRESETS.deluxe
  return PRESETS.standard
}

async function main() {
  const rooms = await prisma.room.findMany()
  let touched = 0

  for (const room of rooms) {
    const needsPhotos = room.photos.length === 0
    const needsAmenities = room.amenities.length === 0
    const needsDescription = !room.description

    if (!needsPhotos && !needsAmenities && !needsDescription) {
      console.log(`  skip  ${room.roomNo} — already has content`)
      continue
    }

    const preset = presetFor(room.type, room.name)
    await prisma.room.update({
      where: { id: room.id },
      data: {
        ...(needsPhotos && { photos: preset.photos }),
        ...(needsAmenities && { amenities: preset.amenities }),
        ...(needsDescription && { description: preset.description }),
      },
    })
    touched++
    console.log(
      `  fill  ${room.roomNo} — ${[
        needsPhotos && `${preset.photos.length} photos`,
        needsAmenities && `${preset.amenities.length} amenities`,
        needsDescription && 'description',
      ].filter(Boolean).join(', ')}`,
    )
  }

  console.log(`\nDone. ${touched} of ${rooms.length} room(s) updated.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
