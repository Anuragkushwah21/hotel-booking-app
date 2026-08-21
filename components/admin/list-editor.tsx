'use client'

import { useState } from 'react'
import { Plus, X, ImageOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Edits a string[] column (Room.photos / Room.amenities).
 * `preview` renders each entry as a thumbnail, which is what makes the photo
 * list usable — you can see immediately if a URL is wrong.
 */
export function ListEditor({
  values,
  onChange,
  placeholder,
  preview,
  suggestions = [],
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  preview?: boolean
  suggestions?: string[]
}) {
  const [draft, setDraft] = useState('')

  const add = (value: string) => {
    const v = value.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setDraft('')
  }

  const remove = (v: string) => onChange(values.filter((x) => x !== v))

  return (
    <div>
      <div className="flex gap-2">
        <Input
          className="h-9"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => add(draft)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                + {s}
              </button>
            ))}
        </div>
      )}

      {values.length > 0 &&
        (preview ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {values.map((url) => (
              <div key={url} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                  }}
                />
                <span className="absolute inset-0 hidden flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <ImageOff className="h-4 w-4" />
                  broken URL
                </span>
                <button
                  type="button"
                  onClick={() => remove(url)}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs"
              >
                {v}
                <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </span>
            ))}
          </div>
        ))}
    </div>
  )
}
