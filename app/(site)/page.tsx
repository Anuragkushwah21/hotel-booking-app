'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Users, BedDouble, UtensilsCrossed, Search, Star, Clock,
  ArrowRight, Phone, Mail, ChevronDown, Quote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/site/icon'
import { RoomCard, type RoomSummary } from '@/components/site/room-card'
import { HOTEL } from '@/lib/hotel'

type Service = {
  code: string; label: string; description: string
  icon: string; price: number; unitLabel: string
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function HomePage() {
  const router = useRouter()
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  const [tab, setTab] = useState<'ROOM' | 'TABLE'>('ROOM')
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  // room search
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [roomGuests, setRoomGuests] = useState('2')
  // table search
  const [date, setDate] = useState('')
  const [time, setTime] = useState('19:00')
  const [tableGuests, setTableGuests] = useState('2')

  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => setRooms([]))
    fetch('/api/services')
      .then((r) => r.json())
      .then((d) => setServices(d.bookable ?? []))
      .catch(() => setServices([]))
  }, [])

  const searchRooms = () => {
    const params = new URLSearchParams({
      checkIn: checkIn || today,
      checkOut: checkOut || today,
      guests: Number(roomGuests) > 0 ? roomGuests : '1',
    })
    router.push(`/rooms?${params}`)
  }

  const searchTable = () => {
    const params = new URLSearchParams({
      date: date || today,
      time: time || '19:00',
      guests: Number(tableGuests) > 0 ? tableGuests : '1',
    })
    router.push(`/tables/reserve?${params}`)
  }

  const cheapest = rooms.length ? Math.min(...rooms.map((r) => r.price)) : null

  return (
    <div className="bg-background">
      {/* ================= HERO ================= */}
      <section className="relative">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HOTEL.gallery[0].url}
            alt={HOTEL.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/75" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl text-white">
            <p className="mb-3 flex items-center gap-1.5 text-sm text-white/80">
              <MapPin className="h-4 w-4" />
              {HOTEL.contact.addressLines[1]}, {HOTEL.contact.addressLines[2]}
            </p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{HOTEL.name}</h1>
            <p className="mt-3 text-lg text-white/85">{HOTEL.tagline}</p>
            <p className="mt-4 max-w-xl text-white/75">{HOTEL.shortAbout}</p>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-white/85">
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                4.7 · {HOTEL.testimonials.length * 47} reviews
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Check-in {HOTEL.policies.checkIn}
              </span>
              {cheapest !== null && (
                <span className="flex items-center gap-1.5">
                  <BedDouble className="h-4 w-4" />
                  Rooms from {inr(cheapest)}
                </span>
              )}
            </div>
          </div>

          {/* ---- search widget ---- */}
          <div className="mt-10 rounded-2xl bg-card p-2 shadow-xl">
            <div className="flex gap-1 p-1">
              {([
                ['ROOM', 'Book a room', BedDouble],
                ['TABLE', 'Reserve a table', UtensilsCrossed],
              ] as const).map(([value, label, TabIcon]) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    tab === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <TabIcon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {tab === 'ROOM' ? (
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <SearchField label="Check-in">
                  <Input type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                </SearchField>
                <SearchField label="Check-out">
                  <Input type="date" min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                </SearchField>
                <SearchField label="Guests">
                  <Input type="number" min={1} value={roomGuests} onChange={(e) => setRoomGuests(e.target.value)} />
                </SearchField>
                <div className="flex items-end">
                  <Button className="h-10 w-full" onClick={searchRooms}>
                    <Search className="mr-1.5 h-4 w-4" />
                    Search rooms
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <SearchField label="Date">
                  <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
                </SearchField>
                <SearchField label="Time">
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </SearchField>
                <SearchField label="Guests">
                  <Input type="number" min={1} value={tableGuests} onChange={(e) => setTableGuests(e.target.value)} />
                </SearchField>
                <div className="flex items-end">
                  <Button className="h-10 w-full" onClick={searchTable}>
                    <Search className="mr-1.5 h-4 w-4" />
                    Find a table
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <Section id="about">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>About the hotel</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              A quiet, well-run place to land
            </h2>
            {HOTEL.about.map((p, i) => (
              <p key={i} className="mt-4 text-muted-foreground">{p}</p>
            ))}

            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Fact label="Check-in" value={HOTEL.policies.checkIn} />
              <Fact label="Check-out" value={HOTEL.policies.checkOut} />
              <Fact label="Rooms" value={String(rooms.length || '—')} />
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {HOTEL.gallery.slice(1, 5).map((g) => (
              <div key={g.url} className="aspect-square overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt={g.caption} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ================= FACILITIES ================= */}
      <Section muted>
        <Eyebrow>Included with every stay</Eyebrow>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Hotel facilities</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          These come with your room at no extra cost.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOTEL.facilities.map((f) => (
            <div key={f.label} className="rounded-xl border border-border bg-card p-4">
              <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                <Icon name={f.icon} className="h-5 w-5" />
              </span>
              <p className="mt-3 font-medium">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.note}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ================= ROOMS ================= */}
      <Section id="rooms">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Where you&apos;ll sleep</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Our rooms</h2>
            <p className="mt-2 text-muted-foreground">
              Every room has photos, amenities and live availability.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/rooms">
              See all rooms
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {rooms.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No rooms published yet.
          </p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.slice(0, 6).map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        )}
      </Section>

      {/* ================= SERVICES ================= */}
      <Section muted id="services">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Add to your stay</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Extra services</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Pick any of these while booking a room — the total updates as you choose,
              and you can also add them later at the front desk.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/services">
              All services
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div key={s.code} className="rounded-xl border border-border bg-card p-5">
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
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ================= DINING ================= */}
      <Section id="dining">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="order-2 aspect-[4/3] overflow-hidden rounded-xl bg-muted lg:order-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HOTEL.gallery[3].url} alt={HOTEL.dining.name} className="h-full w-full object-cover" loading="lazy" />
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>Dining</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{HOTEL.dining.name}</h2>
            <p className="mt-4 text-muted-foreground">{HOTEL.dining.blurb}</p>

            <ul className="mt-6 space-y-2">
              {HOTEL.dining.hours.map((h) => (
                <li key={h.label} className="flex justify-between border-b border-border pb-2 text-sm">
                  <span className="font-medium">{h.label}</span>
                  <span className="tabular-nums text-muted-foreground">{h.time}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              {HOTEL.dining.highlights.map((h) => (
                <span key={h} className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                  {h}
                </span>
              ))}
            </div>

            <Button className="mt-6" asChild>
              <Link href="/tables/reserve">
                <UtensilsCrossed className="mr-1.5 h-4 w-4" />
                Reserve a table
              </Link>
            </Button>
          </div>
        </div>
      </Section>

      {/* ================= GALLERY ================= */}
      <Section muted id="gallery">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Have a look around</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Gallery</h2>
          </div>
          <Button variant="outline" asChild>
            <Link href="/gallery">
              View gallery
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
          {HOTEL.gallery.map((g) => (
            <figure key={g.url} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.url} alt={g.caption} loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs text-white">
                {g.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ================= REVIEWS ================= */}
      <Section>
        <Eyebrow>What guests say</Eyebrow>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Reviews</h2>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {HOTEL.testimonials.map((t) => (
            <blockquote key={t.name} className="rounded-xl border border-border bg-card p-5">
              <Quote className="h-5 w-5 text-primary/40" />
              <div className="mt-2 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${i < t.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">&ldquo;{t.quote}&rdquo;</p>
              <footer className="mt-3 text-sm font-medium">
                {t.name}
                <span className="font-normal text-muted-foreground"> · {t.city}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </Section>

      {/* ================= FAQ + CONTACT ================= */}
      <Section muted id="contact">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Good to know</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Frequently asked</h2>

            <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
              {HOTEL.faq.map((f, i) => (
                <div key={f.q}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-medium"
                    aria-expanded={openFaq === i}
                  >
                    {f.q}
                    <ChevronDown
                      className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <p className="px-4 pb-4 text-sm text-muted-foreground">{f.a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <Eyebrow>Find us</Eyebrow>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Contact &amp; location</h2>

            <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <address className="text-sm not-italic text-muted-foreground">
                  {HOTEL.contact.addressLines.map((l) => <span key={l} className="block">{l}</span>)}
                </address>
              </div>
              <a href={`tel:${HOTEL.contact.phone}`} className="flex items-center gap-3 text-sm hover:text-primary">
                <Phone className="h-4 w-4 flex-shrink-0 text-primary" />
                {HOTEL.contact.phone}
              </a>
              <a href={`mailto:${HOTEL.contact.email}`} className="flex items-center gap-3 text-sm hover:text-primary">
                <Mail className="h-4 w-4 flex-shrink-0 text-primary" />
                {HOTEL.contact.email}
              </a>

              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium">Hotel policies</p>
                <ul className="space-y-1.5">
                  {HOTEL.policies.items.map((p) => (
                    <li key={p} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ================= CTA ================= */}
      <section className="border-t border-border bg-primary/5">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Check live availability, see the room you&apos;ll actually get, and add
            breakfast or an airport pickup as you book.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/rooms">
                <BedDouble className="mr-1.5 h-4 w-4" />
                Browse rooms
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/tables/reserve">
                <UtensilsCrossed className="mr-1.5 h-4 w-4" />
                Reserve a table
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

// ---------------- small building blocks ----------------

function Section({
  children, muted, id,
}: {
  children: React.ReactNode
  muted?: boolean
  id?: string
}) {
  return (
    <section id={id} className={muted ? 'border-y border-border bg-muted/30' : ''}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">{children}</p>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  )
}

function SearchField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
