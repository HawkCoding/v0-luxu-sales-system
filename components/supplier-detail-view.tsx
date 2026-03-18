"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSWRConfig } from "swr"
import {
  ArrowLeft,
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
  getSupplierVocabulary,
  SUPPLIER_KIND_LABELS,
  type Location,
  type SupplierDetail,
  type SupplierKind,
  type SupplierPackage,
  type SupplierRateCard,
  type SupplierSuiteType,
  type SupplierVocabulary,
} from "@/lib/types"

type Presentation = "page" | "modal"

interface SupplierDetailViewProps {
  supplierId: string
  presentation?: Presentation
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
  rateCards: EditableRateCard[]
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
  suiteTypes: EditableSuiteType[]
  packages: EditablePackage[]
}

const DRAFT_AUTOSAVE_DEBOUNCE_MS = 3000
const DRAFT_AUTOSAVE_STATUS_RESET_MS = 2000
const REMOVE_ICON_BUTTON_CLASS =
  "border-muted-foreground/25 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
const EMPTY_PERIOD_FIELD_ERRORS = new Set<string>()

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

interface RateCardConflict {
  packageId: string
  packageName: string
  suiteTypeId: string
  suiteTypeName: string
  routeId: string | null
  routeName: string
  validFrom: string
}

interface RateCardDateRange {
  validFrom: string
  validTo: string | null
}

interface RateCardOverlapConflict {
  packageId: string
  packageName: string
  suiteTypeId: string
  suiteTypeName: string
  routeId: string | null
  routeName: string
  firstPeriodKey: string
  secondPeriodKey: string
  firstRange: RateCardDateRange
  secondRange: RateCardDateRange
}

function makeClientId(): string {
  return crypto.randomUUID()
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
    rateCards: [],
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
    suiteTypes: supplier.suiteTypes.map((suiteType) => ({
      id: suiteType.id,
      name: suiteType.name,
      active: suiteType.active,
    })),
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
  }
}

function buildDraftPayload(form: SupplierFormState) {
  return {
    name: form.name.trim(),
    kind: form.kind,
    email: form.email.trim(),
    phone: form.phone.trim(),
    website: form.website.trim(),
    location: form.location.trim(),
    notes: form.notes.trim(),
    active: form.active,
    suiteTypes: form.suiteTypes.map((suiteType) => ({
      id: suiteType.id,
      name: suiteType.name.trim(),
      active: suiteType.active,
    })),
    packages: form.packages.map((pkg) => ({
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
      rateCards: pkg.rateCards.map((rateCard) => ({
        id: rateCard.id,
        routeId: rateCard.routeId,
        suiteTypeId: rateCard.suiteTypeId,
        pricePerPerson: rateCard.pricePerPerson,
        currency: rateCard.currency.trim().toUpperCase() || pkg.currency.trim().toUpperCase() || "ZAR",
        validFrom: rateCard.validFrom,
        validTo: rateCard.validTo ?? "",
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

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function toUtcDate(value: string): Date | null {
  if (!isIsoDateString(value)) {
    return null
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addIsoDays(value: string, days: number): string | null {
  const parsed = toUtcDate(value)
  if (!parsed) {
    return null
  }
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return formatUtcDate(parsed)
}

function updateRateCardPeriodDateValues(
  rateCards: EditableRateCard[],
  periodKey: string,
  updates: Partial<Pick<EditableRateCard, "validFrom" | "validTo">>,
): EditableRateCard[] {
  return rateCards.map((rateCard) =>
    getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) === periodKey
      ? { ...rateCard, ...updates }
      : rateCard,
  )
}

function getSortedEditableRateCardPeriods(rateCards: EditableRateCard[]): EditableRatePeriodGroup[] {
  return [...groupEditableRateCardsByPeriod(rateCards)].sort(
    (first, second) => first.validFrom.localeCompare(second.validFrom) || first.key.localeCompare(second.key),
  )
}

function applyBidirectionalPeriodDateLinking(
  rateCards: EditableRateCard[],
  sourcePeriodKey: string,
  sourceField: "validFrom" | "validTo",
): EditableRateCard[] {
  const periods = getSortedEditableRateCardPeriods(rateCards)
  const periodIndex = periods.findIndex((period) => period.key === sourcePeriodKey)
  if (periodIndex < 0) {
    return rateCards
  }

  let nextRateCards = rateCards
  const currentPeriod = periods[periodIndex]
  const previousPeriod = periodIndex > 0 ? periods[periodIndex - 1] : null
  const nextPeriod = periodIndex < periods.length - 1 ? periods[periodIndex + 1] : null

  if (sourceField === "validFrom" && previousPeriod) {
    const linkedPreviousValidTo = addIsoDays(currentPeriod.validFrom, -1)
    if (linkedPreviousValidTo) {
      nextRateCards = updateRateCardPeriodDateValues(nextRateCards, previousPeriod.key, {
        validTo: linkedPreviousValidTo,
      })
    }
  }

  if (sourceField === "validTo" && nextPeriod) {
    if (currentPeriod.validTo) {
      const linkedNextValidFrom = addIsoDays(currentPeriod.validTo, 1)
      if (linkedNextValidFrom) {
        nextRateCards = updateRateCardPeriodDateValues(nextRateCards, nextPeriod.key, {
          validFrom: linkedNextValidFrom,
        })
      }
    } else {
      const linkedCurrentValidTo = addIsoDays(nextPeriod.validFrom, -1)
      if (linkedCurrentValidTo) {
        nextRateCards = updateRateCardPeriodDateValues(nextRateCards, currentPeriod.key, {
          validTo: linkedCurrentValidTo,
        })
      }
    }
  }

  return nextRateCards
}

function getNextRateCardPeriodStart(pkg: EditablePackage): {
  nextValidFrom: string
  previousPeriodKey: string | null
} {
  const periods = getSortedEditableRateCardPeriods(pkg.rateCards)
  const today = new Date().toISOString().slice(0, 10)
  const previousPeriod = periods.at(-1)
  if (!previousPeriod) {
    return {
      nextValidFrom: today,
      previousPeriodKey: null,
    }
  }

  const anchor = previousPeriod.validTo ?? previousPeriod.validFrom
  const nextValidFrom = addIsoDays(anchor, 1) ?? today
  return {
    nextValidFrom,
    previousPeriodKey: previousPeriod.key,
  }
}

function buildRateCardBusinessKey(rateCard: {
  suiteTypeId: string
  routeId: string | null
  validFrom: string
}) {
  return [rateCard.suiteTypeId, rateCard.routeId ?? "__null__", rateCard.validFrom].join("|")
}

function findPackageRateCardConflicts(
  pkg: EditablePackage,
  suiteTypes: EditableSuiteType[],
): RateCardConflict[] {
  const suiteTypeNames = new Map(suiteTypes.map((suiteType) => [suiteType.id, suiteType.name.trim()]))
  const routeNames = new Map(pkg.routes.map((route) => [route.id, route.name.trim()]))
  const seen = new Set<string>()
  const conflicts: RateCardConflict[] = []

  for (const rateCard of pkg.rateCards) {
    const validFrom = rateCard.validFrom.trim()
    if (!rateCard.suiteTypeId || !validFrom) {
      continue
    }

    const businessKey = buildRateCardBusinessKey({
      suiteTypeId: rateCard.suiteTypeId,
      routeId: rateCard.routeId,
      validFrom,
    })

    if (!seen.has(businessKey)) {
      seen.add(businessKey)
      continue
    }

    conflicts.push({
      packageId: pkg.id,
      packageName: pkg.name.trim() || "Unnamed package",
      suiteTypeId: rateCard.suiteTypeId,
      suiteTypeName: suiteTypeNames.get(rateCard.suiteTypeId) || "Unknown suite type",
      routeId: rateCard.routeId,
      routeName:
        rateCard.routeId === null
          ? "All routes"
          : routeNames.get(rateCard.routeId) || "Unknown route",
      validFrom,
    })
  }

  return conflicts
}

function findFirstRateCardConflict(
  packages: EditablePackage[],
  suiteTypes: EditableSuiteType[],
): RateCardConflict | null {
  for (const pkg of packages) {
    const conflict = findPackageRateCardConflicts(pkg, suiteTypes)[0]
    if (conflict) {
      return conflict
    }
  }

  return null
}

function buildRateCardConflictMessage(
  conflict: RateCardConflict,
  vocabulary: SupplierVocabulary,
): string {
  return `Duplicate rate card in "${conflict.packageName}" for ${vocabulary.suiteType.toLowerCase()} "${conflict.suiteTypeName}", ${vocabulary.route.toLowerCase()} "${conflict.routeName}", start date ${conflict.validFrom}. Keep only one row for that combination.`
}

function detectRateCardDateOverlap(
  firstRange: RateCardDateRange,
  secondRange: RateCardDateRange,
): boolean {
  const firstStart = firstRange.validFrom.trim()
  const secondStart = secondRange.validFrom.trim()
  if (!firstStart || !secondStart) {
    return false
  }

  const firstEnd = firstRange.validTo?.trim() || null
  const secondEnd = secondRange.validTo?.trim() || null
  const firstStartsBeforeSecondEnds = !secondEnd || firstStart < secondEnd
  const secondStartsBeforeFirstEnds = !firstEnd || secondStart < firstEnd
  return firstStartsBeforeSecondEnds && secondStartsBeforeFirstEnds
}

function findPackageRateCardOverlapConflicts(
  pkg: EditablePackage,
  suiteTypes: EditableSuiteType[],
): RateCardOverlapConflict[] {
  const suiteTypeNames = new Map(suiteTypes.map((suiteType) => [suiteType.id, suiteType.name.trim()]))
  const routeNames = new Map(pkg.routes.map((route) => [route.id, route.name.trim()]))
  const groupedCards = new Map<
    string,
    Array<{
      suiteTypeId: string
      routeId: string | null
      periodKey: string
      validFrom: string
      validTo: string | null
    }>
  >()

  for (const rateCard of pkg.rateCards) {
    const validFrom = rateCard.validFrom.trim()
    if (!rateCard.suiteTypeId || !validFrom) {
      continue
    }

    const key = [rateCard.suiteTypeId, rateCard.routeId ?? "__null__"].join("|")
    const next = groupedCards.get(key) ?? []
    next.push({
      suiteTypeId: rateCard.suiteTypeId,
      routeId: rateCard.routeId,
      periodKey: getRatePeriodKey(
        validFrom,
        rateCard.validTo?.trim() || null,
        rateCard.currency,
      ),
      validFrom,
      validTo: rateCard.validTo?.trim() || null,
    })
    groupedCards.set(key, next)
  }

  const overlaps: RateCardOverlapConflict[] = []
  for (const cards of groupedCards.values()) {
    const sortedCards = [...cards].sort((a, b) => a.validFrom.localeCompare(b.validFrom))

    for (let index = 0; index < sortedCards.length; index += 1) {
      const first = sortedCards[index]
      for (let compareIndex = index + 1; compareIndex < sortedCards.length; compareIndex += 1) {
        const second = sortedCards[compareIndex]
        if (
          !detectRateCardDateOverlap(
            { validFrom: first.validFrom, validTo: first.validTo },
            { validFrom: second.validFrom, validTo: second.validTo },
          )
        ) {
          continue
        }

        overlaps.push({
          packageId: pkg.id,
          packageName: pkg.name.trim() || "Unnamed package",
          suiteTypeId: first.suiteTypeId,
          suiteTypeName: suiteTypeNames.get(first.suiteTypeId) || "Unknown suite type",
          routeId: first.routeId,
          routeName:
            first.routeId === null ? "All routes" : routeNames.get(first.routeId) || "Unknown route",
          firstPeriodKey: first.periodKey,
          secondPeriodKey: second.periodKey,
          firstRange: {
            validFrom: first.validFrom,
            validTo: first.validTo,
          },
          secondRange: {
            validFrom: second.validFrom,
            validTo: second.validTo,
          },
        })
      }
    }
  }

  return overlaps
}

function findFirstRateCardOverlapConflict(
  packages: EditablePackage[],
  suiteTypes: EditableSuiteType[],
): RateCardOverlapConflict | null {
  for (const pkg of packages) {
    const conflict = findPackageRateCardOverlapConflicts(pkg, suiteTypes)[0]
    if (conflict) {
      return conflict
    }
  }

  return null
}

function buildRateCardDateRangeLabel(range: RateCardDateRange): string {
  return `${range.validFrom} to ${range.validTo ?? "open ended"}`
}

function buildRateCardOverlapConflictMessage(
  conflict: RateCardOverlapConflict,
  vocabulary: SupplierVocabulary,
): string {
  return `Overlapping rate card periods in "${conflict.packageName}" for ${vocabulary.suiteType.toLowerCase()} "${conflict.suiteTypeName}", ${vocabulary.route.toLowerCase()} "${conflict.routeName}": ${buildRateCardDateRangeLabel(conflict.firstRange)} overlaps ${buildRateCardDateRangeLabel(conflict.secondRange)}. Adjust dates so periods do not overlap.`
}

function buildRateCardOverlapWarningMessage(
  conflict: RateCardOverlapConflict,
  vocabulary: SupplierVocabulary,
): string {
  return `${buildRateCardOverlapConflictMessage(conflict, vocabulary)} You can continue editing, but Save is blocked until this is fixed.`
}

function getRateCardOverlapFieldErrorKeys(
  pkg: EditablePackage,
  suiteTypes: EditableSuiteType[],
): Set<string> {
  const fieldErrors = new Set<string>()
  const conflicts = findPackageRateCardOverlapConflicts(pkg, suiteTypes)
  for (const conflict of conflicts) {
    fieldErrors.add(`${conflict.firstPeriodKey}|validFrom`)
    fieldErrors.add(`${conflict.firstPeriodKey}|validTo`)
    fieldErrors.add(`${conflict.secondPeriodKey}|validFrom`)
    fieldErrors.add(`${conflict.secondPeriodKey}|validTo`)
  }
  return fieldErrors
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

function getRouteLabel(
  route: { name: string; originLocationId: string; destinationLocationId: string },
  locationsById: Record<string, Location>,
  vocabulary: SupplierVocabulary,
) {
  if (!vocabulary.routeHasLocations) {
    return route.name || `Unnamed ${vocabulary.route.toLowerCase()}`
  }

  return `${getLocationName(locationsById, route.originLocationId)} -> ${getLocationName(
    locationsById,
    route.destinationLocationId,
  )}`
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
  suiteTypes,
  locationsById,
  selectedRouteId,
  vocabulary,
}: {
  pkg: SupplierPackage
  suiteTypes: SupplierSuiteType[]
  locationsById: Record<string, Location>
  selectedRouteId?: string | null
  vocabulary: SupplierVocabulary
}) {
  const periodGroups = groupRateCardsByPeriod(pkg.rateCards)

  if (pkg.routes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {`No ${vocabulary.routePlural.toLowerCase()} have been configured for this ${vocabulary.package.toLowerCase()} yet.`}
      </div>
    )
  }

  if (periodGroups.length === 0 || suiteTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No rate cards have been configured for this package yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {periodGroups.map((period) => {
        const routeColumns = selectedRouteId
          ? pkg.routes.filter((route) => route.id === selectedRouteId)
          : pkg.routes

        return (
          <div key={period.key} className="rounded-lg border overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-secondary/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{period.label}</p>
                <p className="text-xs text-muted-foreground">
                  {vocabulary.showSingleSupplement
                    ? `${period.currency} ${vocabulary.priceLabel} (single: +${pkg.singleSupplementPct.toFixed(
                        0,
                      )}%)`
                    : `${period.currency} ${vocabulary.priceLabel}`}
                </p>
              </div>
              <Badge variant="outline">{period.currency}</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-secondary/20">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {vocabulary.suiteType}
                    </th>
                    {routeColumns.map((route) => (
                      <th
                        key={route.id}
                        className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {getRouteLabel(route, locationsById, vocabulary)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suiteTypes.map((suiteType) => (
                    <tr key={suiteType.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{suiteType.name}</td>
                      {routeColumns.map((route) => {
                        const match =
                          period.items.find(
                            (item) =>
                              item.suiteTypeId === suiteType.id && item.routeId === route.id,
                          ) ??
                          period.items.find(
                            (item) =>
                              item.suiteTypeId === suiteType.id && item.routeId === null,
                          )

                        return (
                          <td
                            key={`${suiteType.id}-${route.id}`}
                            className="px-4 py-3 text-muted-foreground"
                          >
                            {match ? (
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {formatCurrency(match.pricePerPerson, match.currency)}
                                </p>
                                {vocabulary.showSingleSupplement ? (
                                  <p className="text-xs">
                                    Single:{" "}
                                    {formatCurrency(
                                      match.pricePerPerson * (1 + pkg.singleSupplementPct / 100),
                                      match.currency,
                                    )}
                                  </p>
                                ) : null}
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
  suiteTypes: EditableSuiteType[]
  packageIndex: number
  locationsById: Record<string, Location>
  vocabulary: SupplierVocabulary
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
  periodFieldErrors: Set<string>
}

function RateCardMatrixEditor({
  pkg,
  suiteTypes,
  packageIndex,
  locationsById,
  vocabulary,
  onAddPeriod,
  onRemovePeriod,
  onUpdatePeriodField,
  onUpdateCellPrice,
  onToggleCell,
  periodFieldErrors,
}: RateCardMatrixEditorProps) {
  const periodGroups = groupEditableRateCardsByPeriod(pkg.rateCards)

  if (suiteTypes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {`Add at least one ${vocabulary.suiteType.toLowerCase()} before configuring rate cards.`}
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
                    className={
                      periodFieldErrors.has(`${period.key}|validFrom`)
                        ? "border-destructive focus-visible:ring-destructive/35"
                        : undefined
                    }
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
                    className={
                      periodFieldErrors.has(`${period.key}|validTo`)
                        ? "border-destructive focus-visible:ring-destructive/35"
                        : undefined
                    }
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
                    size="icon"
                    className={REMOVE_ICON_BUTTON_CLASS}
                    aria-label="Remove period"
                    onClick={() => onRemovePeriod(packageIndex, period.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-secondary/20">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {vocabulary.suiteType}
                      </th>
                      {routeColumns.map((route) => (
                        <th
                          key={route?.id ?? "all-routes"}
                          className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {route
                            ? getRouteLabel(route, locationsById, vocabulary)
                            : `All ${vocabulary.routePlural}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suiteTypes.map((suiteType) => (
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
                                    size="icon"
                                    variant="outline"
                                    className={REMOVE_ICON_BUTTON_CLASS}
                                    aria-label="Remove rate card"
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

function PackageReadOnlyCard({
  pkg,
  suiteTypes,
  locationsById,
  vocabulary,
}: {
  pkg: SupplierPackage
  suiteTypes: SupplierSuiteType[]
  locationsById: Record<string, Location>
  vocabulary: SupplierVocabulary
}) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(pkg.routes[0]?.id ?? null)

  useEffect(() => {
    if (pkg.routes.length === 0) {
      if (selectedRouteId !== null) {
        setSelectedRouteId(null)
      }
      return
    }

    if (!selectedRouteId || !pkg.routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(pkg.routes[0].id)
    }
  }, [pkg.routes, selectedRouteId])

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-semibold text-foreground">{pkg.name}</p>
            {vocabulary.showDurationNights ? (
              <Badge variant="secondary">
                {pkg.durationNights ? `${pkg.durationNights} nights` : "Duration TBD"}
              </Badge>
            ) : null}
            {vocabulary.showSingleSupplement ? (
              <Badge variant="outline">Single supplement {pkg.singleSupplementPct}%</Badge>
            ) : null}
            <Badge variant="outline">{pkg.currency}</Badge>
          </div>
          {pkg.description && <p className="text-sm text-muted-foreground">{pkg.description}</p>}
        </div>
        <Badge variant={pkg.active ? "default" : "outline"}>
          {pkg.active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {vocabulary.routePlural}
          </p>
          {pkg.routes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pkg.routes.map((route) => {
                const routeLabel = getRouteLabel(route, locationsById, vocabulary)
                const isSelected = selectedRouteId === route.id

                return (
                  <Button
                    key={route.id}
                    type="button"
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setSelectedRouteId(route.id)}
                  >
                    {routeLabel}
                  </Button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {`No ${vocabulary.routePlural.toLowerCase()} configured.`}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {vocabulary.suiteTypePlural}
          </p>
          {suiteTypes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suiteTypes.map((suiteType) => (
                <Badge key={suiteType.id} variant="outline">
                  {suiteType.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {`No ${vocabulary.suiteTypePlural.toLowerCase()} configured.`}
            </p>
          )}
        </div>
      </div>

      <PackageRateCardMatrix
        pkg={pkg}
        suiteTypes={suiteTypes}
        locationsById={locationsById}
        selectedRouteId={selectedRouteId}
        vocabulary={vocabulary}
      />
    </div>
  )
}

function SupplierPackagesReadOnly({
  packages,
  suiteTypes,
  locationsById,
  vocabulary,
}: {
  packages: SupplierPackage[]
  suiteTypes: SupplierSuiteType[]
  locationsById: Record<string, Location>
  vocabulary: SupplierVocabulary
}) {
  if (packages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {`No ${vocabulary.packagePlural.toLowerCase()} have been configured for this supplier yet.`}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {packages.map((pkg) => (
        <PackageReadOnlyCard
          key={pkg.id}
          pkg={pkg}
          suiteTypes={suiteTypes}
          locationsById={locationsById}
          vocabulary={vocabulary}
        />
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

      {Array.from({ length: 2 }).map((_, index) => (
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
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  )
  const [pendingLocalDraft, setPendingLocalDraft] = useState<SupplierFormState | null>(null)
  const baselineSnapshotRef = useRef<string | null>(null)
  const draftAutosavedSnapshotRef = useRef<string | null>(null)
  const lastDraftConflictSnapshotRef = useRef<string | null>(null)
  const lastOverlapWarningRef = useRef<string | null>(null)
  const draftAutosaveInFlightRef = useRef(false)
  const draftStatusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supplier = data && !("error" in data) ? data : null
  const isDraftSupplier = supplier?.status === "draft"
  const localDraftStorageKey = `supplier-draft-${supplierId}`

  useEffect(() => {
    if (supplier) {
      const nextForm = buildFormState(supplier)
      const snapshot = JSON.stringify(nextForm)

      setForm(nextForm)
      baselineSnapshotRef.current = snapshot
      draftAutosavedSnapshotRef.current = snapshot

      if (canEdit && supplier.status === "draft") {
        setIsEditing(true)
      }

      if (supplier.status !== "draft") {
        const raw = window.localStorage.getItem(localDraftStorageKey)
        if (!raw) {
          setPendingLocalDraft(null)
          return
        }

        try {
          const parsed = JSON.parse(raw) as SupplierFormState
          if (
            parsed &&
            typeof parsed === "object" &&
            Array.isArray(parsed.suiteTypes) &&
            Array.isArray(parsed.packages)
          ) {
            setPendingLocalDraft(parsed)
            return
          }
        } catch {
          // Invalid local draft payload, clear stale storage.
        }
        window.localStorage.removeItem(localDraftStorageKey)
      } else {
        setPendingLocalDraft(null)
      }
    }
  }, [canEdit, localDraftStorageKey, supplier])

  useEffect(() => {
    return () => {
      if (draftStatusResetTimeoutRef.current) {
        clearTimeout(draftStatusResetTimeoutRef.current)
      }
    }
  }, [])

  const locations = allLocations.length > 0 ? allLocations : supplier?.locations ?? []

  const locationsById = useMemo(
    () =>
      locations.reduce<Record<string, Location>>((acc, location) => {
        acc[location.id] = location
        return acc
      }, {}),
    [locations],
  )

  const updateField = <K extends keyof SupplierFormState>(
    key: K,
    value: SupplierFormState[K],
  ) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const updateSuiteTypes = (
    updater: (suiteTypes: EditableSuiteType[]) => EditableSuiteType[],
  ) => {
    setForm((current) =>
      current ? { ...current, suiteTypes: updater(current.suiteTypes) } : current,
    )
  }

  const addSuiteType = () => {
    updateSuiteTypes((suiteTypes) => [...suiteTypes, createEmptySuiteType()])
  }

  const updateSuiteType = (
    suiteTypeIndex: number,
    key: keyof EditableSuiteType,
    value: string | boolean,
  ) => {
    updateSuiteTypes((suiteTypes) =>
      suiteTypes.map((suiteType, index) =>
        index === suiteTypeIndex ? { ...suiteType, [key]: value } : suiteType,
      ),
    )
  }

  const removeSuiteType = (suiteTypeIndex: number) => {
    setForm((current) => {
      if (!current) return current
      const suiteTypeId = current.suiteTypes[suiteTypeIndex]?.id
      return {
        ...current,
        suiteTypes: current.suiteTypes.filter((_suiteType, index) => index !== suiteTypeIndex),
        packages: current.packages.map((pkg) => ({
          ...pkg,
          rateCards: pkg.rateCards.filter((rateCard) => rateCard.suiteTypeId !== suiteTypeId),
        })),
      }
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

  const overlapFieldErrorsByPackage = useMemo(() => {
    if (!form) {
      return new Map<number, Set<string>>()
    }
    return new Map(
      form.packages.map((pkg, packageIndex) => [
        packageIndex,
        getRateCardOverlapFieldErrorKeys(pkg, form.suiteTypes),
      ]),
    )
  }, [form])

  const warnForOverlapIfNeeded = (
    pkg: EditablePackage,
    suiteTypes: EditableSuiteType[],
    vocabulary: SupplierVocabulary,
  ) => {
    const overlapConflict = findPackageRateCardOverlapConflicts(pkg, suiteTypes)[0]
    if (!overlapConflict) {
      lastOverlapWarningRef.current = null
      return
    }

    const warningKey = [
      overlapConflict.packageId,
      overlapConflict.suiteTypeId,
      overlapConflict.routeId ?? "__null__",
      overlapConflict.firstPeriodKey,
      overlapConflict.secondPeriodKey,
    ].join("|")

    if (lastOverlapWarningRef.current === warningKey) {
      return
    }
    lastOverlapWarningRef.current = warningKey
    toast.warning(buildRateCardOverlapWarningMessage(overlapConflict, vocabulary))
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
      const nextPackage = {
        ...pkg,
        routes: pkg.routes.filter((_route, index) => index !== routeIndex),
        rateCards: pkg.rateCards.map((rateCard) =>
          rateCard.routeId === routeId ? { ...rateCard, routeId: null } : rateCard,
        ),
      }
      const conflict = findPackageRateCardConflicts(nextPackage, form?.suiteTypes ?? [])[0]
      if (conflict) {
        const vocabulary = getSupplierVocabulary(form?.kind ?? "train_operator")
        toast.error(
          `Removing this ${vocabulary.route.toLowerCase()} would create duplicate rate cards. Adjust start dates first.`,
        )
        return pkg
      }

      return {
        ...nextPackage,
      }
    })
  }

  const addRateCardPeriod = (packageIndex: number) => {
    updatePackage(packageIndex, (pkg) => {
      const vocabulary = getSupplierVocabulary(form?.kind ?? "train_operator")
      const availableSuiteTypes = form?.suiteTypes ?? []
      if (availableSuiteTypes.length === 0) {
        toast.error(
          `Add at least one ${vocabulary.suiteType.toLowerCase()} before creating a pricing period.`,
        )
        return pkg
      }

      const currency = pkg.currency.trim().toUpperCase() || "ZAR"
      const routes = pkg.routes.length > 0 ? pkg.routes : [{ id: null as string | null }]
      const { nextValidFrom, previousPeriodKey } = getNextRateCardPeriodStart(pkg)
      const linkedPreviousValidTo = addIsoDays(nextValidFrom, -1)
      const baseRateCards =
        previousPeriodKey && linkedPreviousValidTo
          ? updateRateCardPeriodDateValues(pkg.rateCards, previousPeriodKey, {
              validTo: linkedPreviousValidTo,
            })
          : pkg.rateCards

      const newRateCards = availableSuiteTypes.flatMap((suiteType) =>
        routes.map((route) => ({
          id: makeClientId(),
          routeId: route.id,
          suiteTypeId: suiteType.id,
          pricePerPerson: 0,
          currency,
          validFrom: nextValidFrom,
          validTo: null,
        })),
      )

      const nextPackage = {
        ...pkg,
        rateCards: [...baseRateCards, ...newRateCards],
      }
      const conflict = findPackageRateCardConflicts(nextPackage, availableSuiteTypes)[0]
      if (conflict) {
        toast.error(
          "This pricing period duplicates an existing suite type/route/start-date combination. Choose a different start date.",
        )
        return pkg
      }
      warnForOverlapIfNeeded(nextPackage, availableSuiteTypes, vocabulary)

      return {
        ...nextPackage,
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
      let nextPeriodKey = periodKey
      let nextRateCards = pkg.rateCards.map((rateCard) => {
        if (getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) !== periodKey) {
          return rateCard
        }

        if (key === "currency") {
          const nextRateCard = {
            ...rateCard,
            currency: (value ?? "").trim().toUpperCase() || pkg.currency.trim().toUpperCase() || "ZAR",
          }
          nextPeriodKey = getRatePeriodKey(
            nextRateCard.validFrom,
            nextRateCard.validTo,
            nextRateCard.currency,
          )
          return nextRateCard
        }

        if (key === "validFrom") {
          const nextRateCard = {
            ...rateCard,
            validFrom: value ?? "",
          }
          nextPeriodKey = getRatePeriodKey(
            nextRateCard.validFrom,
            nextRateCard.validTo,
            nextRateCard.currency,
          )
          return nextRateCard
        }

        const nextRateCard = {
          ...rateCard,
          validTo: value,
        }
        nextPeriodKey = getRatePeriodKey(
          nextRateCard.validFrom,
          nextRateCard.validTo,
          nextRateCard.currency,
        )
        return nextRateCard
      })

      if (key === "validFrom" || key === "validTo") {
        nextRateCards = applyBidirectionalPeriodDateLinking(nextRateCards, nextPeriodKey, key)
      }

      if (key === "validFrom" || key === "validTo") {
        const nextPackage = { ...pkg, rateCards: nextRateCards }
        const availableSuiteTypes = form?.suiteTypes ?? []
        const conflict = findPackageRateCardConflicts(nextPackage, availableSuiteTypes)[0]
        if (conflict) {
          toast.error(
            "That start date duplicates an existing suite type/route/start-date combination.",
          )
          return pkg
        }

        const vocabulary = getSupplierVocabulary(form?.kind ?? "train_operator")
        warnForOverlapIfNeeded(nextPackage, availableSuiteTypes, vocabulary)
      }

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

  useEffect(() => {
    if (!canEdit || !form || !isEditing || isSaving) return

    if (isDraftSupplier) {
      const snapshot = JSON.stringify(form)
      if (snapshot === draftAutosavedSnapshotRef.current || draftAutosaveInFlightRef.current) {
        return
      }

      const timeout = setTimeout(async () => {
        draftAutosaveInFlightRef.current = true
        setDraftSaveStatus("saving")

        try {
          const draftConflict = findFirstRateCardConflict(form.packages, form.suiteTypes)
          if (draftConflict) {
            setDraftSaveStatus("error")
            if (lastDraftConflictSnapshotRef.current !== snapshot) {
              toast.error(buildRateCardConflictMessage(draftConflict, getSupplierVocabulary(form.kind)))
              lastDraftConflictSnapshotRef.current = snapshot
            }
            return
          }

          lastDraftConflictSnapshotRef.current = null
          const response = await fetch(`/api/suppliers/${supplierId}?draft=true`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildDraftPayload(form)),
          })

          if (!response.ok) {
            setDraftSaveStatus("error")
            return
          }

          draftAutosavedSnapshotRef.current = snapshot
          setDraftSaveStatus("saved")
          if (draftStatusResetTimeoutRef.current) {
            clearTimeout(draftStatusResetTimeoutRef.current)
          }
          draftStatusResetTimeoutRef.current = setTimeout(() => {
            setDraftSaveStatus("idle")
          }, DRAFT_AUTOSAVE_STATUS_RESET_MS)
          await mutate("/api/suppliers?includeDrafts=true")
        } catch {
          setDraftSaveStatus("error")
        } finally {
          draftAutosaveInFlightRef.current = false
        }
      }, DRAFT_AUTOSAVE_DEBOUNCE_MS)

      return () => clearTimeout(timeout)
    }

    const timeout = setTimeout(() => {
      const snapshot = JSON.stringify(form)
      if (snapshot === baselineSnapshotRef.current) {
        window.localStorage.removeItem(localDraftStorageKey)
        return
      }
      window.localStorage.setItem(localDraftStorageKey, snapshot)
      setPendingLocalDraft(form)
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [canEdit, form, isDraftSupplier, isEditing, isSaving, localDraftStorageKey, mutate, supplierId])

  const restoreLocalDraft = () => {
    if (!pendingLocalDraft) return
    setForm(pendingLocalDraft)
    setIsEditing(true)
    toast.success("Unsaved changes restored.")
  }

  const discardLocalDraft = () => {
    window.localStorage.removeItem(localDraftStorageKey)
    setPendingLocalDraft(null)
    toast.success("Draft changes discarded.")
  }

  const cancelEdit = () => {
    if (supplier) {
      setForm(buildFormState(supplier))
    }
    if (supplier?.status === "draft") {
      setIsEditing(true)
      return
    }
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!form) return
    const vocabulary = getSupplierVocabulary(form.kind)

    if (!form.name.trim()) {
      toast.error("Supplier name is required")
      return
    }

    const cleanedSuiteTypes = form.suiteTypes
      .filter((suiteType) => suiteType.name.trim())
      .map((suiteType) => ({
        id: suiteType.id,
        name: suiteType.name.trim(),
        active: suiteType.active,
      }))
    const suiteTypeIds = new Set(cleanedSuiteTypes.map((suiteType) => suiteType.id))

    const meaningfulPackages = form.packages.filter(
      (pkg) =>
        pkg.name.trim() ||
        pkg.description.trim() ||
        pkg.routes.length > 0 ||
        pkg.rateCards.length > 0,
    )

    const hasRateCards = meaningfulPackages.some((pkg) => pkg.rateCards.length > 0)
    if (hasRateCards && cleanedSuiteTypes.length === 0) {
      toast.error(
        `Add at least one supplier ${vocabulary.suiteType.toLowerCase()} before saving rate cards.`,
      )
      return
    }

    for (const pkg of meaningfulPackages) {
      if (!pkg.name.trim()) {
        toast.error(`Every ${vocabulary.package.toLowerCase()} needs a name before saving.`)
        return
      }
      for (const route of pkg.routes) {
        const needsLocations = vocabulary.routeHasLocations
        if (
          !route.name.trim() ||
          (needsLocations && (!route.originLocationId || !route.destinationLocationId))
        ) {
          toast.error(`Complete all ${vocabulary.route.toLowerCase()} fields for "${pkg.name}".`)
          return
        }
      }
      for (const rateCard of pkg.rateCards) {
        if (!rateCard.suiteTypeId || !rateCard.validFrom || !suiteTypeIds.has(rateCard.suiteTypeId)) {
          toast.error(`Complete all rate card fields for "${pkg.name}".`)
          return
        }
      }
    }

    const rateCardConflict = findFirstRateCardConflict(meaningfulPackages, form.suiteTypes)
    if (rateCardConflict) {
      toast.error(buildRateCardConflictMessage(rateCardConflict, vocabulary))
      return
    }
    const overlapConflict = findFirstRateCardOverlapConflict(meaningfulPackages, form.suiteTypes)
    if (overlapConflict) {
      toast.error(buildRateCardOverlapConflictMessage(overlapConflict, vocabulary))
      return
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
          suiteTypes: cleanedSuiteTypes,
          packages: cleanedPackages,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        const conflictDetails = payload?.details as
          | {
              packageId?: string
              suiteTypeId?: string
              routeId?: string | null
              validFrom?: string
            }
          | undefined
        if (
          response.status === 409 &&
          conflictDetails?.packageId &&
          conflictDetails?.suiteTypeId &&
          conflictDetails?.validFrom
        ) {
          const conflictPackage =
            meaningfulPackages.find((pkg) => pkg.id === conflictDetails.packageId) ?? meaningfulPackages[0]
          const conflict = findPackageRateCardConflicts(conflictPackage, form.suiteTypes)[0]
          if (conflict) {
            toast.error(buildRateCardConflictMessage(conflict, vocabulary))
            return
          }
        }
        toast.error(payload.error ?? "Failed to update supplier")
        return
      }

      await Promise.all([
        mutateDetail(),
        mutate("/api/suppliers?includeDrafts=true"),
        mutate("/api/locations"),
      ])
      window.localStorage.removeItem(localDraftStorageKey)
      setPendingLocalDraft(null)
      setDraftSaveStatus("idle")
      setIsEditing(false)
      toast.success(
        isDraftSupplier ? "Supplier published successfully" : "Supplier updated successfully",
      )
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
          toast.error(message)
          return
        }

        toast.error(message)
        return
      }

      await mutate("/api/suppliers?includeDrafts=true")
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

  const activeVocabulary = getSupplierVocabulary(isEditing ? form.kind : supplier.kind)

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
                {supplier.status === "draft" && <Badge variant="outline">Draft</Badge>}
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
                  {isSaving
                    ? "Saving..."
                    : supplier.status === "draft"
                      ? "Save & Publish"
                      : "Save changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        {supplier.status === "draft" && (
          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              This supplier is in draft mode and is not available in booking or quote flows.
              {draftSaveStatus === "saving" && " Saving draft..."}
              {draftSaveStatus === "saved" && " Draft saved."}
              {draftSaveStatus === "error" && " Draft save failed. Keep editing and try again."}
            </CardContent>
          </Card>
        )}

        {canEdit && supplier.status !== "draft" && pendingLocalDraft && !isEditing && (
          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
              <p>You have unsaved edits from a previous session.</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={discardLocalDraft}>
                  Discard
                </Button>
                <Button size="sm" onClick={restoreLocalDraft}>
                  Restore draft
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!canEdit && (
          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Supplier details are view-only for your role. Editing supplier fields,
              {` ${activeVocabulary.packagePlural.toLowerCase()}, ${activeVocabulary.routePlural.toLowerCase()}, ${activeVocabulary.suiteTypePlural.toLowerCase()}, and rate cards is restricted to managers`}
              and admins.
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
                  <CardTitle>{activeVocabulary.sectionTitle}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeVocabulary.sectionDescription}
                  </p>
                </div>
                {isEditing && (
                  <Button variant="outline" size="sm" onClick={addPackage}>
                    <Plus className="mr-2 h-4 w-4" />
                    {`Add ${activeVocabulary.package.toLowerCase()}`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {`Supplier ${activeVocabulary.suiteTypePlural.toLowerCase()}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {`Shared across all ${activeVocabulary.packagePlural.toLowerCase()} and used by rate cards.`}
                    </p>
                  </div>
                  {isEditing && (
                    <Button type="button" size="sm" variant="outline" onClick={addSuiteType}>
                      <Plus className="mr-2 h-4 w-4" />
                      {`Add ${activeVocabulary.suiteType.toLowerCase()}`}
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  form.suiteTypes.length > 0 ? (
                    form.suiteTypes.map((suiteType, suiteTypeIndex) => (
                      <div
                        key={suiteType.id}
                        className="grid gap-4 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]"
                      >
                        <div className="space-y-2">
                          <Label>{`${activeVocabulary.suiteType} name`}</Label>
                          <Input
                            value={suiteType.name}
                            onChange={(event) =>
                              updateSuiteType(suiteTypeIndex, "name", event.target.value)
                            }
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Switch
                            checked={suiteType.active}
                            onCheckedChange={(checked) =>
                              updateSuiteType(suiteTypeIndex, "active", checked)
                            }
                          />
                          <span className="self-center text-sm text-muted-foreground">Active</span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={`self-end ${REMOVE_ICON_BUTTON_CLASS}`}
                          aria-label={`Remove ${activeVocabulary.suiteType.toLowerCase()}`}
                          onClick={() => removeSuiteType(suiteTypeIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {`No ${activeVocabulary.suiteTypePlural.toLowerCase()} added yet.`}
                    </div>
                  )
                ) : supplier.suiteTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {supplier.suiteTypes.map((suiteType) => (
                      <Badge key={suiteType.id} variant="outline">
                        {suiteType.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    {`No ${activeVocabulary.suiteTypePlural.toLowerCase()} configured.`}
                  </div>
                )}
              </div>

              <div className="rounded-lg border-dashed border p-3 text-xs text-muted-foreground">
                Note: legacy supplier pricing and seasonal pricing tables remain in the database for
                now and are planned for cleanup later.
              </div>

              <Separator />

              {isEditing ? (
                form.packages.length > 0 ? (
                  form.packages.map((pkg, packageIndex) => (
                    <div key={pkg.id} className="rounded-lg border p-4 space-y-5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          {`${activeVocabulary.package} ${packageIndex + 1}`}
                        </p>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={REMOVE_ICON_BUTTON_CLASS}
                          aria-label={`Remove ${activeVocabulary.package.toLowerCase()}`}
                          onClick={() => removePackage(packageIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2 xl:col-span-2">
                          <Label>{`${activeVocabulary.package} name`}</Label>
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
                        {activeVocabulary.showDurationNights ? (
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
                        ) : null}
                        {activeVocabulary.showSingleSupplement ? (
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
                        ) : null}
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
                              {`Include this ${activeVocabulary.package.toLowerCase()} in supplier listings.`}
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
                          <p className="text-sm font-semibold text-foreground">
                            {activeVocabulary.routePlural}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addRoute(packageIndex)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {`Add ${activeVocabulary.route.toLowerCase()}`}
                          </Button>
                        </div>

                        {pkg.routes.length > 0 ? (
                          pkg.routes.map((route, routeIndex) => (
                            <div
                              key={route.id}
                              className={`grid min-w-0 gap-4 overflow-hidden rounded-lg border p-3 ${
                                activeVocabulary.routeHasLocations
                                  ? "md:grid-cols-2 xl:grid-cols-5"
                                  : "md:grid-cols-[1fr_auto]"
                              }`}
                            >
                              <div
                                className={`space-y-2 ${
                                  activeVocabulary.routeHasLocations ? "xl:col-span-2" : ""
                                }`}
                              >
                                <Label>{`${activeVocabulary.route} name`}</Label>
                                <Input
                                  value={route.name}
                                  onChange={(event) =>
                                    updateRoute(packageIndex, routeIndex, "name", event.target.value)
                                  }
                                />
                              </div>
                              {activeVocabulary.routeHasLocations ? (
                                <>
                                  <div className="min-w-0 space-y-2">
                                    <Label>Origin</Label>
                                    <Select
                                      value={route.originLocationId || undefined}
                                      onValueChange={(value) =>
                                        updateRoute(packageIndex, routeIndex, "originLocationId", value)
                                      }
                                    >
                                      <SelectTrigger className="max-w-full">
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
                                  <div className="min-w-0 space-y-2">
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
                                      <SelectTrigger className="max-w-full">
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
                                </>
                              ) : null}
                              <div className="flex items-end justify-end gap-3">
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
                                  size="icon"
                                  variant="outline"
                                  className={REMOVE_ICON_BUTTON_CLASS}
                                  aria-label={`Remove ${activeVocabulary.route.toLowerCase()}`}
                                  onClick={() => removeRoute(packageIndex, routeIndex)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            {`No ${activeVocabulary.routePlural.toLowerCase()} added yet.`}
                          </div>
                        )}
                      </div>

                      <Separator />

                      <RateCardMatrixEditor
                        pkg={pkg}
                        suiteTypes={form.suiteTypes}
                        packageIndex={packageIndex}
                        locationsById={locationsById}
                        vocabulary={activeVocabulary}
                        onAddPeriod={addRateCardPeriod}
                        onRemovePeriod={removeRateCardPeriod}
                        onUpdatePeriodField={updateRateCardPeriodField}
                        onUpdateCellPrice={updateRateCardPrice}
                        onToggleCell={toggleRateCardCell}
                        periodFieldErrors={
                          overlapFieldErrorsByPackage.get(packageIndex) ?? EMPTY_PERIOD_FIELD_ERRORS
                        }
                      />
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    {`No ${activeVocabulary.packagePlural.toLowerCase()} added yet.`}
                  </div>
                )
              ) : (
                <SupplierPackagesReadOnly
                  packages={supplier.packages}
                  suiteTypes={supplier.suiteTypes}
                  locationsById={locationsById}
                  vocabulary={activeVocabulary}
                />
              )}
            </CardContent>
          </Card>
      </div>
    </ContentTransition>
  )
}
