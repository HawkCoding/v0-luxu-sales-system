"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTransition } from "@/components/ui/content-transition"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"
import { useLocations, useSupplierDetail } from "@/lib/use-data"
import {
  SUPPLIER_KIND_LABELS,
  type Location,
  type SupplierDetail,
  type SupplierKind,
  type SupplierPackage,
  type SupplierRateCard,
  type SupplierSeasonalPeriod,
} from "@/lib/types"

type Presentation = "page" | "modal"

interface SupplierDetailViewProps {
  supplierId: string
  presentation?: Presentation
}

interface EditablePricingOption {
  id: string
  name: string
  singlePrice: number
  doublePrice: number
  familyPrice: number
  currency: string
  isPrimary: boolean
}

interface EditableRoute {
  id: string
  name: string
  originLocationId: string
  destinationLocationId: string
  active: boolean
}

interface EditableSuiteType {
  id: string
  name: string
  active: boolean
}

interface EditableRateCard {
  id: string
  routeId: string | null
  suiteTypeId: string
  pricePerPerson: number
  currency: string
  validFrom: string
  validTo: string | null
}

interface EditablePackage {
  id: string
  name: string
  description: string
  durationNights: number | null
  singleSupplementPct: number
  currency: string
  active: boolean
  routes: EditableRoute[]
  suiteTypes: EditableSuiteType[]
  rateCards: EditableRateCard[]
}

interface EditableSeasonalPrice {
  id: string
  optionId: string
  singlePrice: number
  doublePrice: number
  familyPrice: number
}

interface EditableSeasonalPeriod {
  id: string
  label: string
  validFrom: string
  validTo: string
  prices: EditableSeasonalPrice[]
}

interface SupplierFormState {
  name: string
  kind: SupplierKind
  email: string
  phone: string
  website: string
  location: string
  notes: string
  active: boolean
  pricingOptions: EditablePricingOption[]
  packages: EditablePackage[]
  seasonalPeriods: EditableSeasonalPeriod[]
}

interface SupplierDetailSkeletonProps {
  presentation?: Presentation
}

interface RatePeriodGroup {
  key: string
  label: string
  currency: string
  validFrom: string
  validTo: string | null
  items: SupplierRateCard[]
}

interface EditableRatePeriodGroup {
  key: string
  currency: string
  validFrom: string
  validTo: string | null
  items: EditableRateCard[]
}

function makeClientId(): string {
  return crypto.randomUUID()
}

function createEmptyPricingOption(): EditablePricingOption {
  return {
    id: makeClientId(),
    name: "",
    singlePrice: 0,
    doublePrice: 0,
    familyPrice: 0,
    currency: "ZAR",
    isPrimary: false,
  }
}

function createEmptyRoute(locations: Location[]): EditableRoute {
  const origin = locations[0]?.id ?? ""
  const destination = locations[1]?.id ?? origin

  return {
    id: makeClientId(),
    name: "",
    originLocationId: origin,
    destinationLocationId: destination,
    active: true,
  }
}

function createEmptySuiteType(): EditableSuiteType {
  return {
    id: makeClientId(),
    name: "",
    active: true,
  }
}

function createEmptyPackage(): EditablePackage {
  return {
    id: makeClientId(),
    name: "",
    description: "",
    durationNights: null,
    singleSupplementPct: 50,
    currency: "ZAR",
    active: true,
    routes: [],
    suiteTypes: [],
    rateCards: [],
  }
}

function createEmptySeasonalPeriod(): EditableSeasonalPeriod {
  return {
    id: makeClientId(),
    label: "",
    validFrom: "",
    validTo: "",
    prices: [],
  }
}

function createEmptySeasonalPrice(optionId: string): EditableSeasonalPrice {
  return {
    id: makeClientId(),
    optionId,
    singlePrice: 0,
    doublePrice: 0,
    familyPrice: 0,
  }
}

function buildFormState(supplier: SupplierDetail): SupplierFormState {
  return {
    name: supplier.name,
    kind: supplier.kind,
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    website: supplier.website ?? "",
    location: supplier.location ?? "",
    notes: supplier.notes ?? "",
    active: supplier.active,
    pricingOptions:
      supplier.pricingOptions.length > 0
        ? supplier.pricingOptions.map((option) => ({
            id: option.id,
            name: option.name,
            singlePrice: option.singlePrice,
            doublePrice: option.doublePrice,
            familyPrice: option.familyPrice,
            currency: option.currency,
            isPrimary: option.isPrimary,
          }))
        : [createEmptyPricingOption()],
    packages: supplier.packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description ?? "",
      durationNights: pkg.durationNights,
      singleSupplementPct: pkg.singleSupplementPct,
      currency: pkg.currency,
      active: pkg.active,
      routes: pkg.routes.map((route) => ({
        id: route.id,
        name: route.name,
        originLocationId: route.originLocationId,
        destinationLocationId: route.destinationLocationId,
        active: route.active,
      })),
      suiteTypes: pkg.suiteTypes.map((suiteType) => ({
        id: suiteType.id,
        name: suiteType.name,
        active: suiteType.active,
      })),
      rateCards: pkg.rateCards.map((rateCard) => ({
        id: rateCard.id,
        routeId: rateCard.routeId,
        suiteTypeId: rateCard.suiteTypeId,
        pricePerPerson: rateCard.pricePerPerson,
        currency: rateCard.currency,
        validFrom: rateCard.validFrom,
        validTo: rateCard.validTo,
      })),
    })),
    seasonalPeriods: supplier.seasonalPeriods.map((period) => ({
      id: period.id,
      label: period.label ?? "",
      validFrom: period.validFrom,
      validTo: period.validTo,
      prices: period.prices.map((price) => ({
        id: price.id,
        optionId: price.optionId,
        singlePrice: price.singlePrice,
        doublePrice: price.doublePrice,
        familyPrice: price.familyPrice,
      })),
    })),
  }
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDateRange(validFrom: string, validTo: string | null) {
  const from = validFrom ? new Date(validFrom).toLocaleDateString() : "Open"
  const to = validTo ? new Date(validTo).toLocaleDateString() : "Open ended"
  return `${from} - ${to}`
}

function getRatePeriodKey(
  validFrom: string,
  validTo: string | null,
  currency: string,
): string {
  return `${validFrom}|${validTo ?? ""}|${currency}`
}

function groupRateCardsByPeriod(rateCards: SupplierRateCard[]): RatePeriodGroup[] {
  const groups = new Map<string, RatePeriodGroup>()

  for (const rateCard of rateCards) {
    const key = getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency)
    const current = groups.get(key)
    if (current) {
      current.items.push(rateCard)
      continue
    }

    groups.set(key, {
      key,
      label: formatDateRange(rateCard.validFrom, rateCard.validTo),
      currency: rateCard.currency,
      validFrom: rateCard.validFrom,
      validTo: rateCard.validTo,
      items: [rateCard],
    })
  }

  return Array.from(groups.values()).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
}

function groupEditableRateCardsByPeriod(
  rateCards: EditableRateCard[],
): EditableRatePeriodGroup[] {
  const groups = new Map<string, EditableRatePeriodGroup>()

  for (const rateCard of rateCards) {
    const key = getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency)
    const current = groups.get(key)
    if (current) {
      current.items.push(rateCard)
      continue
    }

    groups.set(key, {
      key,
      currency: rateCard.currency,
      validFrom: rateCard.validFrom,
      validTo: rateCard.validTo,
      items: [rateCard],
    })
  }

  return Array.from(groups.values()).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
}

function getContainerClass(presentation: Presentation) {
  return presentation === "page"
    ? "p-6 space-y-6 max-w-6xl"
    : "max-h-[80vh] overflow-y-auto p-6 space-y-6"
}

function getLocationName(locationsById: Record<string, Location>, id: string) {
  return locationsById[id]?.name ?? "Unknown location"
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="space-y-1">
      <p
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {label}
      </p>
      <p className="text-sm text-foreground">{value || "-"}</p>
    </div>
  )
}

function PackageRateCardMatrix({
  pkg,
  locationsById,
}: {
  pkg: SupplierPackage
  locationsById: Record<string, Location>
}) {
  const periodGroups = groupRateCardsByPeriod(pkg.rateCards)

  if (periodGroups.length === 0 || pkg.suiteTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No rate cards have been configured for this package yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {periodGroups.map((period) => {
        const hasAllRoutes = period.items.some((item) => item.routeId === null)
        const routeColumns = hasAllRoutes ? [...pkg.routes, null] : pkg.routes

        return (
          <div key={period.key} className="rounded-lg border overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-secondary/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{period.label}</p>
                <p className="text-xs text-muted-foreground">
                  {period.currency} per person sharing (single: +
                  {pkg.singleSupplementPct.toFixed(0)}%)
                </p>
              </div>
              <Badge variant="outline">{period.currency}</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-secondary/20">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Suite Type
                    </th>
                    {routeColumns.map((route) => (
                      <th
                        key={route?.id ?? "all-routes"}
                        className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {route
                          ? `${getLocationName(
                              locationsById,
                              route.originLocationId,
                            )} -> ${getLocationName(
                              locationsById,
                              route.destinationLocationId,
                            )}`
                          : "All Routes"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pkg.suiteTypes.map((suiteType) => (
                    <tr key={suiteType.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{suiteType.name}</td>
                      {routeColumns.map((route) => {
                        const match = period.items.find(
                          (item) =>
                            item.suiteTypeId === suiteType.id &&
                            item.routeId === (route?.id ?? null),
                        )

                        return (
                          <td
                            key={`${suiteType.id}-${route?.id ?? "all"}`}
                            className="px-4 py-3 text-muted-foreground"
                          >
                            {match ? (
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {formatCurrency(match.pricePerPerson, match.currency)}
                                </p>
                                <p className="text-xs">
                                  Single:{" "}
                                  {formatCurrency(
                                    match.pricePerPerson * (1 + pkg.singleSupplementPct / 100),
                                    match.currency,
                                  )}
                                </p>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface RateCardMatrixEditorProps {
  pkg: EditablePackage
  packageIndex: number
  locationsById: Record<string, Location>
  onAddPeriod: (packageIndex: number) => void
  onRemovePeriod: (packageIndex: number, periodKey: string) => void
  onUpdatePeriodField: (
    packageIndex: number,
    periodKey: string,
    key: "validFrom" | "validTo" | "currency",
    value: string | null,
  ) => void
  onUpdateCellPrice: (
    packageIndex: number,
    rateCardId: string,
    value: number,
  ) => void
  onToggleCell: (
    packageIndex: number,
    periodKey: string,
    suiteTypeId: string,
    routeId: string | null,
    enabled: boolean,
  ) => void
}

function RateCardMatrixEditor({
  pkg,
  packageIndex,
  locationsById,
  onAddPeriod,
  onRemovePeriod,
  onUpdatePeriodField,
  onUpdateCellPrice,
  onToggleCell,
}: RateCardMatrixEditorProps) {
  const periodGroups = groupEditableRateCardsByPeriod(pkg.rateCards)

  if (pkg.suiteTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Add at least one suite type before configuring rate cards.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Rate cards</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAddPeriod(packageIndex)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add pricing period
        </Button>
      </div>

      {periodGroups.length > 0 ? (
        periodGroups.map((period) => {
          const hasAllRoutes = period.items.some((item) => item.routeId === null)
          const routeColumns =
            pkg.routes.length === 0
              ? [null]
              : hasAllRoutes
                ? [...pkg.routes, null]
                : pkg.routes

          return (
            <div key={period.key} className="rounded-lg border overflow-hidden">
              <div className="grid gap-3 border-b bg-secondary/30 px-4 py-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Valid from</Label>
                  <Input
                    type="date"
                    value={period.validFrom}
                    onChange={(event) =>
                      onUpdatePeriodField(
                        packageIndex,
                        period.key,
                        "validFrom",
                        event.target.value,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid to</Label>
                  <Input
                    type="date"
                    value={period.validTo ?? ""}
                    onChange={(event) =>
                      onUpdatePeriodField(
                        packageIndex,
                        period.key,
                        "validTo",
                        event.target.value || null,
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input
                    maxLength={10}
                    value={period.currency}
                    onChange={(event) =>
                      onUpdatePeriodField(
                        packageIndex,
                        period.key,
                        "currency",
                        event.target.value.toUpperCase(),
                      )
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => onRemovePeriod(packageIndex, period.key)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove period
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-secondary/20">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Suite Type
                      </th>
                      {routeColumns.map((route) => (
                        <th
                          key={route?.id ?? "all-routes"}
                          className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {route
                            ? `${getLocationName(
                                locationsById,
                                route.originLocationId,
                              )} -> ${getLocationName(
                                locationsById,
                                route.destinationLocationId,
                              )}`
                            : "All Routes"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.suiteTypes.map((suiteType) => (
                      <tr key={suiteType.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{suiteType.name}</td>
                        {routeColumns.map((route) => {
                          const routeId = route?.id ?? null
                          const match = period.items.find(
                            (item) =>
                              item.suiteTypeId === suiteType.id && item.routeId === routeId,
                          )

                          return (
                            <td key={`${suiteType.id}-${routeId ?? "all"}`} className="px-4 py-3">
                              {match ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={match.pricePerPerson}
                                    onChange={(event) =>
                                      onUpdateCellPrice(
                                        packageIndex,
                                        match.id,
                                        Number(event.target.value || 0),
                                      )
                                    }
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      onToggleCell(
                                        packageIndex,
                                        period.key,
                                        suiteType.id,
                                        routeId,
                                        false,
                                      )
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    onToggleCell(
                                      packageIndex,
                                      period.key,
                                      suiteType.id,
                                      routeId,
                                      true,
                                    )
                                  }
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add
                                </Button>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No rate cards added yet. Add a pricing period to begin.
        </div>
      )}
    </div>
  )
}

function SupplierPackagesReadOnly({
  packages,
  locationsById,
}: {
  packages: SupplierPackage[]
  locationsById: Record<string, Location>
}) {
  if (packages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No packages have been configured for this supplier yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {packages.map((pkg) => (
        <div key={pkg.id} className="rounded-lg border p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-semibold text-foreground">{pkg.name}</p>
                <Badge variant="secondary">
                  {pkg.durationNights ? `${pkg.durationNights} nights` : "Duration TBD"}
                </Badge>
                <Badge variant="outline">
                  Single supplement {pkg.singleSupplementPct}%
                </Badge>
                <Badge variant="outline">{pkg.currency}</Badge>
              </div>
              {pkg.description && (
                <p className="text-sm text-muted-foreground">{pkg.description}</p>
              )}
            </div>
            <Badge variant={pkg.active ? "default" : "outline"}>
              {pkg.active ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Routes
              </p>
              {pkg.routes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {pkg.routes.map((route) => (
                    <Badge key={route.id} variant="outline">
                      {getLocationName(locationsById, route.originLocationId)}
                      {" -> "}
                      {getLocationName(locationsById, route.destinationLocationId)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No routes configured.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Suite Types
              </p>
              {pkg.suiteTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {pkg.suiteTypes.map((suiteType) => (
                    <Badge key={suiteType.id} variant="outline">
                      {suiteType.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No suite types configured.</p>
              )}
            </div>
          </div>

          <PackageRateCardMatrix pkg={pkg} locationsById={locationsById} />
        </div>
      ))}
    </div>
  )
}

function SeasonalPricingReadOnly({
  periods,
  optionNameById,
}: {
  periods: SupplierSeasonalPeriod[]
  optionNameById: Record<string, string>
}) {
  if (periods.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No seasonal pricing periods have been configured for this supplier yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {periods.map((period) => (
        <div key={period.id} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {period.label || "Untitled period"}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateRange(period.validFrom, period.validTo)}
              </p>
            </div>
            <Badge variant="outline">
              <CalendarDays className="mr-1 h-3 w-3" />
              Seasonal pricing
            </Badge>
          </div>

          {period.prices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/20">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Option
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Single
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Double
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Family
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {period.prices.map((price) => (
                    <tr key={price.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {optionNameById[price.optionId] || "Unknown option"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {price.singlePrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {price.doublePrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {price.familyPrice.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No seasonal price overrides configured for this period.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export function SupplierDetailSkeleton({
  presentation = "page",
}: SupplierDetailSkeletonProps) {
  return (
    <div className={getContainerClass(presentation)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-3 flex-1">
          {presentation === "page" && <Skeleton className="h-8 w-36 rounded-md" />}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function SupplierDetailView({
  supplierId,
  presentation = "page",
}: SupplierDetailViewProps) {
  const router = useRouter()
  const { data, isLoading, mutate: mutateDetail } = useSupplierDetail(supplierId)
  const { data: allLocations = [] } = useLocations()
  const { mutate } = useSWRConfig()
  const { can } = useRole()
  const canEdit = can("edit:suppliers")
  const canDelete = can("delete:suppliers")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [form, setForm] = useState<SupplierFormState | null>(null)

  const supplier = data && !("error" in data) ? data : null

  useEffect(() => {
    if (supplier) {
      setForm(buildFormState(supplier))
    }
  }, [supplier])

  const locations = allLocations.length > 0 ? allLocations : supplier?.locations ?? []

  const locationsById = useMemo(
    () =>
      (supplier?.locations ?? []).reduce<Record<string, Location>>((acc, location) => {
        acc[location.id] = location
        return acc
      }, {}),
    [supplier?.locations],
  )

  const optionNameById = useMemo(
    () =>
      (supplier?.pricingOptions ?? []).reduce<Record<string, string>>((acc, option) => {
        acc[option.id] = option.name
        return acc
      }, {}),
    [supplier?.pricingOptions],
  )

  const updateField = <K extends keyof SupplierFormState>(
    key: K,
    value: SupplierFormState[K],
  ) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const updatePricingOptions = (
    updater: (options: EditablePricingOption[]) => EditablePricingOption[],
  ) => {
    setForm((current) => {
      if (!current) return current
      const nextPricingOptions = updater(current.pricingOptions)
      const validOptionIds = new Set(nextPricingOptions.map((option) => option.id))

      return {
        ...current,
        pricingOptions: nextPricingOptions,
        seasonalPeriods: current.seasonalPeriods.map((period) => ({
          ...period,
          prices: period.prices.filter((price) => validOptionIds.has(price.optionId)),
        })),
      }
    })
  }

  const updatePricingOption = (
    index: number,
    key: keyof EditablePricingOption,
    value: string | number | boolean,
  ) => {
    updatePricingOptions((options) =>
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [key]: value } : option,
      ),
    )
  }

  const markPrimaryOption = (index: number) => {
    updatePricingOptions((options) =>
      options.map((option, optionIndex) => ({
        ...option,
        isPrimary: optionIndex === index,
      })),
    )
  }

  const addPricingOption = () => {
    updatePricingOptions((options) => [...options, createEmptyPricingOption()])
  }

  const removePricingOption = (index: number) => {
    updatePricingOptions((options) => {
      const nextOptions = options.filter((_option, optionIndex) => optionIndex !== index)
      if (nextOptions.length === 0) {
        return [createEmptyPricingOption()]
      }
      if (!nextOptions.some((option) => option.isPrimary)) {
        nextOptions[0] = { ...nextOptions[0], isPrimary: true }
      }
      return nextOptions
    })
  }

  const updatePackages = (updater: (packages: EditablePackage[]) => EditablePackage[]) => {
    setForm((current) =>
      current ? { ...current, packages: updater(current.packages) } : current,
    )
  }

  const updatePackage = (
    packageIndex: number,
    updater: (pkg: EditablePackage) => EditablePackage,
  ) => {
    updatePackages((packages) =>
      packages.map((pkg, index) => (index === packageIndex ? updater(pkg) : pkg)),
    )
  }

  const addPackage = () => {
    updatePackages((packages) => [...packages, createEmptyPackage()])
  }

  const removePackage = (packageIndex: number) => {
    updatePackages((packages) => packages.filter((_pkg, index) => index !== packageIndex))
  }

  const addRoute = (packageIndex: number) => {
    updatePackage(packageIndex, (pkg) => ({
      ...pkg,
      routes: [...pkg.routes, createEmptyRoute(locations)],
    }))
  }

  const updateRoute = (
    packageIndex: number,
    routeIndex: number,
    key: keyof EditableRoute,
    value: string | boolean,
  ) => {
    updatePackage(packageIndex, (pkg) => ({
      ...pkg,
      routes: pkg.routes.map((route, index) =>
        index === routeIndex ? { ...route, [key]: value } : route,
      ),
    }))
  }

  const removeRoute = (packageIndex: number, routeIndex: number) => {
    updatePackage(packageIndex, (pkg) => {
      const routeId = pkg.routes[routeIndex]?.id
      return {
        ...pkg,
        routes: pkg.routes.filter((_route, index) => index !== routeIndex),
        rateCards: pkg.rateCards.map((rateCard) =>
          rateCard.routeId === routeId ? { ...rateCard, routeId: null } : rateCard,
        ),
      }
    })
  }

  const addSuiteType = (packageIndex: number) => {
    updatePackage(packageIndex, (pkg) => ({
      ...pkg,
      suiteTypes: [...pkg.suiteTypes, createEmptySuiteType()],
    }))
  }

  const updateSuiteType = (
    packageIndex: number,
    suiteTypeIndex: number,
    key: keyof EditableSuiteType,
    value: string | boolean,
  ) => {
    updatePackage(packageIndex, (pkg) => ({
      ...pkg,
      suiteTypes: pkg.suiteTypes.map((suiteType, index) =>
        index === suiteTypeIndex ? { ...suiteType, [key]: value } : suiteType,
      ),
    }))
  }

  const removeSuiteType = (packageIndex: number, suiteTypeIndex: number) => {
    updatePackage(packageIndex, (pkg) => {
      const suiteTypeId = pkg.suiteTypes[suiteTypeIndex]?.id
      return {
        ...pkg,
        suiteTypes: pkg.suiteTypes.filter((_suiteType, index) => index !== suiteTypeIndex),
        rateCards: pkg.rateCards.filter((rateCard) => rateCard.suiteTypeId !== suiteTypeId),
      }
    })
  }

  const addRateCardPeriod = (packageIndex: number) => {
    updatePackage(packageIndex, (pkg) => {
      if (pkg.suiteTypes.length === 0) {
        toast.error("Add at least one suite type before creating a pricing period.")
        return pkg
      }

      const today = new Date().toISOString().slice(0, 10)
      const currency = pkg.currency.trim().toUpperCase() || "ZAR"
      const routes = pkg.routes.length > 0 ? pkg.routes : [{ id: null as string | null }]

      const newRateCards = pkg.suiteTypes.flatMap((suiteType) =>
        routes.map((route) => ({
          id: makeClientId(),
          routeId: route.id,
          suiteTypeId: suiteType.id,
          pricePerPerson: 0,
          currency,
          validFrom: today,
          validTo: null,
        })),
      )

      return {
        ...pkg,
        rateCards: [...pkg.rateCards, ...newRateCards],
      }
    })
  }

  const updateRateCardPeriodField = (
    packageIndex: number,
    periodKey: string,
    key: "validFrom" | "validTo" | "currency",
    value: string | null,
  ) => {
    updatePackage(packageIndex, (pkg) => {
      const nextRateCards = pkg.rateCards.map((rateCard) => {
        if (getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) !== periodKey) {
          return rateCard
        }

        if (key === "currency") {
          return {
            ...rateCard,
            currency: (value ?? "").trim().toUpperCase() || pkg.currency.trim().toUpperCase() || "ZAR",
          }
        }

        if (key === "validFrom") {
          return {
            ...rateCard,
            validFrom: value ?? "",
          }
        }

        return {
          ...rateCard,
          validTo: value,
        }
      })

      return {
        ...pkg,
        rateCards: nextRateCards,
      }
    })
  }

  const removeRateCardPeriod = (packageIndex: number, periodKey: string) => {
    updatePackage(packageIndex, (pkg) => ({
      ...pkg,
      rateCards: pkg.rateCards.filter(
        (rateCard) =>
          getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) !== periodKey,
      ),
    }))
  }

  const updateRateCardPrice = (packageIndex: number, rateCardId: string, value: number) => {
    updatePackage(packageIndex, (pkg) => ({
      ...pkg,
      rateCards: pkg.rateCards.map((rateCard) =>
        rateCard.id === rateCardId ? { ...rateCard, pricePerPerson: value } : rateCard,
      ),
    }))
  }

  const toggleRateCardCell = (
    packageIndex: number,
    periodKey: string,
    suiteTypeId: string,
    routeId: string | null,
    enabled: boolean,
  ) => {
    updatePackage(packageIndex, (pkg) => {
      const period = groupEditableRateCardsByPeriod(pkg.rateCards).find(
        (candidate) => candidate.key === periodKey,
      )
      if (!period) return pkg

      const existingCard = period.items.find(
        (item) => item.suiteTypeId === suiteTypeId && item.routeId === routeId,
      )

      if (enabled) {
        if (existingCard) return pkg
        return {
          ...pkg,
          rateCards: [
            ...pkg.rateCards,
            {
              id: makeClientId(),
              routeId,
              suiteTypeId,
              pricePerPerson: 0,
              currency: period.currency,
              validFrom: period.validFrom,
              validTo: period.validTo,
            },
          ],
        }
      }

      if (!existingCard) return pkg
      return {
        ...pkg,
        rateCards: pkg.rateCards.filter((rateCard) => rateCard.id !== existingCard.id),
      }
    })
  }

  const updateSeasonalPeriods = (
    updater: (periods: EditableSeasonalPeriod[]) => EditableSeasonalPeriod[],
  ) => {
    setForm((current) =>
      current ? { ...current, seasonalPeriods: updater(current.seasonalPeriods) } : current,
    )
  }

  const updateSeasonalPeriod = (
    periodIndex: number,
    updater: (period: EditableSeasonalPeriod) => EditableSeasonalPeriod,
  ) => {
    updateSeasonalPeriods((periods) =>
      periods.map((period, index) => (index === periodIndex ? updater(period) : period)),
    )
  }

  const addSeasonalPeriod = () => {
    updateSeasonalPeriods((periods) => [...periods, createEmptySeasonalPeriod()])
  }

  const removeSeasonalPeriod = (periodIndex: number) => {
    updateSeasonalPeriods((periods) => periods.filter((_period, index) => index !== periodIndex))
  }

  const addSeasonalPrice = (periodIndex: number) => {
    if (!form) return
    const optionId = form.pricingOptions[0]?.id
    if (!optionId) {
      toast.error("Add a pricing option before adding seasonal prices.")
      return
    }

    updateSeasonalPeriod(periodIndex, (period) => ({
      ...period,
      prices: [...period.prices, createEmptySeasonalPrice(optionId)],
    }))
  }

  const updateSeasonalPrice = (
    periodIndex: number,
    priceIndex: number,
    key: keyof EditableSeasonalPrice,
    value: string | number,
  ) => {
    updateSeasonalPeriod(periodIndex, (period) => ({
      ...period,
      prices: period.prices.map((price, index) =>
        index === priceIndex ? { ...price, [key]: value } : price,
      ),
    }))
  }

  const removeSeasonalPrice = (periodIndex: number, priceIndex: number) => {
    updateSeasonalPeriod(periodIndex, (period) => ({
      ...period,
      prices: period.prices.filter((_price, index) => index !== priceIndex),
    }))
  }

  const cancelEdit = () => {
    if (supplier) {
      setForm(buildFormState(supplier))
    }
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!form) return

    if (!form.name.trim()) {
      toast.error("Supplier name is required")
      return
    }

    const namedPricingOptions = form.pricingOptions.filter(
      (option) => option.name.trim().length > 0,
    )
    const hasExplicitPrimary = namedPricingOptions.some((option) => option.isPrimary)
    const cleanedPricingOptions = namedPricingOptions.map((option, index) => ({
      id: option.id,
      name: option.name.trim(),
      singlePrice: option.singlePrice,
      doublePrice: option.doublePrice,
      familyPrice: option.familyPrice,
      currency: option.currency.trim().toUpperCase() || "ZAR",
      isPrimary:
        form.kind === "hotel_property"
          ? hasExplicitPrimary
            ? option.isPrimary
            : index === 0
          : false,
    }))

    const meaningfulPackages = form.packages.filter(
      (pkg) =>
        pkg.name.trim() ||
        pkg.description.trim() ||
        pkg.routes.length > 0 ||
        pkg.suiteTypes.length > 0 ||
        pkg.rateCards.length > 0,
    )

    for (const pkg of meaningfulPackages) {
      if (!pkg.name.trim()) {
        toast.error("Every package needs a name before saving.")
        return
      }
      for (const route of pkg.routes) {
        if (!route.name.trim() || !route.originLocationId || !route.destinationLocationId) {
          toast.error(`Complete all route fields for "${pkg.name}".`)
          return
        }
      }
      for (const suiteType of pkg.suiteTypes) {
        if (!suiteType.name.trim()) {
          toast.error(`Every suite type needs a name for "${pkg.name}".`)
          return
        }
      }
      for (const rateCard of pkg.rateCards) {
        if (!rateCard.suiteTypeId || !rateCard.validFrom) {
          toast.error(`Complete all rate card fields for "${pkg.name}".`)
          return
        }
      }
    }

    const cleanedPackages = meaningfulPackages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name.trim(),
      description: pkg.description.trim() || null,
      durationNights: pkg.durationNights,
      singleSupplementPct: pkg.singleSupplementPct,
      currency: pkg.currency.trim().toUpperCase() || "ZAR",
      active: pkg.active,
      routes: pkg.routes.map((route) => ({
        id: route.id,
        name: route.name.trim(),
        originLocationId: route.originLocationId,
        destinationLocationId: route.destinationLocationId,
        active: route.active,
      })),
      suiteTypes: pkg.suiteTypes.map((suiteType) => ({
        id: suiteType.id,
        name: suiteType.name.trim(),
        active: suiteType.active,
      })),
      rateCards: pkg.rateCards.map((rateCard) => ({
        id: rateCard.id,
        routeId: rateCard.routeId,
        suiteTypeId: rateCard.suiteTypeId,
        pricePerPerson: rateCard.pricePerPerson,
        currency: rateCard.currency.trim().toUpperCase() || pkg.currency.trim().toUpperCase() || "ZAR",
        validFrom: rateCard.validFrom,
        validTo: rateCard.validTo ?? "",
      })),
    }))

    const meaningfulPeriods = form.seasonalPeriods.filter(
      (period) =>
        period.label.trim() || period.validFrom || period.validTo || period.prices.length > 0,
    )

    for (const period of meaningfulPeriods) {
      if (!period.validFrom || !period.validTo) {
        toast.error("Every seasonal period needs a start and end date.")
        return
      }
      for (const price of period.prices) {
        if (!price.optionId) {
          toast.error("Select a pricing option for every seasonal price row.")
          return
        }
      }
    }

    const cleanedSeasonalPeriods = meaningfulPeriods.map((period) => ({
      id: period.id,
      label: period.label.trim() || null,
      validFrom: period.validFrom,
      validTo: period.validTo,
      prices: period.prices.map((price) => ({
        id: price.id,
        optionId: price.optionId,
        singlePrice: price.singlePrice,
        doublePrice: price.doublePrice,
        familyPrice: price.familyPrice,
      })),
    }))

    setIsSaving(true)
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          kind: form.kind,
          email: form.email.trim(),
          phone: form.phone.trim(),
          website: form.website.trim(),
          location: form.location.trim(),
          notes: form.notes.trim(),
          active: form.active,
          pricingOptions: cleanedPricingOptions,
          packages: cleanedPackages,
          seasonalPeriods: cleanedSeasonalPeriods,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        toast.error(payload.error ?? "Failed to update supplier")
        return
      }

      await Promise.all([
        mutateDetail(),
        mutate("/api/suppliers"),
        mutate("/api/locations"),
      ])
      setIsEditing(false)
      toast.success("Supplier updated successfully")
    } catch {
      toast.error("Failed to update supplier")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        let message = "Failed to delete supplier"
        try {
          const payload = (await response.json()) as { error?: string }
          message = payload.error ?? message
        } catch {
          // No JSON payload to parse.
        }

        if (response.status === 409) {
          toast.error("This supplier has existing bookings and cannot be deleted.")
          return
        }

        toast.error(message)
        return
      }

      await mutate("/api/suppliers")
      toast.success("Supplier deleted successfully")
      router.push("/app/suppliers")
    } catch {
      toast.error("Failed to delete supplier")
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <SupplierDetailSkeleton presentation={presentation} />
  }

  if (data && "error" in data) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-base font-medium text-foreground">Supplier not found</p>
          <p className="text-sm text-muted-foreground">
            The supplier could not be loaded or no longer exists.
          </p>
          <div>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/suppliers">Back to suppliers</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!supplier || !form) {
    return null
  }

  return (
    <ContentTransition show>
      <div className={getContainerClass(presentation)}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            {presentation === "page" && (
              <Button asChild variant="ghost" size="sm" className="pl-0">
                <Link href="/app/suppliers">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to suppliers
                </Link>
              </Button>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  {supplier.name}
                </h1>
                <Badge variant="secondary">{SUPPLIER_KIND_LABELS[supplier.kind]}</Badge>
                <Badge variant={supplier.active ? "default" : "outline"}>
                  {supplier.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-2${
              presentation === "modal" ? " mr-10 sm:mr-12" : ""
            }`}
          >
            {canDelete && !isEditing && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete supplier"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{supplier.name}</strong> and all
                      related supplier records. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete supplier"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canEdit && !isEditing && (
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}

            {isEditing && (
              <>
                <Button variant="outline" onClick={cancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        {!canEdit && (
          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Supplier details are view-only for your role. Editing supplier fields,
              packages, rate cards, and seasonal pricing is restricted to managers and
              admins.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Supplier information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isEditing ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="supplier-name">Supplier name</Label>
                    <Input
                      id="supplier-name"
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-kind">Category</Label>
                    <Select
                      value={form.kind}
                      onValueChange={(value: SupplierKind) => updateField("kind", value)}
                    >
                      <SelectTrigger id="supplier-kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SUPPLIER_KIND_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-email">Email</Label>
                    <Input
                      id="supplier-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-phone">Phone</Label>
                    <Input
                      id="supplier-phone"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-website">Website</Label>
                    <Input
                      id="supplier-website"
                      value={form.website}
                      onChange={(event) => updateField("website", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-location">Location</Label>
                    <Input
                      id="supplier-location"
                      value={form.location}
                      onChange={(event) => updateField("location", event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier-notes">Notes</Label>
                  <Textarea
                    id="supplier-notes"
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    rows={4}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Supplier status</p>
                    <p className="text-sm text-muted-foreground">
                      Toggle whether this supplier is currently active.
                    </p>
                  </div>
                  <Switch
                    checked={form.active}
                    onCheckedChange={(checked) => updateField("active", checked)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem label="Email" value={supplier.email} />
                  <InfoItem label="Phone" value={supplier.phone} />
                  <InfoItem label="Website" value={supplier.website} />
                  <InfoItem label="Location" value={supplier.location} />
                  <InfoItem
                    label="Last updated"
                    value={new Date(supplier.updatedAt).toLocaleDateString()}
                  />
                  <InfoItem
                    label="Status"
                    value={supplier.active ? "Active" : "Inactive"}
                  />
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{supplier.email || "No email on file"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{supplier.phone || "No phone on file"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{supplier.location || "No location on file"}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-secondary/40 p-4 text-sm text-muted-foreground">
                  {supplier.notes || "No supplier notes recorded."}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>Pricing</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage supplier pricing options used for supplier-level pricing and
                  seasonal overrides.
                </p>
              </div>
              {isEditing && (
                <Button variant="outline" size="sm" onClick={addPricingOption}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add pricing option
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              form.pricingOptions.map((option, index) => (
                <div key={option.id} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-2 flex-1 min-w-[220px]">
                      <Label htmlFor={`pricing-name-${index}`}>Option name</Label>
                      <Input
                        id={`pricing-name-${index}`}
                        value={option.name}
                        onChange={(event) =>
                          updatePricingOption(index, "name", event.target.value)
                        }
                        placeholder="e.g. Deluxe suite"
                      />
                    </div>

                    <div className="flex items-center gap-2 self-end">
                      {form.kind === "hotel_property" && (
                        <Button
                          type="button"
                          size="sm"
                          variant={option.isPrimary ? "default" : "outline"}
                          onClick={() => markPrimaryOption(index)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Primary
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removePricingOption(index)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor={`pricing-single-${index}`}>Single</Label>
                      <Input
                        id={`pricing-single-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.singlePrice}
                        onChange={(event) =>
                          updatePricingOption(index, "singlePrice", Number(event.target.value || 0))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`pricing-double-${index}`}>Double</Label>
                      <Input
                        id={`pricing-double-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.doublePrice}
                        onChange={(event) =>
                          updatePricingOption(index, "doublePrice", Number(event.target.value || 0))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`pricing-family-${index}`}>Family</Label>
                      <Input
                        id={`pricing-family-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.familyPrice}
                        onChange={(event) =>
                          updatePricingOption(index, "familyPrice", Number(event.target.value || 0))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`pricing-currency-${index}`}>Currency</Label>
                      <Input
                        id={`pricing-currency-${index}`}
                        maxLength={10}
                        value={option.currency}
                        onChange={(event) =>
                          updatePricingOption(index, "currency", event.target.value.toUpperCase())
                        }
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : supplier.pricingOptions.length > 0 ? (
              supplier.pricingOptions.map((option) => (
                <div key={option.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{option.name}</p>
                    {supplier.kind === "hotel_property" && option.isPrimary && <Badge>Primary</Badge>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoItem
                      label="Single"
                      value={formatCurrency(option.singlePrice, option.currency)}
                    />
                    <InfoItem
                      label="Double"
                      value={formatCurrency(option.doublePrice, option.currency)}
                    />
                    <InfoItem
                      label="Family"
                      value={formatCurrency(option.familyPrice, option.currency)}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No pricing options have been configured for this supplier yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle>Seasonal Pricing</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Configure supplier-level seasonal periods and override prices by
                    pricing option.
                  </p>
                </div>
                {isEditing && (
                  <Button variant="outline" size="sm" onClick={addSeasonalPeriod}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add seasonal period
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                form.seasonalPeriods.length > 0 ? (
                  form.seasonalPeriods.map((period, periodIndex) => (
                    <div key={period.id} className="rounded-lg border p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">
                          Seasonal period {periodIndex + 1}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeSeasonalPeriod(periodIndex)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove period
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Label</Label>
                          <Input
                            value={period.label}
                            onChange={(event) =>
                              updateSeasonalPeriod(periodIndex, (current) => ({
                                ...current,
                                label: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Valid from</Label>
                          <Input
                            type="date"
                            value={period.validFrom}
                            onChange={(event) =>
                              updateSeasonalPeriod(periodIndex, (current) => ({
                                ...current,
                                validFrom: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Valid to</Label>
                          <Input
                            type="date"
                            value={period.validTo}
                            onChange={(event) =>
                              updateSeasonalPeriod(periodIndex, (current) => ({
                                ...current,
                                validTo: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">Seasonal prices</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addSeasonalPrice(periodIndex)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add seasonal price
                          </Button>
                        </div>

                        {period.prices.length > 0 ? (
                          period.prices.map((price, priceIndex) => (
                            <div
                              key={price.id}
                              className="grid gap-4 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-5"
                            >
                              <div className="space-y-2">
                                <Label>Pricing option</Label>
                                <Select
                                  value={price.optionId || undefined}
                                  onValueChange={(value) =>
                                    updateSeasonalPrice(periodIndex, priceIndex, "optionId", value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select option" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {form.pricingOptions.map((option) => (
                                      <SelectItem key={option.id} value={option.id}>
                                        {option.name || "Unnamed option"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Single</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={price.singlePrice}
                                  onChange={(event) =>
                                    updateSeasonalPrice(
                                      periodIndex,
                                      priceIndex,
                                      "singlePrice",
                                      Number(event.target.value || 0),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Double</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={price.doublePrice}
                                  onChange={(event) =>
                                    updateSeasonalPrice(
                                      periodIndex,
                                      priceIndex,
                                      "doublePrice",
                                      Number(event.target.value || 0),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Family</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={price.familyPrice}
                                  onChange={(event) =>
                                    updateSeasonalPrice(
                                      periodIndex,
                                      priceIndex,
                                      "familyPrice",
                                      Number(event.target.value || 0),
                                    )
                                  }
                                />
                              </div>
                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeSeasonalPrice(periodIndex, priceIndex)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No seasonal prices added yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No seasonal periods added yet.
                  </div>
                )
              ) : (
                <SeasonalPricingReadOnly periods={supplier.seasonalPeriods} optionNameById={optionNameById} />
              )}
            </CardContent>
          </Card>

        <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle>Packages, Routes and Rate Cards</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Manage the journeys this supplier operates, the routes they cover,
                    suite types, and period-based rate cards.
                  </p>
                </div>
                {isEditing && (
                  <Button variant="outline" size="sm" onClick={addPackage}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add package
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                form.packages.length > 0 ? (
                  form.packages.map((pkg, packageIndex) => (
                    <div key={pkg.id} className="rounded-lg border p-4 space-y-5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          Package {packageIndex + 1}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removePackage(packageIndex)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove package
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2 xl:col-span-2">
                          <Label>Package name</Label>
                          <Input
                            value={pkg.name}
                            onChange={(event) =>
                              updatePackage(packageIndex, (current) => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Duration (nights)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={pkg.durationNights ?? ""}
                            onChange={(event) =>
                              updatePackage(packageIndex, (current) => ({
                                ...current,
                                durationNights: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Single supplement %</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={pkg.singleSupplementPct}
                            onChange={(event) =>
                              updatePackage(packageIndex, (current) => ({
                                ...current,
                                singleSupplementPct: Number(event.target.value || 0),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Currency</Label>
                          <Input
                            maxLength={10}
                            value={pkg.currency}
                            onChange={(event) =>
                              updatePackage(packageIndex, (current) => ({
                                ...current,
                                currency: event.target.value.toUpperCase(),
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">Active</p>
                            <p className="text-xs text-muted-foreground">
                              Include this package in supplier listings.
                            </p>
                          </div>
                          <Switch
                            checked={pkg.active}
                            onCheckedChange={(checked) =>
                              updatePackage(packageIndex, (current) => ({
                                ...current,
                                active: checked,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          rows={3}
                          value={pkg.description}
                          onChange={(event) =>
                            updatePackage(packageIndex, (current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">Routes</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addRoute(packageIndex)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add route
                          </Button>
                        </div>

                        {pkg.routes.length > 0 ? (
                          pkg.routes.map((route, routeIndex) => (
                            <div
                              key={route.id}
                              className="grid gap-4 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-5"
                            >
                              <div className="space-y-2 xl:col-span-2">
                                <Label>Route name</Label>
                                <Input
                                  value={route.name}
                                  onChange={(event) =>
                                    updateRoute(packageIndex, routeIndex, "name", event.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Origin</Label>
                                <Select
                                  value={route.originLocationId || undefined}
                                  onValueChange={(value) =>
                                    updateRoute(packageIndex, routeIndex, "originLocationId", value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {locations.map((location) => (
                                      <SelectItem key={location.id} value={location.id}>
                                        {location.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>Destination</Label>
                                <Select
                                  value={route.destinationLocationId || undefined}
                                  onValueChange={(value) =>
                                    updateRoute(
                                      packageIndex,
                                      routeIndex,
                                      "destinationLocationId",
                                      value,
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {locations.map((location) => (
                                      <SelectItem key={location.id} value={location.id}>
                                        {location.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-end justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={route.active}
                                    onCheckedChange={(checked) =>
                                      updateRoute(packageIndex, routeIndex, "active", checked)
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground">Active</span>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeRoute(packageIndex, routeIndex)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No routes added yet.
                          </div>
                        )}
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">Suite types</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addSuiteType(packageIndex)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add suite type
                          </Button>
                        </div>

                        {pkg.suiteTypes.length > 0 ? (
                          pkg.suiteTypes.map((suiteType, suiteTypeIndex) => (
                            <div
                              key={suiteType.id}
                              className="grid gap-4 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]"
                            >
                              <div className="space-y-2">
                                <Label>Suite type name</Label>
                                <Input
                                  value={suiteType.name}
                                  onChange={(event) =>
                                    updateSuiteType(
                                      packageIndex,
                                      suiteTypeIndex,
                                      "name",
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="flex items-end gap-2">
                                <Switch
                                  checked={suiteType.active}
                                  onCheckedChange={(checked) =>
                                    updateSuiteType(
                                      packageIndex,
                                      suiteTypeIndex,
                                      "active",
                                      checked,
                                    )
                                  }
                                />
                                <span className="self-center text-sm text-muted-foreground">
                                  Active
                                </span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="self-end"
                                onClick={() => removeSuiteType(packageIndex, suiteTypeIndex)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No suite types added yet.
                          </div>
                        )}
                      </div>

                      <Separator />

                      <RateCardMatrixEditor
                        pkg={pkg}
                        packageIndex={packageIndex}
                        locationsById={locationsById}
                        onAddPeriod={addRateCardPeriod}
                        onRemovePeriod={removeRateCardPeriod}
                        onUpdatePeriodField={updateRateCardPeriodField}
                        onUpdateCellPrice={updateRateCardPrice}
                        onToggleCell={toggleRateCardCell}
                      />
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No packages added yet.
                  </div>
                )
              ) : (
                <SupplierPackagesReadOnly packages={supplier.packages} locationsById={locationsById} />
              )}
            </CardContent>
          </Card>
      </div>
    </ContentTransition>
  )
}
