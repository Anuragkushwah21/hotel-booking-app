/**
 * Server-component guard for ADMIN-only dashboard pages (settings, pricing,
 * users, payments, reports). The admin layout already admits staff; this
 * narrows to ADMIN and sends a HOTEL_MANAGER back to the dashboard.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from './auth'

export async function requireAdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/admin')
  if (user.role !== 'ADMIN') redirect('/admin?error=admin-only')
  return user
}
