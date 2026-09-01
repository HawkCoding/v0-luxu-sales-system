"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DepositSettingsCard } from "@/components/settings/deposit-settings-card"
import { DefaultCommissionSettingsCard } from "@/components/settings/default-commission-card"
import { HotelDefaultTimesCard } from "@/components/settings/hotel-default-times-card"
import { TrainChildPriceRatioCard } from "@/components/settings/train-child-price-ratio-card"
import { DefaultAgeBandsCard } from "@/components/settings/default-age-bands-card"
import { QuoteValidityCard } from "@/components/settings/quote-validity-card"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import { useRole } from "@/lib/role-context"

export default function DefaultsSettingsPage() {
  const { can } = useRole()
  const canEditSettings = can("edit:settings")

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/app/settings">
          <Button variant="ghost" size="sm" aria-label="Back to settings">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Defaults</h1>
          <p className="text-sm text-muted-foreground">
            Default values applied to new quotes, invoices and bookings. Suppliers and individual
            jobs can still override most of these.
          </p>
        </div>
      </div>

      {!canEditSettings && (
        <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can view these settings, but only admins and managers can change them.
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quoting & Invoicing
        </h2>
        <DepositSettingsCard canEdit={canEditSettings} />
        <DefaultCommissionSettingsCard canEdit={canEditSettings} />
        {QUOTE_VALIDITY_ENABLED && <QuoteValidityCard canEdit={canEditSettings} />}
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pricing & Passengers
        </h2>
        <HotelDefaultTimesCard canEdit={canEditSettings} />
        <TrainChildPriceRatioCard canEdit={canEditSettings} />
        <DefaultAgeBandsCard canEdit={canEditSettings} />
      </div>
    </div>
  )
}
