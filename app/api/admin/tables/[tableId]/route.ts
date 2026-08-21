// app/api/admin/table/[tableId]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager, requireAdmin } from '@/lib/auth'
import { logManagerAction } from '@/lib/manager-log'

interface RouteParams {
  params: Promise<{ tableId: string }>
}

// =======================================
// PUT: Update table (Admin)
// =======================================
export async function PUT(
  req: NextRequest,
  { params }: RouteParams
) {
  const auth = await requireManager()
  if (!auth.ok) return auth.response

  try {
    const { tableId } = await params

    if (!tableId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Table ID is required',
        },
        { status: 400 }
      )
    }

    const body = await req.json()

    const tableNo =
      typeof body.tableNo === 'string'
        ? body.tableNo.trim()
        : undefined

    const capacity =
      body.capacity !== undefined
        ? Number(body.capacity)
        : undefined

    const status =
      typeof body.status === 'string'
        ? body.status
        : undefined

    // Check table exists
    const existingTable = await prisma.table.findUnique({
      where: {
        id: tableId,
      },
    })

    if (!existingTable) {
      return NextResponse.json(
        {
          success: false,
          error: 'Table not found',
        },
        { status: 404 }
      )
    }

    // Prevent duplicate table number
    if (tableNo) {
      const duplicateTable = await prisma.table.findFirst({
        where: {
          tableNo,
          NOT: {
            id: tableId,
          },
        },
      })

      if (duplicateTable) {
        return NextResponse.json(
          {
            success: false,
            error: 'Table number already exists',
          },
          { status: 409 }
        )
      }
    }

    // Update table
    const updatedTable = await prisma.table.update({
      where: {
        id: tableId,
      },
      data: {
        ...(tableNo && { tableNo }),
        ...(capacity !== undefined && { capacity }),
        ...(status && { status }),
      },
    })

    await logManagerAction(auth.user.id, 'UPDATE_TABLE', {
      metadata: { tableId, changes: { tableNo, capacity, status } },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Table updated successfully',
        table: updatedTable,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[ADMIN_TABLE_PUT_ERROR]', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update table',
      },
      { status: 500 }
    )
  }
}

// =======================================
// DELETE: Delete table (Admin)
// =======================================
export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { tableId } = await params

    if (!tableId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Table ID is required',
        },
        { status: 400 }
      )
    }

    // Check table exists
    const existingTable = await prisma.table.findUnique({
      where: {
        id: tableId,
      },
    })

    if (!existingTable) {
      return NextResponse.json(
        {
          success: false,
          error: 'Table not found',
        },
        { status: 404 }
      )
    }

    const bookingCount = await prisma.booking.count({ where: { tableId } })
    if (bookingCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Table has ${bookingCount} booking(s) in its history and cannot be deleted. Set its status to MAINTENANCE instead.`,
        },
        { status: 409 }
      )
    }

    // Delete table
    await prisma.table.delete({
      where: {
        id: tableId,
      },
    })

    await logManagerAction(auth.user.id, 'DELETE_TABLE', {
      metadata: { tableId, tableNo: existingTable.tableNo },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Table deleted successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[ADMIN_TABLE_DELETE_ERROR]', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete table',
      },
      { status: 500 }
    )
  }
}