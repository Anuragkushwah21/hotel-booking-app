import { redirect } from 'next/navigation'
import { getCurrentUser, isStaff } from '@/lib/auth'
import { AdminShell } from '@/components/admin/admin-shell'

export const dynamic = 'force-dynamic'

/**
 * Authoritative gate for the whole dashboard. Middleware only checks that a
 * cookie exists; this is where the role is actually verified, on the server,
 * before any admin UI is rendered.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) redirect('/login?next=/admin')
  if (!isStaff(user.role)) redirect('/?error=forbidden')

  return (
    <AdminShell
      user={{ name: user.name, email: user.email, role: user.role as 'HOTEL_MANAGER' | 'ADMIN' }}
    >
      {children}
    </AdminShell>
  )
}
