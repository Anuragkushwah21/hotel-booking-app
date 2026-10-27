import { requireAdminPage } from '@/lib/admin-guard'
import { PricingManager } from '@/components/admin/pricing/pricing-manager'

export const metadata = { title: 'Rates & premium dates · Admin' }

/** ADMIN-only: the layout admits all staff, this narrows to ADMIN. */
export default async function AdminPricingPage() {
  await requireAdminPage()
  return <PricingManager />
}
