'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft, Ban, CircleAlert, CircleCheck, FileText, IndianRupee,
  RefreshCw, UserX, XCircle,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  PaymentBadge, RefundBadge, SourceBadge, StatusBadge, TypeBadge,
} from '@/components/admin/booking-badges'
import { ErrorState, SkeletonBlock, inr } from '@/components/admin/ui'
import { useToast } from '@/hooks/use-toast'
import { checkInInstant, dateKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  api, errMsg, fmtDate, fmtDateTime, KIND_LABEL,
  type BookingDetail, type BookingDetailPayload,
} from './api'
import { TransferLegs } from './transfer-legs'

export type DrawerPanel = 'cancel' | 'transfer' | 'noshow' | null

const INVOICE_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']
const CLOSED_STATUSES = ['CANCELLED', 'CHECKED_OUT', 'NO_SHOW']

function serviceStart(b: BookingDetail): Date | null {
  if ((b.type === 'ROOM' || b.type === 'ROOM_TABLE') && b.checkInDate) return checkInInstant(b.checkInDate)
  return b.bookingDate ? new Date(b.bookingDate) : null
}

/**
 * Side drawer (full-screen on phones) with everything the desk does to one
 * booking: money in, pickup/drop logistics, room moves, no-shows, cancellation.
 * Every mutation re-fetches the booking and tells the list to refresh.
 */
export function BookingDetailDrawer({
  bookingId,
  initialPanel = null,
  onClose,
  onChanged,
}: {
  bookingId: string | null
  initialPanel?: DrawerPanel
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<BookingDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [panel, setPanel] = useState<DrawerPanel>(null)

  const load = useCallback(async () => {
    if (!bookingId) return
    setLoading(true)
    try {
      setData(await api<BookingDetailPayload>(`/api/admin/bookings/${bookingId}`))
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    setData(null)
    setPanel(initialPanel)
    load()
  }, [load, initialPanel])

  const changed = useCallback(async () => {
    setPanel(null)
    await load()
    onChanged()
  }, [load, onChanged])

  const b = data?.booking

  return (
    <Dialog open={!!bookingId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0',
          'overflow-y-auto rounded-none border-y-0 border-r-0 p-0 sm:max-w-xl',
        )}
      >
        <div className="sticky top-0 z-10 border-b border-border/70 bg-background px-4 py-3 pr-10 sm:px-5">
          <DialogTitle className="text-base">
            {b ? b.guestName : 'Booking'}
          </DialogTitle>
          {b && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold tracking-wider">{b.reference}</span>
              <StatusBadge status={b.status} />
              <PaymentBadge status={b.paymentStatus} mode={b.paymentMode} />
              <RefundBadge status={b.refundStatus} />
            </div>
          )}
        </div>

        <div className="space-y-5 px-4 py-4 sm:px-5">
          {error && <ErrorState message={error} />}
          {!b && loading && (
            <div className="space-y-3">
              <SkeletonBlock className="h-20 w-full" />
              <SkeletonBlock className="h-32 w-full" />
              <SkeletonBlock className="h-24 w-full" />
            </div>
          )}

          {b && (
            <>
              <Summary b={b} />
              <ActionBar b={b} panel={panel} setPanel={setPanel} />

              {panel === 'cancel' && (
                <CancelPanel b={b} preview={data?.refundPreview ?? null} onDone={changed} onClose={() => setPanel(null)} />
              )}
              {panel === 'noshow' && (
                <NoShowPanel b={b} onDone={changed} onClose={() => setPanel(null)} />
              )}
              {panel === 'transfer' && (
                <RoomTransferPanel b={b} onDone={changed} onClose={() => setPanel(null)} />
              )}

              <Section title="Payments">
                <PaymentsLedger b={b} />
                {b.remainingAmount > 0 && !CLOSED_STATUSES.includes(b.status) && (
                  <DeskPaymentForm b={b} onDone={changed} />
                )}
              </Section>

              {(b.transferDetails?.pickup || b.transferDetails?.drop ||
                b.addOns.includes('AIRPORT_PICKUP') || b.addOns.includes('AIRPORT_DROP')) && (
                <Section title="Pickup & drop">
                  <TransferLegs booking={b} onChanged={changed} />
                </Section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Summary({ b }: { b: BookingDetail }) {
  const hasRoom = b.type === 'ROOM' || b.type === 'ROOM_TABLE'
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border/70 p-3 text-sm">
      <div className="col-span-2 flex flex-wrap items-center gap-1.5">
        <TypeBadge type={b.type} />
        <SourceBadge source={b.source} />
        <span className="text-xs text-muted-foreground">{b.guestCount} pax</span>
      </div>
      <Info label="Contact" value={<>{b.guestEmail}{b.guestPhone && <><br />{b.guestPhone}</>}</>} className="col-span-2 sm:col-span-1" />
      {hasRoom && (
        <Info
          label="Room"
          value={`${b.assignedRoomNo ?? b.room?.roomNo ?? '—'}${b.room ? ` · ${b.room.name}` : ''}`}
        />
      )}
      {b.table && <Info label="Table" value={b.table.tableNo} />}
      {hasRoom && <Info label="Stay" value={`${fmtDate(b.checkInDate)} → ${fmtDate(b.checkOutDate)}`} />}
      {b.bookingDate && <Info label="Table slot" value={fmtDateTime(b.bookingDate)} />}
      <Info label="Total" value={inr(b.totalPrice)} />
      <Info label="Paid" value={inr(b.paidAmount)} />
      <Info
        label="Balance due"
        value={<span className={b.remainingAmount > 0 ? 'font-medium text-orange-700' : ''}>{inr(b.remainingAmount)}</span>}
      />
      {b.refundAmount > 0 && <Info label="Refund" value={inr(b.refundAmount)} />}
      {b.addOns.length > 0 && (
        <Info label="Add-ons" value={b.addOns.map((a) => a.replace(/_/g, ' ').toLowerCase()).join(', ')} className="col-span-2" />
      )}
      {b.specialRequest && <Info label="Guest request" value={b.specialRequest} className="col-span-2" />}
      {b.cancelReason && <Info label="Cancel reason" value={b.cancelReason} className="col-span-2" />}
    </div>
  )
}

function Info({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="break-words text-foreground">{value}</p>
    </div>
  )
}

function ActionBar({
  b, panel, setPanel,
}: { b: BookingDetail; panel: DrawerPanel; setPanel: (p: DrawerPanel) => void }) {
  const canInvoice = INVOICE_STATUSES.includes(b.status)
  const canTransfer =
    (b.type === 'ROOM' || b.type === 'ROOM_TABLE') && ['CONFIRMED', 'CHECKED_IN'].includes(b.status)
  const canNoShow = b.status === 'CONFIRMED'
  const canCancel = !CLOSED_STATUSES.includes(b.status)
  if (!canInvoice && !canTransfer && !canNoShow && !canCancel) return null

  const toggle = (p: Exclude<DrawerPanel, null>) => setPanel(panel === p ? null : p)

  return (
    <div className="flex flex-wrap gap-2">
      {canInvoice && (
        <Button size="sm" variant="outline" className="h-8" asChild>
          <a href={`/invoice/${b.id}`} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Invoice
          </a>
        </Button>
      )}
      {canTransfer && (
        <Button size="sm" variant={panel === 'transfer' ? 'secondary' : 'outline'} className="h-8" onClick={() => toggle('transfer')}>
          <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
          Move room
        </Button>
      )}
      {canNoShow && (
        <Button size="sm" variant={panel === 'noshow' ? 'secondary' : 'outline'} className="h-8" onClick={() => toggle('noshow')}>
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          No-show
        </Button>
      )}
      {canCancel && (
        <Button
          size="sm" variant={panel === 'cancel' ? 'secondary' : 'outline'}
          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => toggle('cancel')}
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Cancel booking
        </Button>
      )}
    </div>
  )
}

function ActionPanel({
  title, tone = 'default', children,
}: { title: string; tone?: 'default' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-3',
        tone === 'danger' ? 'border-destructive/30 bg-destructive/5' : 'border-border/70 bg-muted/30',
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cancel with refund override
// ---------------------------------------------------------------------------

function CancelPanel({
  b, preview, onDone, onClose,
}: {
  b: BookingDetail
  preview: BookingDetailPayload['refundPreview']
  onDone: () => Promise<void>
  onClose: () => void
}) {
  const { toast } = useToast()
  const policyAmount = preview?.amount ?? 0
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState(String(policyAmount))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const amount = Number(refund)
    if (b.paidAmount > 0 && (!Number.isFinite(amount) || amount < 0 || amount > b.paidAmount)) {
      toast({ title: `Refund must be between ₹0 and ${inr(b.paidAmount)}`, variant: 'destructive' })
      return
    }
    const refundText = b.paidAmount > 0 ? ` with a refund of ${inr(amount)}` : ''
    if (!confirm(`Cancel ${b.reference} for ${b.guestName}${refundText}? This cannot be undone.`)) return

    setBusy(true)
    try {
      const body: Record<string, unknown> = { reason: reason.trim() || null }
      // Only override when staff moved off the policy figure.
      if (b.paidAmount > 0 && amount !== policyAmount) body.refundAmount = amount
      const res = await api<{ message: string }>(`/api/admin/bookings/${b.id}`, { method: 'DELETE', body })
      toast({ title: res.message })
      await onDone()
    } catch (e) {
      toast({ title: 'Cancellation failed', description: errMsg(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ActionPanel title="Cancel booking" tone="danger">
      <div>
        <Label className="text-xs text-muted-foreground">Reason</Label>
        <Textarea rows={2} className="mt-1 min-h-0 bg-background" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Guest called to cancel…" />
      </div>
      {b.paidAmount > 0 ? (
        <div>
          <Label className="text-xs text-muted-foreground">Refund amount (₹0 – {inr(b.paidAmount)} paid)</Label>
          <Input
            type="number" min={0} max={b.paidAmount} className="mt-1 h-9 bg-background"
            value={refund} onChange={(e) => setRefund(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Policy: {preview?.message ?? 'no refund due'}
            {Number(refund) !== policyAmount && (
              <>
                {' '}
                <button type="button" className="underline" onClick={() => setRefund(String(policyAmount))}>
                  Reset to {inr(policyAmount)}
                </button>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The refund is queued as pending and paid out by an admin from Payments.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing has been paid, so no refund is due.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Keep booking</Button>
        <Button size="sm" variant="destructive" onClick={submit} disabled={busy}>
          {busy ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}
          Cancel booking
        </Button>
      </div>
    </ActionPanel>
  )
}

// ---------------------------------------------------------------------------
// No-show
// ---------------------------------------------------------------------------

function NoShowPanel({
  b, onDone, onClose,
}: { b: BookingDetail; onDone: () => Promise<void>; onClose: () => void }) {
  const { toast } = useToast()
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const start = serviceStart(b)
  const [nowMs] = useState(() => Date.now())
  const started = !!start && start.getTime() <= nowMs

  const submit = async () => {
    if (!confirm(`Mark ${b.guestName} (${b.reference}) as a no-show? The booking will be closed.`)) return
    setBusy(true)
    try {
      const res = await api<{ message?: string }>(`/api/admin/bookings/${b.id}/status`, {
        method: 'POST',
        body: { action: 'NO_SHOW', notes: notes.trim() || undefined },
      })
      toast({ title: res.message ?? 'Marked as no-show' })
      await onDone()
    } catch (e) {
      toast({ title: 'Could not mark no-show', description: errMsg(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ActionPanel title="Mark as no-show" tone="danger">
      {!started && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {start
            ? `The ${b.type === 'TABLE' ? 'reservation slot' : 'check-in time'} (${fmtDateTime(start.toISOString())}) hasn't passed yet.`
            : 'This booking has no check-in date or slot.'}
        </p>
      )}
      <div>
        <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
        <Textarea rows={2} className="mt-1 min-h-0 bg-background" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tried calling twice, no answer" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
        <Button size="sm" variant="destructive" onClick={submit} disabled={busy || !started}>
          {busy ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserX className="mr-1.5 h-3.5 w-3.5" />}
          Mark no-show
        </Button>
      </div>
    </ActionPanel>
  )
}

// ---------------------------------------------------------------------------
// Room transfer
// ---------------------------------------------------------------------------

type RoomOption = {
  id: string; roomNo: string; name: string; capacity: number; price: number; status: string
}

function RoomTransferPanel({
  b, onDone, onClose,
}: { b: BookingDetail; onDone: () => Promise<void>; onClose: () => void }) {
  const { toast } = useToast()
  const [rooms, setRooms] = useState<RoomOption[] | null>(null)
  const [roomId, setRoomId] = useState('')
  const [reason, setReason] = useState('')
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'free' | 'busy' | 'error'; message?: string }>({ state: 'idle' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ rooms: RoomOption[] }>('/api/admin/room')
      .then((r) => setRooms(r.rooms))
      .catch((e) => toast({ title: 'Could not load rooms', description: errMsg(e), variant: 'destructive' }))
  }, [toast])

  // A checked-in guest only needs the new room from today onward.
  const stay = useMemo(() => {
    if (!b.checkInDate || !b.checkOutDate) return null
    const today = dateKey(new Date())
    const from = b.status === 'CHECKED_IN' && today > dateKey(b.checkInDate) ? today : dateKey(b.checkInDate)
    return { checkIn: from, checkOut: dateKey(b.checkOutDate) }
  }, [b.checkInDate, b.checkOutDate, b.status])

  useEffect(() => {
    if (!roomId || !stay) {
      setCheck({ state: 'idle' })
      return
    }
    let live = true
    setCheck({ state: 'checking' })
    api<{ available: boolean; message: string }>('/api/rooms/available', {
      method: 'POST',
      body: { roomId, checkInDate: stay.checkIn, checkOutDate: stay.checkOut, excludeBookingId: b.id },
    })
      .then((r) => live && setCheck({ state: r.available ? 'free' : 'busy', message: r.message }))
      .catch((e) => live && setCheck({ state: 'error', message: errMsg(e) }))
    return () => {
      live = false
    }
  }, [roomId, stay, b.id])

  const options = (rooms ?? []).filter((r) => r.id !== b.roomId)
  const target = options.find((r) => r.id === roomId)

  const submit = async () => {
    if (!target) return
    if (!confirm(`Move ${b.guestName} from room ${b.assignedRoomNo ?? b.room?.roomNo ?? '—'} to room ${target.roomNo}?`)) return
    setBusy(true)
    try {
      const res = await api<{ booking: { assignedRoomNo: string | null; totalPrice: number } }>(
        `/api/admin/bookings/${b.id}/transfer`,
        { method: 'POST', body: { roomId, reason: reason.trim() || undefined } },
      )
      const newTotal = res.booking?.totalPrice
      toast({
        title: `Moved to room ${res.booking?.assignedRoomNo ?? target.roomNo}`,
        description: newTotal != null && newTotal !== b.totalPrice
          ? `Total changed ${inr(b.totalPrice)} → ${inr(newTotal)}`
          : undefined,
      })
      await onDone()
    } catch (e) {
      toast({ title: 'Room move failed', description: errMsg(e), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ActionPanel title="Move to another room">
      <div>
        <Label className="text-xs text-muted-foreground">New room</Label>
        <Select value={roomId} onValueChange={setRoomId} disabled={!rooms}>
          <SelectTrigger className="mt-1 h-9 bg-background">
            <SelectValue placeholder={rooms ? 'Choose a room' : 'Loading rooms…'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((r) => (
              <SelectItem key={r.id} value={r.id} disabled={r.status === 'MAINTENANCE'}>
                {r.roomNo} · {r.name} · {r.capacity} pax · {inr(r.price)}
                {r.status === 'MAINTENANCE' ? ' (maintenance)' : ''}
                {r.capacity < b.guestCount ? ' (too small)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {check.state !== 'idle' && (
          <p
            className={cn(
              'mt-1.5 flex items-center gap-1.5 text-xs',
              check.state === 'free' && 'text-emerald-700',
              (check.state === 'busy' || check.state === 'error') && 'text-destructive',
              check.state === 'checking' && 'text-muted-foreground',
            )}
          >
            {check.state === 'checking' && <RefreshCw className="h-3 w-3 animate-spin" />}
            {check.state === 'free' && <CircleCheck className="h-3 w-3" />}
            {(check.state === 'busy' || check.state === 'error') && <CircleAlert className="h-3 w-3" />}
            {check.state === 'checking'
              ? 'Checking availability…'
              : check.message}
            {stay && check.state !== 'checking' && ` (${stay.checkIn} → ${stay.checkOut})`}
          </p>
        )}
        {target && target.price !== b.room?.price && (
          <p className="mt-1 text-xs text-muted-foreground">
            Nightly rate differs ({inr(b.room?.price ?? 0)} → {inr(target.price)}); the total may be repriced.
          </p>
        )}
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
        <Input className="mt-1 h-9 bg-background" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="AC not working" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
        <Button size="sm" onClick={submit} disabled={busy || !target || check.state === 'busy' || check.state === 'checking'}>
          {busy ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />}
          Move guest
        </Button>
      </div>
    </ActionPanel>
  )
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const PAY_STATUS_CLASS: Record<string, string> = {
  SUCCEEDED: 'text-emerald-700',
  FAILED: 'text-rose-700',
  CREATED: 'text-amber-700',
}

function PaymentsLedger({ b }: { b: BookingDetail }) {
  if (!b.payments.length) {
    return <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
  }
  return (
    <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
      {b.payments.map((p) => {
        const refund = p.kind === 'REFUND'
        return (
          <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {KIND_LABEL[p.kind] ?? p.kind}
                <span className="font-normal text-muted-foreground"> · {p.mode.toLowerCase()} · {p.gateway.toLowerCase()}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDateTime(p.paidAt ?? p.createdAt)}
                {p.recordedBy && ` · by ${p.recordedBy.name || p.recordedBy.email}`}
              </p>
              {(p.notes || p.failureReason) && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{p.failureReason || p.notes}</p>
              )}
            </div>
            <div className="flex-shrink-0 text-right">
              <p className={cn('font-medium tabular-nums', refund && 'text-violet-700')}>
                {refund ? '−' : ''}{inr(p.amount)}
              </p>
              <p className={cn('text-[11px] lowercase', PAY_STATUS_CLASS[p.status])}>{p.status}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function DeskPaymentForm({ b, onDone }: { b: BookingDetail; onDone: () => Promise<void> }) {
  const { toast } = useToast()
  const [amount, setAmount] = useState(String(b.remainingAmount))
  const [mode, setMode] = useState<'CASH' | 'CARD' | 'UPI'>('CASH')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setAmount(String(b.remainingAmount)), [b.remainingAmount])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Math.round(Number(amount))
    if (!Number.isFinite(n) || n < 1) {
      toast({ title: 'Enter an amount of at least ₹1', variant: 'destructive' })
      return
    }
    if (n > b.remainingAmount && !confirm(`${inr(n)} is more than the ${inr(b.remainingAmount)} due. Record it anyway?`)) return
    if (n <= b.remainingAmount && !confirm(`Record ${inr(n)} received by ${mode.toLowerCase()} from ${b.guestName}?`)) return

    setBusy(true)
    try {
      const res = await api<{ message: string }>(`/api/admin/bookings/${b.id}/payments`, {
        method: 'POST',
        body: { amount: n, mode, notes: notes.trim() || undefined },
      })
      toast({ title: res.message })
      setNotes('')
      await onDone()
    } catch (err) {
      toast({ title: 'Could not record payment', description: errMsg(err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="text-sm font-medium">Record desk payment</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
          <Input type="number" min={1} className="mt-1 h-9 bg-background" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger className="mt-1 h-9 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="CARD">Card</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
          <Input className="mt-1 h-9 bg-background" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="UPI ref / card last 4" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="mr-1.5 h-3.5 w-3.5" />}
          Record payment
        </Button>
      </div>
    </form>
  )
}
