'use client'

import * as Icons from 'lucide-react'
import { HelpCircle } from 'lucide-react'

/**
 * Resolves an icon by name so config files (lib/hotel.ts) and API payloads
 * can reference icons as plain strings without importing React.
 */
export function Icon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const Cmp = (Icons as unknown as Record<string, React.ElementType>)[name]
  const Resolved = typeof Cmp === 'function' || typeof Cmp === 'object' ? Cmp : HelpCircle
  return <Resolved className={className} />
}
