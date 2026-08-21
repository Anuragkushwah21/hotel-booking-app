'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, BedDouble, Wrench, IndianRupee } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ListEditor } from '@/components/admin/list-editor'
import {
  PageHeader, Panel, StatCard, StatCardSkeleton, EmptyState,
  ErrorState, TableSkeleton, inr,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'

type Room = {
  id: string
  roomNo: string
  name: string
  description?: string | null
  type: string | null
  acType: string
  capacity: number
  price: number
  status: string
  photos?: string[]
  amenities?: string[]
}

// Matches the RoomStatus enum. The old page also offered "BLOCKED", which is
// not a valid value and failed server-side on save.
const STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
] as const

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  BOOKED: 'border-blue-200 bg-blue-50 text-blue-700',
  MAINTENANCE: 'border-amber-200 bg-amber-50 text-amber-700',
}

const AMENITY_SUGGESTIONS = [
  'WiFi', 'AC', 'TV', 'Bathroom', 'Mini Bar', 'Living Area',
  'Kitchenette', 'Extra Beds', 'Balcony', 'Work Desk', 'Safe', 'Jacuzzi',
]

const EMPTY = {
  roomNo: '', name: '', description: '', type: '',
  acType: 'AC', capacity: '2', price: '1000', status: 'AVAILABLE',
}

export default function AdminRoomsPage() {
  const { toast } = useToast()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Room | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [photos, setPhotos] = useState<string[]>([])
  const [amenities, setAmenities] = useState<string[]>([])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const fetchRooms = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/room')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load rooms')
      setRooms(data.rooms || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY })
    setPhotos([])
    setAmenities([])
    setOpen(true)
  }

  const openEdit = (room: Room) => {
    setEditing(room)
    setForm({
      roomNo: room.roomNo,
      name: room.name,
      description: room.description ?? '',
      type: room.type ?? '',
      acType: room.acType,
      capacity: String(room.capacity),
      price: String(room.price),
      status: room.status,
    })
    setPhotos(room.photos ?? [])
    setAmenities(room.amenities ?? [])
    setOpen(true)
  }

  const save = async () => {
    if (!form.roomNo.trim()) return toast({ title: 'Room number is required', variant: 'destructive' })
    if (!form.name.trim()) return toast({ title: 'Room name is required', variant: 'destructive' })
    if (Number(form.price) <= 0) return toast({ title: 'Price must be greater than 0', variant: 'destructive' })

    setSaving(true)
    try {
      const res = await fetch(
        editing ? `/api/admin/room/${editing.id}` : '/api/admin/room',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomNo: form.roomNo.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            type: form.type.trim() || null,
            acType: form.acType,
            capacity: Number(form.capacity),
            price: Number(form.price),
            status: form.status,
            photos,
            amenities,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save room')

      toast({ title: editing ? 'Room updated' : 'Room created' })
      setOpen(false)
      await fetchRooms()
    } catch (err) {
      toast({
        title: 'Could not save room',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (room: Room) => {
    if (!confirm(`Delete room ${room.roomNo} (${room.name})? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/room/${room.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete room')
      toast({ title: 'Room deleted' })
      await fetchRooms()
    } catch (err) {
      toast({
        title: 'Could not delete room',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const available = rooms.filter((r) => r.status === 'AVAILABLE').length
  const maintenance = rooms.filter((r) => r.status === 'MAINTENANCE').length
  const avgPrice = rooms.length
    ? Math.round(rooms.reduce((s, r) => s + r.price, 0) / rooms.length)
    : 0

  return (
    <div>
      <PageHeader
        title="Rooms"
        description="Sellable room inventory, rates and availability status."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add room
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total rooms" value={rooms.length} icon={BedDouble} accent="slate" />
            <StatCard label="Available" value={available} icon={BedDouble} accent="emerald" />
            <StatCard
              label="Under maintenance" value={maintenance} icon={Wrench}
              accent={maintenance > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Average rate" value={inr(avgPrice)} icon={IndianRupee}
              accent="violet" sub="per night"
            />
          </>
        )}
      </div>

      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      <Panel className="mt-6 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            description="Add your first room to start taking bookings."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add room
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  {['Room', 'Type', 'Climate', 'Capacity', 'Rate', 'Status', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                        i >= 4 ? 'text-right' : 'text-left',
                        i === 5 && 'text-left',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rooms.map((room) => (
                  <tr key={room.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                          {room.roomNo}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{room.name}</p>
                          {room.description && (
                            <p className="max-w-xs truncate text-xs text-muted-foreground">
                              {room.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{room.type || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {room.acType === 'AC' ? 'AC' : 'Non-AC'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {room.capacity}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                      {inr(room.price)}
                      <span className="ml-0.5 text-xs font-normal text-muted-foreground">/night</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                          STATUS_STYLE[room.status] ?? 'border-border bg-muted text-muted-foreground',
                        )}
                      >
                        {room.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => openEdit(room)} title="Edit room"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => remove(room)} title="Delete room"
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit room ${editing.roomNo}` : 'Add a room'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Changes apply to future bookings; existing reservations keep their agreed rate.'
                : 'Create a new sellable room.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <RoomField label="Room number" required>
              <Input
                className="h-9" placeholder="101"
                value={form.roomNo} onChange={(e) => set('roomNo', e.target.value)}
              />
            </RoomField>
            <RoomField label="Name" required>
              <Input
                className="h-9" placeholder="Deluxe Double"
                value={form.name} onChange={(e) => set('name', e.target.value)}
              />
            </RoomField>
            <RoomField label="Room type">
              <Input
                className="h-9" placeholder="Deluxe / Suite / Standard"
                value={form.type} onChange={(e) => set('type', e.target.value)}
              />
            </RoomField>
            <RoomField label="Climate">
              <Select value={form.acType} onValueChange={(v) => set('acType', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AC">AC</SelectItem>
                  <SelectItem value="NON_AC">Non-AC</SelectItem>
                </SelectContent>
              </Select>
            </RoomField>
            <RoomField label="Capacity" required>
              <Input
                type="number" min={1} className="h-9"
                value={form.capacity} onChange={(e) => set('capacity', e.target.value)}
              />
            </RoomField>
            <RoomField label="Rate per night (₹)" required>
              <Input
                type="number" min={0} className="h-9"
                value={form.price} onChange={(e) => set('price', e.target.value)}
              />
            </RoomField>
            <RoomField label="Status" className="sm:col-span-2">
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </RoomField>
            <RoomField label="Photos" className="sm:col-span-2">
              <ListEditor
                values={photos}
                onChange={setPhotos}
                placeholder="Paste an image URL and press Enter"
                preview
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                The first photo is used as the card cover on the website.
              </p>
            </RoomField>
            <RoomField label="Amenities" className="sm:col-span-2">
              <ListEditor
                values={amenities}
                onChange={setAmenities}
                placeholder="Type an amenity and press Enter"
                suggestions={AMENITY_SUGGESTIONS}
              />
            </RoomField>
            <RoomField label="Description" className="sm:col-span-2">
              <Textarea
                rows={2} placeholder="Spacious room with city view…"
                value={form.description} onChange={(e) => set('description', e.target.value)}
              />
            </RoomField>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create room'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RoomField({
  label, required, className, children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  )
}
