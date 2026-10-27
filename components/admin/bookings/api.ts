/**
 * Thin fetch wrapper for the booking-operations UI: parses JSON, and turns any
 * non-2xx into an Error carrying the route's `{ error }` message so callers can
 * drop it straight into a destructive toast.
 */
export async function api<T = any>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      body?.error ||
      (Array.isArray(body?.issues) && body.issues[0]?.message) ||
      `Request failed (${res.status})`
    const err = new Error(message) as Error & { status?: number; body?: any }
    err.status = res.status
    err.body = body
    throw err
  }
  return body as T
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error')

// ---------------------------------------------------------------------------
// Shapes returned by the admin routes (only the fields the UI reads)
// ---------------------------------------------------------------------------

export type TransferStatus = 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED'
export type TransferMode = 'FLIGHT' | 'TRAIN' | 'OTHER'

export type TransferLeg = {
  mode: TransferMode
  number?: string | null
  at: string
  location: string
  passengers?: number | null
  notes?: string | null
  driverName?: string | null
  driverPhone?: string | null
  vehicleNo?: string | null
  status?: TransferStatus
}

export type TransferDetails = { pickup?: TransferLeg | null; drop?: TransferLeg | null }

export type PaymentRow = {
  id: string
  bookingId: string
  kind: 'ADVANCE' | 'BALANCE' | 'FULL' | 'REFUND'
  status: 'CREATED' | 'SUCCEEDED' | 'FAILED'
  mode: 'ONLINE' | 'CASH' | 'CARD' | 'UPI'
  amount: number
  gateway: string
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  notes: string | null
  failureReason: string | null
  paidAt: string | null
  createdAt: string
  recordedBy: { name: string | null; email: string } | null
}

export type BookingDetail = {
  id: string
  reference: string
  type: 'ROOM' | 'TABLE' | 'ROOM_TABLE'
  source: 'ONLINE' | 'WALK_IN'
  status: string
  paymentStatus: string
  paymentMode: string
  refundStatus: string
  roomId: string | null
  assignedRoomNo: string | null
  guestName: string
  guestEmail: string
  guestPhone: string | null
  guestCount: number
  specialRequest: string | null
  adminNotes: string | null
  addOns: string[]
  transferDetails: TransferDetails | null
  checkInDate: string | null
  checkOutDate: string | null
  bookingDate: string | null
  totalPrice: number
  paidAmount: number
  remainingAmount: number
  refundAmount: number
  cancelReason: string | null
  room: { id: string; name: string; roomNo: string; price: number } | null
  table: { id: string; tableNo: string; location: string | null } | null
  payments: PaymentRow[]
}

export type RefundPreview = {
  eligible: boolean
  percent: number
  amount: number
  hoursBefore: number | null
  tier: 'EARLY' | 'LATE' | 'NONE'
  message: string
}

export type BookingDetailPayload = {
  booking: BookingDetail
  refundPreview: RefundPreview | null
}

export const KIND_LABEL: Record<string, string> = {
  ADVANCE: 'Advance',
  BALANCE: 'Balance',
  FULL: 'Full',
  REFUND: 'Refund',
}

export const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : '—'

export const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—'
