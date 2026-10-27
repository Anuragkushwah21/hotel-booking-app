'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, UserPlus, Users, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PageHeader, Panel, EmptyState, ErrorState, TableSkeleton, inr,
} from '@/components/admin/ui'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AccountBadge, Avatar, RoleBadge, type UserRow } from './shared'
import { InviteStaffDialog } from './invite-staff-dialog'
import { UserDetailDialog } from './user-detail-dialog'

type Tab = 'STAFF' | 'GUEST'
type Pagination = { page: number; limit: number; total: number; pages: number }

const PAGE_SIZE = 25

async function fetchUsers(params: Record<string, string>) {
  const res = await fetch(`/api/admin/users?${new URLSearchParams(params)}`, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load users')
  return data as { users: UserRow[]; pagination: Pagination }
}

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>('STAFF')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [dueOnly, setDueOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<UserRow[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selected, setSelected] = useState<UserRow | null>(null)

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'STAFF') {
        // Staff is a small set across two roles; the list API filters one role at a time.
        const base = { limit: '100', ...(q ? { q } : {}) }
        const [admins, managers] = await Promise.all([
          fetchUsers({ ...base, role: 'ADMIN' }),
          fetchUsers({ ...base, role: 'HOTEL_MANAGER' }),
        ])
        setRows([...admins.users, ...managers.users])
        setPagination(null)
      } else {
        const data = await fetchUsers({
          role: 'GUEST',
          page: String(page),
          limit: String(PAGE_SIZE),
          ...(q ? { q } : {}),
          ...(dueOnly ? { balance: 'due' } : {}),
        })
        setRows(data.users)
        setPagination(data.pagination)
      }
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab, q, page, dueOnly])

  useEffect(() => {
    load()
  }, [load])

  const switchTab = (t: Tab) => {
    setTab(t)
    setPage(1)
    setRows([])
  }

  const staff = tab === 'STAFF'

  return (
    <div>
      <PageHeader
        title="Users"
        description="Staff accounts and the guests who have booked with you."
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Invite staff
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border/70 bg-card p-0.5">
          {([
            ['STAFF', 'Staff', ShieldCheck],
            ['GUEST', 'Guests', Users],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchTab(value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Name, email or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {!staff && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={dueOnly}
              onChange={(e) => {
                setDueOnly(e.target.checked)
                setPage(1)
              }}
            />
            Balance due only
          </label>
        )}
      </div>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <Panel className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={staff ? ShieldCheck : Users}
            title={q ? 'No matches' : staff ? 'No staff yet' : 'No guests yet'}
            description={
              q ? 'Try a different name, email or phone.' : staff ? 'Invite a manager to share the front desk.' : undefined
            }
            action={
              staff && !q ? (
                <Button size="sm" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Invite staff
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* phone: stacked list */}
            <ul className="divide-y divide-border/70 md:hidden">
              {rows.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(u)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <Avatar name={u.name} email={u.email} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {u.name || u.email}
                        {u.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <RoleBadge role={u.role} />
                        <AccountBadge user={u} />
                      </div>
                    </div>
                    {!staff && (
                      <div className="text-right text-xs">
                        <p className="tabular-nums">{u.bookings} bkg</p>
                        {u.outstanding > 0 && (
                          <p className="font-medium tabular-nums text-rose-600">{inr(u.outstanding)} due</p>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {/* md+: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40">
                    {(staff
                      ? ['User', 'Phone', 'Role', 'Account', 'Added']
                      : ['Guest', 'Phone', 'Account', 'Bookings', 'Last booking', 'Paid', 'Outstanding']
                    ).map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                          !staff && (i === 3 || i >= 5) ? 'text-right' : 'text-left',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rows.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(u)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} email={u.email} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {u.name || '—'}
                              {u.id === currentUserId && (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
                              )}
                            </p>
                            <p className="max-w-[240px] truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{u.phone || '—'}</td>
                      {staff ? (
                        <>
                          <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                          <td className="px-4 py-3"><AccountBadge user={u} /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3"><AccountBadge user={u} /></td>
                          <td className="px-4 py-3 text-right tabular-nums">{u.bookings}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {u.lastBookingAt ? formatDate(u.lastBookingAt) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{inr(u.totalPaid)}</td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums',
                              u.outstanding > 0 ? 'text-rose-600' : 'text-muted-foreground',
                            )}
                          >
                            {u.outstanding > 0 ? inr(u.outstanding) : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Page {pagination.page} of {pagination.pages} · {pagination.total} guests
            </span>
            <div className="flex gap-1">
              <Button
                size="sm" variant="outline" className="h-7 w-7 p-0"
                disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 w-7 p-0"
                disabled={page >= pagination.pages || loading} onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <InviteStaffDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => {
          if (tab === 'STAFF') load()
          else switchTab('STAFF')
        }}
      />
      <UserDetailDialog
        row={selected}
        currentUserId={currentUserId}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </div>
  )
}
