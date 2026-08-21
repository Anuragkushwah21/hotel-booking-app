'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  PanelLeftClose, PanelLeft, LogOut, LayoutDashboard, BedDouble,
  CalendarCheck, BarChart3, UtensilsCrossed, PlusCircle, ChevronRight, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Staff = { name: string | null; email: string; role: 'HOTEL_MANAGER' | 'ADMIN' }

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  /** Match the pathname exactly — needed so /admin isn't active everywhere. */
  exact?: boolean
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ label: 'Dashboard', href: '/admin', icon: LayoutDashboard, exact: true }],
  },
  {
    section: 'Front desk',
    items: [
      { label: 'New booking', href: '/admin/bookings/new', icon: PlusCircle },
      { label: 'Bookings', href: '/admin/bookings', icon: CalendarCheck },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { label: 'Rooms', href: '/admin/rooms', icon: BedDouble },
      { label: 'Tables', href: '/admin/tables', icon: UtensilsCrossed },
    ],
  },
  {
    section: 'Insights',
    items: [{ label: 'Reports', href: '/admin/analytics', icon: BarChart3 }],
  },
]

/** Flat list used to resolve the current page's title for the top bar. */
const FLAT = NAV.flatMap((g) => g.items)

function initials(user: Staff): string {
  const source = user.name?.trim() || user.email
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function AdminShell({ user, children }: { user: Staff; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Remember the sidebar state so it doesn't reset on every navigation.
  useEffect(() => {
    setCollapsed(localStorage.getItem('admin:sidebar') === 'collapsed')
  }, [])

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem('admin:sidebar', c ? 'expanded' : 'collapsed')
      return !c
    })
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  // Longest matching href wins, so /admin/bookings/new beats /admin/bookings.
  const current = [...FLAT]
    .filter((i) => isActive(i.href, i.exact))
    .sort((a, b) => b.href.length - a.href.length)[0]

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      {/* ---------------- Sidebar ---------------- */}
      <aside
        className={cn(
          'hidden flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-300 transition-[width] duration-200 md:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-zinc-800 px-4">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            H
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">HotelBook</p>
              <p className="truncate text-[11px] text-zinc-500">Property manager</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.section}>
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  {group.section}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href, item.exact)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-zinc-800 font-medium text-white'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex-shrink-0 border-t border-zinc-800 p-3">
          <Link
            href="/"
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100',
              collapsed && 'justify-center px-0',
            )}
            title={collapsed ? 'View public site' : undefined}
          >
            <ExternalLink className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>View site</span>}
          </Link>
        </div>
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-border/70 bg-card px-4 sm:px-6">
          <button
            onClick={toggle}
            className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
            {current && current.href !== '/admin' && (
              <>
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60" />
                <span className="truncate font-medium text-foreground">{current.label}</span>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short',
              })}
            </span>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {initials(user)}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="max-w-[150px] truncate text-xs font-medium text-foreground">
                  {user.name || user.email}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {user.role === 'ADMIN' ? 'Administrator' : 'Hotel manager'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Log out"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile nav — the sidebar is hidden below md */}
        <div className="flex gap-1 overflow-x-auto border-b border-border/70 bg-card px-3 py-2 md:hidden">
          {FLAT.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                  isActive(item.href, item.exact)
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
