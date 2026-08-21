// app/api/admin/table/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'

// ==============================
// GET: List all tables (Admin)
// ==============================
export async function GET() {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const tables = await prisma.table.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(
      {
        success: true,
        tables: tables.map((table) => ({
          id: table.id,
          tableNo: table.tableNo,
          capacity: table.capacity,
          status: table.status,
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
        })),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[ADMIN_TABLE_GET_ERROR]', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load tables',
      },
      { status: 500 }
    )
  }
}

// ==============================
// POST: Create new table (Admin)
// ==============================
export async function POST(req: NextRequest) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()

    const tableNo =
      typeof body.tableNo === 'string'
        ? body.tableNo.trim()
        : ''

    const capacity = Number(body.capacity)

    const status =
      typeof body.status === 'string'
        ? body.status
        : 'AVAILABLE'

    // Validation
    if (!tableNo) {
      return NextResponse.json(
        {
          success: false,
          error: 'tableNo is required',
        },
        { status: 400 }
      )
    }

    if (!capacity || capacity <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Valid capacity is required',
        },
        { status: 400 }
      )
    }

    // Check duplicate table number
    const existingTable = await prisma.table.findUnique({
      where: {
        tableNo,
      },
    })

    if (existingTable) {
      return NextResponse.json(
        {
          success: false,
          error: 'Table number already exists',
        },
        { status: 409 }
      )
    }

    // Create table
    const table = await prisma.table.create({
      data: {
        tableNo,
        capacity,
        status,
      },
    })

    await logManagerAction(auth.user.id, 'CREATE_TABLE', {
      metadata: { tableId: table.id, tableNo: table.tableNo, capacity: table.capacity },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Table created successfully',
        table,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[ADMIN_TABLE_POST_ERROR]', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create table',
      },
      { status: 500 }
    )
  }
}