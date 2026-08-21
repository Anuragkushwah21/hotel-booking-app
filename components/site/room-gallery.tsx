'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, Expand, X } from 'lucide-react'
import { ROOM_PLACEHOLDER } from '@/lib/hotel'

/**
 * Room photo viewer: large frame, thumbnail strip, arrow navigation and a
 * full-screen lightbox. Falls back to a placeholder so a room with no photos
 * still renders a sensible card instead of a broken image.
 */
export function RoomGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const images = photos.length > 0 ? photos : [ROOM_PLACEHOLDER]
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  const go = (delta: number) =>
    setIndex((i) => (i + delta + images.length) % images.length)

  return (
    <>
      <div className="space-y-3">
        <div className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[index]}
            alt={`${alt} — photo ${index + 1} of ${images.length}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />

          {photos.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/70 text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs">No photos uploaded yet</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="absolute right-3 top-3 rounded-lg bg-black/50 p-2 text-white opacity-0 transition group-hover:opacity-100"
            aria-label="View full screen"
          >
            <Expand className="h-4 w-4" />
          </button>

          {images.length > 1 && (
            <>
              <GalleryArrow side="left" onClick={() => go(-1)} />
              <GalleryArrow side="right" onClick={() => go(1)} />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white tabular-nums">
                {index + 1} / {images.length}
              </div>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                aria-label={`Show photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
            onClick={() => setLightbox(false)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[index]}
            alt={alt}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <GalleryArrow side="left" onClick={(e) => { e.stopPropagation(); go(-1) }} light />
              <GalleryArrow side="right" onClick={(e) => { e.stopPropagation(); go(1) }} light />
            </>
          )}
        </div>
      )}
    </>
  )
}

function GalleryArrow({
  side, onClick, light,
}: {
  side: 'left' | 'right'
  onClick: (e: React.MouseEvent) => void
  light?: boolean
}) {
  const Chevron = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full p-2 text-white transition ${
        side === 'left' ? 'left-3' : 'right-3'
      } ${light ? 'bg-white/10 hover:bg-white/20' : 'bg-black/45 hover:bg-black/65'}`}
    >
      <Chevron className="h-5 w-5" />
    </button>
  )
}
