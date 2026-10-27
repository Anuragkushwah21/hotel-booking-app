import { requireAdminPage } from '@/lib/admin-guard'
import { SettingsForm } from '@/components/admin/settings/settings-form'

export const metadata = { title: 'Settings · Admin' }

/** ADMIN-only: the layout admits all staff, this narrows to ADMIN. */
export default async function AdminSettingsPage() {
  await requireAdminPage()
  return <SettingsForm />
}
