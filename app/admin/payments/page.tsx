import { requireAdminPage } from '@/lib/admin-guard'
import { PaymentsConsole } from '@/components/admin/bookings/payments-console'

export const dynamic = 'force-dynamic'

/** Refund queue + payment ledger. ADMIN only: refunds move money out. */
export default async function AdminPaymentsPage() {
  await requireAdminPage()
  return <PaymentsConsole />
}
