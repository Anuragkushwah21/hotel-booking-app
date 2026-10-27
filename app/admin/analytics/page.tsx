import { requireAdminPage } from '@/lib/admin-guard'
import { AnalyticsView } from '@/components/admin/analytics/analytics-view'

export const dynamic = 'force-dynamic'

/** Reports run on /api/admin/reports, which is ADMIN-only — so is this page. */
export default async function AdminReportsPage() {
  await requireAdminPage()
  return <AnalyticsView />
}
