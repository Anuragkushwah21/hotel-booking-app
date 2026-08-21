import Link from 'next/link'
import { Users, Snowflake, Wind, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROOM_PLACEHOLDER } from '@/lib/hotel'

export type RoomSummary = {
  id: string
  roomNo: string
  name: string
  type: string | null
  acType: string
  capacity: number
  price: number
  description?: string | null
  photos?: string[]
  amenities?: string[]
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export function RoomCard({
  room,
  /** Extra query string (dates, guests) carried through to the room page. */
  query,
}: {
  room: RoomSummary
  query?: string
}) {
  const href = `/rooms/${room.id}${query ? `?${query}` : ''}`
  const cover = room.photos?.[0] || ROOM_PLACEHOLDER
  const AcIcon = room.acType === 'AC' ? Snowflake : Wind

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={room.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {room.type && (
            <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
              {room.type}
            </span>
          )}
          {(room.photos?.length ?? 0) > 1 && (
            <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
              {room.photos!.length} photos
            </span>
          )}
        </div>
      </Link>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">
              <Link href={href} className="hover:text-primary">
                {room.name}
              </Link>
            </h3>
            <p className="text-xs text-muted-foreground">Room {room.roomNo}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="font-semibold tabular-nums text-foreground">{inr(room.price)}</p>
            <p className="text-[11px] text-muted-foreground">per night</p>
          </div>
        </div>

        {room.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{room.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {room.capacity} guest{room.capacity > 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <AcIcon className="h-3.5 w-3.5" />
            {room.acType === 'AC' ? 'AC' : 'Non-AC'}
          </span>
        </div>

        {room.amenities && room.amenities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.amenities.slice(0, 4).map((a) => (
              <span
                key={a}
                className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {a}
              </span>
            ))}
            {room.amenities.length > 4 && (
              <span className="px-1 py-0.5 text-[11px] text-muted-foreground">
                +{room.amenities.length - 4} more
              </span>
            )}
          </div>
        )}

        <Button asChild className="mt-4 w-full" size="sm">
          <Link href={href}>
            View details &amp; book
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </article>
  )
}
