'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Menu, X, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'

/** Public site navigation — the "get to know the hotel" path. */
const SITE_LINKS = [
  { href: '/rooms', label: 'Rooms' },
  { href: '/services', label: 'Services' },
  { href: '/#dining', label: 'Dining' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/#contact', label: 'Contact' },
]

export function Header() {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Shared with every other consumer, so a login updates the header at once.
  const { user, loading: loadingUser, clear } = useAuth()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    clear()
    router.push('/')
  }

  // role‑based redirect for profile/admin button
  const handleRoleRedirect = () => {
    if (!user) return
    if (user.role === 'ADMIN' || user.isAdmin) {
      router.push('/admin')
    } else {
      router.push('/rooms')
    }
  }

  return (
    <header className="bg-white border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">
                H
              </span>
            </div>
            <span className="font-semibold text-foreground text-lg hidden sm:block">
              HotelBook
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-6 md:flex">
            {SITE_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-foreground transition hover:text-primary"
              >
                {l.label}
              </Link>
            ))}

            {user && (user.role === 'ADMIN' || user.isAdmin) && (
              <Link
                href="/admin"
                className="text-sm font-medium text-primary transition hover:text-primary/80"
              >
                Dashboard
              </Link>
            )}

            {/* Signed in → the guest's own list; signed out (or a walk-in guest
                with no password) → the booking-number lookup. */}
            <Link
              href={user ? '/bookings' : '/booking-status'}
              className="text-sm text-foreground transition hover:text-primary"
            >
              My Bookings
            </Link>
          </nav>

          {/* Auth / Profile */}
          <div className="flex items-center gap-4">
            {!loadingUser && user ? (
              <>
                <button
                  onClick={handleRoleRedirect}
                  className="flex items-center gap-2 text-foreground hover:text-primary transition"
                >
                  <User size={20} />
                  <span className="hidden sm:block">
                    {user.name || user.email}
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-destructive hover:text-destructive/80 transition"
                >
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              !loadingUser && (
                <>
                  <Link href="/login">
                    <Button variant="ghost">Login</Button>
                  </Link>
                  <Link href="/signup">
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                      Sign Up
                    </Button>
                  </Link>
                </>
              )
            )}

            {/* Mobile Menu Button */}
            <button
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="border-t border-border py-3 md:hidden">
            {SITE_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setIsMenuOpen(false)}
                className="block py-2 text-foreground hover:text-primary"
              >
                {l.label}
              </Link>
            ))}

            <Link
              href={user ? '/bookings' : '/booking-status'}
              onClick={() => setIsMenuOpen(false)}
              className="block py-2 text-foreground hover:text-primary"
            >
              My Bookings
            </Link>

            {user && (user.role === 'ADMIN' || user.isAdmin) && (
              <Link
                href="/admin"
                onClick={() => setIsMenuOpen(false)}
                className="block py-2 font-medium text-primary"
              >
                Dashboard
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}