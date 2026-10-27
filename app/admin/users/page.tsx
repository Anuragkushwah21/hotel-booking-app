import { requireAdminPage } from '@/lib/admin-guard'
import { UsersView } from '@/components/admin/users/users-view'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const user = await requireAdminPage()
  return <UsersView currentUserId={user.id} />
}
