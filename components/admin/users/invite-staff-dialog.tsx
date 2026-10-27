'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

const EMPTY = { email: '', name: '', phone: '', role: 'HOTEL_MANAGER' as 'HOTEL_MANAGER' | 'ADMIN' }

export function InviteStaffDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onInvited: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const close = (v: boolean) => {
    if (!v) {
      setForm({ ...EMPTY })
      setError('')
    }
    onOpenChange(v)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('Name is required')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email')

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send the invite')
      toast({ title: 'Invite sent', description: `${form.email.trim()} will get a link to set a password.` })
      close(false)
      onInvited()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite staff member</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email with a link to set their password. An existing guest account with
            this email is promoted to staff.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs font-medium">
              Name<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              className="h-9" autoFocus value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium">
              Email<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              type="email" className="h-9" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Phone</Label>
              <Input
                type="tel" className="h-9" value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as typeof f.role }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOTEL_MANAGER">Hotel manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Managers run the front desk (bookings, rooms, tables). Admins also see reports, payments,
            pricing, settings and users.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
