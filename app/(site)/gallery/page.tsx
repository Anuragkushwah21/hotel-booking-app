'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, BedDouble } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HOTEL, ROOM_PLACEHOLDER } from '@/lib/hotel'

type Shot = { url: string; caption: string }

export default function GalleryPage() {
  const [roomShots, setRoomShots] = useState<Shot[]>([])
  const [active, setActive] = useState<Shot | null>(null)

  // Room photographs live in the database, so the gallery shows the real
  // inventory alongside the property shots from config.
  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((d) => {
        const shots: Shot[] = []
        for (const room of d.rooms ?? []) {
          for (const url of room.photos ?? []) {
            shots.push({ url, caption: `${room.name} · Room ${room.roomNo}` })
          }
        }
        setRoomShots(shots)
      })
      .catch(() => {})
  }, [])

  const all = [...HOTEL.gallery, ...roomShots]

  return (
    <div>
      <header className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Gallery</h1>
          <p className="mt-2 text-muted-foreground">
            The property, the restaurant, and the rooms you can actually book.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {all.map((g, i) => (
            <button
              key={`${g.url}-${i}`}
              onClick={() => setActive(g)}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.url || ROOM_PLACEHOLDER}
                alt={g.caption}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-xs text-white">
                {g.caption}
              </span>
            </button>
          ))}
        </div>

        {roomShots.length === 0 && (
          <p className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No room photographs uploaded yet — add them from the admin dashboard and
            they&apos;ll appear here automatically.
          </p>
        )}

        <div className="mt-10 text-center">
          <Button size="lg" asChild>
            <Link href="/rooms">
              <BedDouble className="mr-1.5 h-4 w-4" />
              Browse rooms
            </Link>
          </Button>
        </div>
      </section>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <figure onClick={(e) => e.stopPropagation()} className="max-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.url} alt={active.caption} className="max-h-[80vh] rounded-lg object-contain" />
            <figcaption className="mt-3 text-center text-sm text-white/80">{active.caption}</figcaption>
          </figure>
        </div>
      )}
    </div>
  )
}
