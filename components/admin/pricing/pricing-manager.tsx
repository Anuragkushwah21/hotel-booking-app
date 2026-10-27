'use client'

import { PageHeader } from '@/components/admin/ui'
import { RatesTable } from '@/components/admin/pricing/rates-table'
import { DatedList } from '@/components/admin/pricing/dated-list'

export function PricingManager() {
  return (
    <div>
      <PageHeader
        title="Rates & premium dates"
        description="Nightly rates per room, plus the peak seasons and event dates that trigger premium pricing."
      />

      <div className="grid gap-6">
        <RatesTable />

        <div className="grid gap-6 lg:grid-cols-2">
          <DatedList
            mode="range"
            endpoint="/api/admin/pricing/peak-seasons"
            title="Peak seasons"
            description="Date ranges charged at the peak rate."
            noun="peak season"
            namePlaceholder="Diwali week"
            emptyDescription="Add a date range, such as a festival week, to charge peak rates."
          />
          <DatedList
            mode="single"
            endpoint="/api/admin/pricing/special-dates"
            title="Event dates"
            description="Single nights charged at the event rate."
            noun="event date"
            namePlaceholder="New Year's Eve"
            emptyDescription="Add a single night, such as New Year's Eve, to charge the event rate."
          />
        </div>
      </div>
    </div>
  )
}
