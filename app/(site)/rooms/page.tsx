'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, BedDouble, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RoomCard, type RoomSummary } from '@/components/site/room-card'

const ALL = 'ALL'
const todayStr = () => new Date().toISOString().split('T')[0]

function RoomsContent() {
  const searchParams = useSearchParams()

  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '')
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '')
  const [guests, setGuests] = useState(searchParams.get('guests') || '')
  const [acType, setAcType] = useState(ALL)
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('price-asc')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (guests) params.set('minCapacity', guests)
      if (acType !== ALL) params.set('acType', acType)
      if (maxPrice) params.set('maxPrice', maxPrice)

      const res = await fetch(`/api/rooms?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load rooms')
      setRooms(data.rooms ?? [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load rooms')
    } finally {
      setLoading(false)
    }
  }, [guests, acType, maxPrice])

  useEffect(() => {
    load()
  }, [load])

  const sorted = useMemo(() => {
    const copy = [...rooms]
    if (sort === 'price-asc') copy.sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') copy.sort((a, b) => b.price - a.price)
    if (sort === 'capacity') copy.sort((a, b) => b.capacity - a.capacity)
    return copy
  }, [rooms, sort])

  // Carried through to the room page so dates survive the click.
  const dateQuery = new URLSearchParams({
    ...(checkIn && { checkIn }),
    ...(checkOut && { checkOut }),
    ...(guests && { guests }),
  }).toString()

  const clear = () => {
    setGuests(''); setAcType(ALL); setMaxPrice('')
  }
  const activeFilters = [guests, acType !== ALL ? acType : '', maxPrice].filter(Boolean).length

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Our rooms</h1>
        <p className="mt-1 text-muted-foreground">
          Photos, amenities and live availability for every room.
        </p>
      </header>

      {/* --- date + filter bar --- */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Check-in</Label>
            <Input type="date" min={todayStr()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Check-out</Label>
            <Input type="date" min={checkIn || todayStr()} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Guests</Label>
            <Input type="number" min={1} placeholder="Any" value={guests} onChange={(e) => setGuests(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowFilters((s) => !s)}>
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              Filters
              {activeFilters > 0 && (
                <span className="ml-1.5 rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {activeFilters}
                </span>
              )}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Climate</Label>
              <Select value={acType} onValueChange={setAcType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any</SelectItem>
                  <SelectItem value="AC">Air conditioned</SelectItem>
                  <SelectItem value="NON_AC">Non-AC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Max price / night</Label>
              <Input type="number" min={0} placeholder="Any" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Sort by</Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                  <SelectItem value="capacity">Largest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={clear}>
                <X className="mr-1 h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* --- results --- */}
      {loading ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <div className="aspect-[4/3] animate-pulse bg-muted" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-9 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <BedDouble className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No rooms match your filters</p>
          <p className="text-sm text-muted-foreground">Try widening the guest count or price range.</p>
          {activeFilters > 0 && (
            <Button variant="outline" size="sm" className="mt-2" onClick={clear}>Clear filters</Button>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{sorted.length}</span>{' '}
            room{sorted.length === 1 ? '' : 's'} available
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((room) => (
              <RoomCard key={room.id} room={room} query={dateQuery} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function RoomsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading rooms…
        </div>
      }
    >
      <RoomsContent />
    </Suspense>
  )
}
