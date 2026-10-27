'use client'

import { useEffect, useState } from 'react'
import { CalendarOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/format'

export type RoomBlock = { id: string; startDate: string; endDate: string; reason: string | null }

const istToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Block end is exclusive (like a checkout date): the room is sellable again that day. */
const lastNight = (end: string) => formatDate(new Date(new Date(end).getTime() - 86400000))

export function RoomBlocksDialog({
  room,
  onClose,
  onChanged,
}: {
  room: { id: string; roomNo: string; name: string; blocks?: RoomBlock[] } | null
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!room) return
    const today = istToday()
    setStart(today)
    setEnd(addDays(today, 1))
    setReason('')
    setError('')
  }, [room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!room) return null
  const blocks = room.blocks ?? []

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!start || !end) return setError('Pick both dates')
    if (end <= start) return setError('“Back in service” must be after the first blocked night')
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/room/${room.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, reason: reason.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not block room')
      toast({ title: `Room ${room.roomNo} blocked`, description: `${formatDate(start)} – ${lastNight(end)}` })
      setReason('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not block room')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (b: RoomBlock) => {
    if (!confirm(`Lift the block ${formatDate(b.startDate)} – ${lastNight(b.endDate)}?`)) return
    setRemoving(b.id)
    try {
      const res = await fetch(`/api/admin/room/${room.id}/block?blockId=${encodeURIComponent(b.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not remove block')
      toast({ title: 'Block removed' })
      onChanged()
    } catch (err) {
      toast({
        title: 'Could not remove block',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Dialog open={Boolean(room)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Block room {room.roomNo}</DialogTitle>
          <DialogDescription>
            Take {room.name} out of inventory for specific dates — repairs, deep clean, renovation. Guests
            can&apos;t book it while blocked.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming blocks
          </p>
          {blocks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No upcoming blocks.
            </p>
          ) : (
            <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {formatDate(b.startDate)} – {lastNight(b.endDate)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.reason || 'No reason given'} · back {formatDate(b.endDate)}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 flex-shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(b)} disabled={removing === b.id} title="Remove block"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={create} className="mt-4 space-y-3 border-t border-border/70 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New block</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">First night blocked</Label>
              <Input
                type="date" className="h-9" value={start} min={istToday()}
                onChange={(e) => {
                  setStart(e.target.value)
                  if (e.target.value && end <= e.target.value) setEnd(addDays(e.target.value, 1))
                }}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Back in service</Label>
              <Input
                type="date" className="h-9" value={end} min={start ? addDays(start, 1) : undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Reason</Label>
            <Input
              className="h-9" placeholder="AC repair, repainting…" maxLength={200}
              value={reason} onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button type="submit" disabled={saving}>
              <CalendarOff className="mr-1.5 h-3.5 w-3.5" />
              {saving ? 'Blocking…' : 'Block dates'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
