import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    
    // Optional filters
    const acType = searchParams.get('acType') // AC or NON_AC
    const minCapacity = searchParams.get('minCapacity')
    const maxPrice = searchParams.get('maxPrice')
    const minPrice = searchParams.get('minPrice')
    const type = searchParams.get('type') // Deluxe, Suite, etc.

    // Build where clause
    const where: any = {
      status: 'AVAILABLE', // Only show available rooms
    }

    if (acType) {
      where.acType = acType
    }

    if (minCapacity) {
      where.capacity = {
        gte: parseInt(minCapacity),
      }
    }

    if (type) {
      where.type = {
        contains: type,
        mode: 'insensitive',
      }
    }

    if (minPrice || maxPrice) {
      where.price = {}
      if (minPrice) where.price.gte = parseFloat(minPrice)
      if (maxPrice) where.price.lte = parseFloat(maxPrice)
    }

    // Fetch rooms
    const rooms = await prisma.room.findMany({
      where,
      orderBy: {
        price: 'asc',
      },
      select: {
        id: true,
        roomNo: true,
        name: true,
        type: true,
        acType: true,
        capacity: true,
        price: true,
        status: true,
        description: true,
        photos: true,
        amenities: true,
      },
    })

    return NextResponse.json(
      {
        rooms,
        total: rooms.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[rooms] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    )
  }
}