'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, UtensilsCrossed, Users, Wrench } from 'lucide-react'
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
import {
  PageHeader, Panel, StatCard, StatCardSkeleton, EmptyState,
  ErrorState, TableSkeleton,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'

type RestaurantTable = {
  id: string
  tableNo: string
  capacity: number
  location?: string | null
  status: string
}

const STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
] as const

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  RESERVED: 'border-blue-200 bg-blue-50 text-blue-700',
  OCCUPIED: 'border-amber-200 bg-amber-50 text-amber-700',
  MAINTENANCE: 'border-zinc-200 bg-zinc-50 text-zinc-600',
}

const EMPTY = { tableNo: '', capacity: '4', location: '', status: 'AVAILABLE' }

export default function AdminTablesPage() {
  const { toast } = useToast()
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RestaurantTable | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const fetchTables = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tables')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load tables')
      setTables(data.tables || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTables()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setOpen(true)
  }

  const openEdit = (t: RestaurantTable) => {
    setEditing(t)
    setForm({
      tableNo: t.tableNo,
      capacity: String(t.capacity),
      location: t.location ?? '',
      status: t.status,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.tableNo.trim()) {
      return toast({ title: 'Table number is required', variant: 'destructive' })
    }
    if (Number(form.capacity) <= 0) {
      return toast({ title: 'Capacity must be greater than 0', variant: 'destructive' })
    }

    setSaving(true)
    try {
      const res = await fetch(
        editing ? `/api/admin/tables/${editing.id}` : '/api/admin/tables',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableNo: form.tableNo.trim(),
            capacity: Number(form.capacity),
            location: form.location.trim() || null,
            status: form.status,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save table')

      toast({ title: editing ? 'Table updated' : 'Table created' })
      setOpen(false)
      await fetchTables()
    } catch (err) {
      toast({
        title: 'Could not save table',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t: RestaurantTable) => {
    if (!confirm(`Delete table ${t.tableNo}? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/tables/${t.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete table')
      toast({ title: 'Table deleted' })
      await fetchTables()
    } catch (err) {
      toast({
        title: 'Could not delete table',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const available = tables.filter((t) => t.status === 'AVAILABLE').length
  const outOfService = tables.filter((t) => t.status === 'MAINTENANCE').length
  const covers = tables.reduce((s, t) => s + t.capacity, 0)

  return (
    <div>
      <PageHeader
        title="Restaurant tables"
        description="Seating inventory used by both online reservations and walk-ins."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add table
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total tables" value={tables.length} icon={UtensilsCrossed} accent="slate" />
            <StatCard label="Available" value={available} icon={UtensilsCrossed} accent="emerald" />
            <StatCard label="Total covers" value={covers} icon={Users} accent="violet" sub="seats across all tables" />
            <StatCard
              label="Out of service" value={outOfService} icon={Wrench}
              accent={outOfService > 0 ? 'amber' : 'slate'}
            />
          </>
        )}
      </div>

      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      <Panel className="mt-6 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : tables.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="No tables yet"
            description="Add tables so guests can reserve a sitting."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add table
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {['Table', 'Location', 'Seats', 'Status', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                        i === 2 ? 'text-right' : 'text-left',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {tables.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                          {t.tableNo}
                        </span>
                        <span className="font-medium text-foreground">Table {t.tableNo}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.location || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {t.capacity}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                          STATUS_STYLE[t.status] ?? 'border-border bg-muted text-muted-foreground',
                        )}
                      >
                        {t.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => openEdit(t)} title="Edit table"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => remove(t)} title="Delete table"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit table ${editing.tableNo}` : 'Add a table'}</DialogTitle>
            <DialogDescription>
              Tables are auto-assigned to reservations by smallest fit unless a
              specific table is chosen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">
                Table number<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                className="h-9" placeholder="T-01"
                value={form.tableNo} onChange={(e) => set('tableNo', e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium">
                Seats<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                type="number" min={1} className="h-9"
                value={form.capacity} onChange={(e) => set('capacity', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-xs font-medium">Location</Label>
              <Input
                className="h-9" placeholder="Window side / Garden view / VIP section"
                value={form.location} onChange={(e) => set('location', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-xs font-medium">Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create table'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
