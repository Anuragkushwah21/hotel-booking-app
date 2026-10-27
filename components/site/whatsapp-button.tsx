'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { HOTEL } from '@/lib/hotel'

/**
 * Floating "Chat on WhatsApp" support button for the public site.
 *
 * Number: NEXT_PUBLIC_WHATSAPP_NUMBER when set, else the hotel's WhatsApp
 * (falling back to the main phone). wa.me wants digits only, with country code.
 */

const RAW_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || HOTEL.contact.whatsapp || HOTEL.contact.phone

const DIGITS = RAW_NUMBER.replace(/\D/g, '')

/** Pages with a full-width pay / submit button near the bottom of the screen on phones. */
const CTA_PAGES = ['/checkout', '/booking-confirmed', '/booking-status']

export function WhatsAppButton() {
  const pathname = usePathname() ?? ''
  if (!DIGITS) return null

  const hasCta = CTA_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const href = `https://wa.me/${DIGITS}?text=${encodeURIComponent(`Hi ${HOTEL.name}, I have a question.`)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with ${HOTEL.name} on WhatsApp (opens in a new tab)`}
      title="Chat with us on WhatsApp"
      className={cn(
        'fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 hover:bg-[#1ebe5b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40 print:hidden sm:bottom-6 sm:right-6',
        // On phones, lift it clear of the pay / continue buttons that sit at
        // the bottom of the viewport on these pages.
        hasCta ? 'bottom-24' : 'bottom-4',
      )}
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor" aria-hidden>
        <path d="M16.04 3C9.4 3 4 8.38 4 15c0 2.12.56 4.19 1.62 6.02L4 29l8.17-1.6A12.07 12.07 0 0 0 16.04 27C22.67 27 28 21.62 28 15S22.67 3 16.04 3Zm0 21.8c-1.8 0-3.56-.48-5.1-1.4l-.37-.22-4.85.95.97-4.71-.24-.39A9.73 9.73 0 0 1 6.3 15c0-5.37 4.37-9.74 9.74-9.74 5.36 0 9.66 4.37 9.66 9.74 0 5.37-4.3 9.8-9.66 9.8Zm5.35-7.3c-.29-.15-1.73-.85-2-.95-.27-.1-.46-.15-.66.15-.2.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.23-.45-2.35-1.44-.87-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.58-.9-2.16-.24-.57-.48-.49-.66-.5h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.43s1.05 2.82 1.2 3.01c.15.2 2.06 3.14 4.99 4.4.7.3 1.24.48 1.67.61.7.22 1.34.19 1.84.12.56-.08 1.73-.7 1.97-1.38.24-.68.24-1.26.17-1.38-.07-.12-.27-.2-.56-.34Z" />
      </svg>
    </a>
  )
}
