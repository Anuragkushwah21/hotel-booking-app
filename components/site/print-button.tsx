'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** "Print / Save as PDF" — the browser's print dialog offers Save as PDF on every platform. */
export function PrintButton({ label = 'Print / Save as PDF', className }: { label?: string; className?: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className={className}>
      <Printer className="mr-2 h-4 w-4" aria-hidden />
      {label}
    </Button>
  )
}
