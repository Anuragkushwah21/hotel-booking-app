'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

/**
 * Live "can I actually get a table?" answer for a date + time + party size.
 *
 * Table bookings auto-assign the smallest table that fits, so until now a guest
 * only learned a slot was full when the booking was rejected. This asks the
 * moment the slot is picked, and reports upward so the form can block a submit
 * that is already known to fail.
 */

export type TableAvailability = {
  checking: boolean
  available: boolean | null
  message: string
  freeTables: number
}

export const IDLE_AVAILABILITY: TableAvailability = {
  checking: false,
  available: null,
  message: '',
  freeTables: 0,
}

export function useTableAvailability(
  date: string,
  time: string,
  guestCount: number | string,
): TableAvailability {
  const [state, setState] = useState<TableAvailability>(IDLE_AVAILABILITY)

  useEffect(() => {
    if (!date || !time) {
      setState(IDLE_AVAILABILITY)
      return
    }

    // Date and time inputs fire per keystroke; wait for them to settle.
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, checking: true }))
      try {
        const res = await fetch('/api/tables/available', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, time, guestCount: Number(guestCount) || 1 }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not check availability')

        setState({
          checking: false,
          available: data.available,
          message: data.message,
          freeTables: data.tables?.length ?? 0,
        })
      } catch (error) {
        setState({
          checking: false,
          available: null,
          message: error instanceof Error ? error.message : 'Could not check availability',
          freeTables: 0,
        })
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [date, time, guestCount])

  return state
}

export function TableAvailabilityNote({ state }: { state: TableAvailability }) {
  if (state.checking) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking availability…
      </p>
    )
  }

  if (!state.message) return null

  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-medium ${
        state.available ? 'text-emerald-600' : 'text-destructive'
      }`}
    >
      {state.available ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {state.message}
    </p>
  )
}
