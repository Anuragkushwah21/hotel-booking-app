import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    // ✅ Await params first
    const { roomId } = await params


    if (!roomId || roomId === 'undefined') {
      return NextResponse.json(
        { error: 'Room ID is required' },
        { status: 400 }
      )
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
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
        createdAt: true,
        updatedAt: true,
      },
    })


    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ room }, { status: 200 })
  } catch (error) {
    console.error('❌ [rooms/roomId] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch room details' },
      { status: 500 }
    )
  }
}