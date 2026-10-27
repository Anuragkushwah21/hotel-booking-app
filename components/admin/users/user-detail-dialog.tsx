'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Phone, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { StatusBadge, PaymentBadge } from '@/components/admin/booking-badges'
import { ErrorState, SkeletonBlock, inr } from '@/components/admin/ui'
import { formatDate } from '@/lib/format'
import {
  AccountBadge, Avatar, RoleBadge, type Role, type UserRow, type UserStatus,
} from './shared'

type Detail = {
  user: {
    id: string
    email: string
    name: string | null
    phone: string | null
    role: Role
    status: UserStatus
    emailVerified: boolean
    createdAt: string
    bookings: {
      id: string
      reference: string
      type: string
      status: string
      paymentStatus: string
      checkInDate: string | null
      checkOutDate: string | null
      bookingDate: string | null
      totalPrice: number
      createdAt: string
      room: { name: string; roomNo: string } | null
      table: { tableNo: string } | null
    }[]
  }
  summary: { bookings: number; totalPaid: number; outstanding: number }
}

export function UserDetailDialog({
  row,
  currentUserId,
  onClose,
  onChanged,
}: {
  row: UserRow | null
  currentUserId: string
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [role, setRole] = useState<Role>('GUEST')
  const [status, setStatus] = useState<UserStatus>('ACTIVE')
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!row) return
    setDetail(null)
    setError('')
    setRole(row.role)
    setStatus(row.status)
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/users/${row.id}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load user')
        if (!cancelled) {
          setDetail(data)
          setRole(data.user.role)
          setStatus(data.user.status)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load user')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row])

  if (!row) return null
  const self = row.id === currentUserId
  const base = detail?.user ?? row
  const dirty = role !== base.role || status !== base.status
  const isStaff = base.role !== 'GUEST'

  const save = async () => {
    if (!dirty) return
    if (role !== base.role && base.role !== 'GUEST' && role === 'GUEST') {
      if (!confirm(`Remove staff access for ${base.name || base.email}? They keep their guest account.`)) return
    }
    if (status === 'DEACTIVE' && base.status !== 'DEACTIVE') {
      if (!confirm(`Deactivate ${base.name || base.email}? They will be signed out and can't log in.`)) return
    }
    setSaving(true)
    try {
      const body: { role?: Role; status?: UserStatus } = {}
      if (role !== base.role) body.role = role
      if (status !== base.status) body.status = status
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update user')
      if (data.user && detail) setDetail({ ...detail, user: { ...detail.user, ...data.user } })
      toast({ title: 'User updated' })
      onChanged()
    } catch (e) {
      toast({
        title: 'Could not update user',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
      setRole(base.role)
      setStatus(base.status)
    } finally {
      setSaving(false)
    }
  }

  const resendInvite = async () => {
    setInviting(true)
    try {
      const res = await fetch(`/api/admin/users/${row.id}/invite`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not resend invite')
      toast({ title: 'Invite sent', description: `A new set-password link went to ${row.email}.` })
    } catch (e) {
      toast({
        title: 'Could not resend invite',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setInviting(false)
    }
  }

  return (
    <Dialog open={Boolean(row)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-6">
            <Avatar name={base.name} email={base.email} />
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{base.name || base.email}</DialogTitle>
              <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <RoleBadge role={base.role} />
                <AccountBadge user={{ ...row, role: base.role, status: base.status }} />
                <span className="text-xs">Joined {formatDate(base.createdAt)}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <a href={`mailto:${base.email}`} className="flex min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{base.email}</span>
          </a>
          {base.phone && (
            <a href={`tel:${base.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              {base.phone}
            </a>
          )}
        </div>

        {/* ---- access ---- */}
        <div className="mt-4 rounded-lg border border-border/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={self || saving}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GUEST">Guest</SelectItem>
                  <SelectItem value="HOTEL_MANAGER">Hotel manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)} disabled={self || saving}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DEACTIVE">Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="h-9" onClick={save} disabled={!dirty || saving || self}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {self && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              You can&apos;t change your own role or deactivate yourself. Ask another admin.
            </p>
          )}
          {isStaff && !row.hasAccount && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
              <p className="text-xs text-muted-foreground">
                Hasn&apos;t set a password yet. Invite links expire — send a fresh one if needed.
              </p>
              <Button size="sm" variant="outline" onClick={resendInvite} disabled={inviting}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {inviting ? 'Sending…' : 'Resend invite'}
              </Button>
            </div>
          )}
        </div>

        {/* ---- money + history ---- */}
        {error && <div className="mt-4"><ErrorState message={error} /></div>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Bookings', detail ? String(detail.summary.bookings) : null],
            ['Paid', detail ? inr(detail.summary.totalPaid) : null],
            ['Outstanding', detail ? inr(detail.summary.outstanding) : null],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              {value === null ? (
                <SkeletonBlock className="mt-1 h-5 w-12" />
              ) : (
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Booking history
          </p>
          {!detail && !error ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}
            </div>
          ) : detail && detail.user.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings.</p>
          ) : (
            <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
              {detail?.user.bookings.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/bookings?booking=${b.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {b.reference}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {b.room ? `${b.room.name} (${b.room.roomNo})` : b.table ? `Table ${b.table.tableNo}` : b.type}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.checkInDate
                          ? `${formatDate(b.checkInDate)} → ${formatDate(b.checkOutDate)}`
                          : formatDate(b.bookingDate ?? b.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={b.status} />
                      <PaymentBadge status={b.paymentStatus} />
                      <span className="w-20 text-right text-sm font-medium tabular-nums">{inr(b.totalPrice)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
