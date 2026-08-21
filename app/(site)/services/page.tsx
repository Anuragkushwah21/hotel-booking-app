'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UtensilsCrossed, BedDouble, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/site/icon'
import { HOTEL } from '@/lib/hotel'

type Service = {
  code: string; label: string; description: string
  icon: string; price: number; unitLabel: string
}
type Facility = { icon: string; label: string; note: string }

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function ServicesPage() {
  const [bookable, setBookable] = useState<Service[]>([])
  const [included, setIncluded] = useState<Facility[]>([])
  const [dining, setDining] = useState<{ pricePerGuest: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then((d) => {
        setBookable(d.bookable ?? [])
        setIncluded(d.included ?? [])
        setDining(d.dining ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading services…
      </div>
    )
  }

  return (
    <div>
      <header className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Services &amp; facilities</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything the hotel offers — what comes free with your room, and what
            you can add on while booking.
          </p>
        </div>
      </header>

      {/* ---- included ---- */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Free for every guest
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Included with your stay</h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {included.map((f) => (
            <div key={f.label} className="rounded-xl border border-border bg-card p-4">
              <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                <Icon name={f.icon} className="h-5 w-5" />
              </span>
              <p className="mt-3 font-medium">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- paid add-ons ---- */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Add while booking
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Paid extras</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Select any of these on the room page — the total updates live, and the
            price you see is the price the server charges.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bookable.map((s) => (
              <div key={s.code} className="flex flex-col rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{inr(s.price)}</p>
                    <p className="text-[11px] text-muted-foreground">{s.unitLabel}</p>
                  </div>
                </div>
                <p className="mt-3 font-medium">{s.label}</p>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>

          <Button className="mt-8" asChild>
            <Link href="/rooms">
              <BedDouble className="mr-1.5 h-4 w-4" />
              Pick a room and add services
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ---- dining ---- */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Dining</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{HOTEL.dining.name}</h2>
            <p className="mt-3 text-muted-foreground">{HOTEL.dining.blurb}</p>

            <ul className="mt-5 space-y-2">
              {HOTEL.dining.hours.map((h) => (
                <li key={h.label} className="flex justify-between border-b border-border pb-2 text-sm">
                  <span className="font-medium">{h.label}</span>
                  <span className="tabular-nums text-muted-foreground">{h.time}</span>
                </li>
              ))}
            </ul>

            {dining && (
              <p className="mt-4 text-sm text-muted-foreground">
                Table reservations are{' '}
                <span className="font-semibold text-foreground">{inr(dining.pricePerGuest)} per guest</span>,
                adjusted against your final bill.
              </p>
            )}

            <Button className="mt-5" asChild>
              <Link href="/tables/reserve">
                <UtensilsCrossed className="mr-1.5 h-4 w-4" />
                Reserve a table
              </Link>
            </Button>
          </div>

          <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HOTEL.gallery[3].url} alt={HOTEL.dining.name} className="h-full w-full object-cover" loading="lazy" />
          </div>
        </div>
      </section>
    </div>
  )
}
