/**
 * Pricing & policy configuration, editable from Admin → Settings.
 *
 * HotelSettings is a single row (id = 1). It is created with the schema
 * defaults the first time anything reads it, so a fresh database works without
 * a seed step.
 */

import type { HotelSettings, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { dateKey } from './format'

type Client = Prisma.TransactionClient | typeof prisma

export async function getHotelSettings(client: Client = prisma): Promise<HotelSettings> {
  return client.hotelSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  })
}

/** Premium dates that fall inside a stay, keyed for fast nightly lookup. */
export type PricingCalendar = {
  /** date key → event name */
  events: Map<string, string>
  peakSeasons: { name: string; startKey: string; endKey: string }[]
}

export const EMPTY_CALENDAR: PricingCalendar = { events: new Map(), peakSeasons: [] }

/** Active peak seasons and event dates overlapping [from, to]. */
export async function getPricingCalendar(
  from: Date,
  to: Date,
  client: Client = prisma,
): Promise<PricingCalendar> {
  const [events, seasons] = await Promise.all([
    client.specialDate.findMany({
      where: { active: true, date: { gte: from, lte: to } },
      select: { date: true, name: true },
    }),
    client.peakSeason.findMany({
      where: { active: true, startDate: { lte: to }, endDate: { gte: from } },
      select: { name: true, startDate: true, endDate: true },
    }),
  ])

  return {
    events: new Map(events.map((e) => [dateKey(e.date), e.name])),
    peakSeasons: seasons.map((s) => ({
      name: s.name,
      startKey: dateKey(s.startDate),
      endKey: dateKey(s.endDate),
    })),
  }
}
