import { cn } from '@/lib/utils'

export type Role = 'GUEST' | 'HOTEL_MANAGER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'DEACTIVE'

/** Row shape of GET /api/admin/users. */
export type UserRow = {
  id: string
  email: string
  name: string | null
  phone: string | null
  role: Role
  status: UserStatus
  emailVerified: boolean
  createdAt: string
  hasAccount: boolean
  bookings: number
  lastBookingAt: string | null
  totalPaid: number
  outstanding: number
  paymentState: 'NONE' | 'DUE' | 'SETTLED'
}

export const ROLE_LABEL: Record<Role, string> = {
  GUEST: 'Guest',
  HOTEL_MANAGER: 'Manager',
  ADMIN: 'Admin',
}

const pill =
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap'

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        pill,
        role === 'ADMIN'
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : role === 'HOTEL_MANAGER'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

export function AccountBadge({ user }: { user: Pick<UserRow, 'status' | 'hasAccount' | 'role'> }) {
  if (user.status === 'DEACTIVE') {
    return <span className={cn(pill, 'border-rose-200 bg-rose-50 text-rose-700')}>Deactivated</span>
  }
  if (!user.hasAccount) {
    return (
      <span className={cn(pill, 'border-amber-200 bg-amber-50 text-amber-700')}>
        {user.role === 'GUEST' ? 'No login' : 'Invite pending'}
      </span>
    )
  }
  return <span className={cn(pill, 'border-emerald-200 bg-emerald-50 text-emerald-700')}>Active</span>
}

export const initials = (name: string | null, email: string) =>
  (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

export function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials(name, email)}
    </span>
  )
}
