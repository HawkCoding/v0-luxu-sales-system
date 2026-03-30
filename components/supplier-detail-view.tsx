"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { BufferedInput } from "@/components/ui/buffered-input"
import { BufferedTextarea } from "@/components/ui/buffered-textarea"
import { ContentTransition } from "@/components/ui/content-transition"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
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
import {
  createEmptySupplierEmail,
  SupplierEmailEditor,
  type EditableSupplierEmail,
} from "@/components/supplier-email-editor"
import { useRole } from "@/lib/role-context"
import {
  parseStaleVersionConflictPayload,
  SupplierPatchWriteLock,
} from "@/lib/supplier-save-guard"
import {
  getOverlapValidationSignature,
  shouldHydrateFormFromServer,
} from "@/lib/supplier-editor-utils"
import { shortenUrl } from "@/lib/url"
import { useLocations, useSupplierDetail } from "@/lib/use-data"
import { formatDisplayDate } from "@/lib/date-format"
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
  supplierSlug: string
  presentation?: Presentation
  onDeleted?: () => void
  onClose?: () => void
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
  emails: EditableSupplierEmail[]
  phone: string
  website: string
  location: string
  notes: string
  active: boolean
  suiteTypes: EditableSuiteType[]
  packages: EditablePackage[]
}

declare global {
  interface Window {
    __DISABLE_DRAFT_AUTOSAVE?: boolean
  }
}

const DRAFT_AUTOSAVE_DEBOUNCE_MS = 3000
const DRAFT_AUTOSAVE_STATUS_RESET_MS = 2000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

interface InvertedRateCardDateConflict {
  packageId: string
  packageName: string
  periodKey: string
  validFrom: string
  validTo: string
}

interface StaleVersionDialogState {
  message: string
  currentUpdatedAt: string
  hasRetried: boolean
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
  const detailEmails =
    supplier.emails.length > 0
      ? supplier.emails.map((entry) => ({
          id: entry.id,
          email: entry.email,
          label: entry.label,
        }))
      : supplier.email
        ? [{ id: makeClientId(), email: supplier.email, label: "General" }]
        : [createEmptySupplierEmail()]

  return {
    name: supplier.name,
    kind: supplier.kind,
    emails: detailEmails,
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
    email: "",
    emails: form.emails.map((entry) => ({
      id: entry.id,
      email: entry.email.trim(),
      label: entry.label.trim() || "General",
    })),
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
  const from = validFrom ? formatDisplayDate(validFrom) : "Open"
  const to = validTo ? formatDisplayDate(validTo) : "Open ended"
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

function isInvertedDateRange(validFrom: string, validTo: string | null | undefined): boolean {
  const normalizedValidFrom = validFrom.trim()
  const normalizedValidTo = validTo?.trim() ?? ""
  return normalizedValidFrom.length > 0 && normalizedValidTo.length > 0 && normalizedValidTo < normalizedValidFrom
}

function findPackageInvertedDateRangeConflicts(pkg: EditablePackage): InvertedRateCardDateConflict[] {
  return groupEditableRateCardsByPeriod(pkg.rateCards)
    .filter((period) => isInvertedDateRange(period.validFrom, period.validTo))
    .map((period) => ({
      packageId: pkg.id,
      packageName: pkg.name.trim() || "Unnamed package",
      periodKey: period.key,
      validFrom: period.validFrom.trim(),
      validTo: period.validTo?.trim() ?? "",
    }))
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

function findFirstInvertedDateRangeConflict(
  packages: EditablePackage[],
): InvertedRateCardDateConflict | null {
  for (const pkg of packages) {
    const conflict = findPackageInvertedDateRangeConflicts(pkg)[0]
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

function buildInvertedDateRangeMessage(_conflict: InvertedRateCardDateConflict): string {
  return `Invalid date range - "Valid to" must be after "Valid from".`
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

function getInvertedDateRangeFieldErrorKeys(pkg: EditablePackage): Set<string> {
  const fieldErrors = new Set<string>()
  const conflicts = findPackageInvertedDateRangeConflicts(pkg)
  for (const conflict of conflicts) {
    fieldErrors.add(`${conflict.periodKey}|validFrom`)
    fieldErrors.add(`${conflict.periodKey}|validTo`)
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
  routes: EditableRoute[]
  rateCards: EditableRateCard[]
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

const RateCardMatrixEditor = memo(function RateCardMatrixEditor({
  routes,
  rateCards,
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
  const periodGroups = useMemo(
    () => groupEditableRateCardsByPeriod(rateCards),
    [rateCards],
  )
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(routes[0]?.id ?? null)

  useEffect(() => {
    if (routes.length === 0) {
      if (selectedRouteId !== null) {
        setSelectedRouteId(null)
      }
      return
    }

    if (!selectedRouteId || !routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(routes[0].id)
    }
  }, [routes, selectedRouteId])

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

      {routes.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {vocabulary.routePlural}
          </p>
          <div className="flex flex-wrap gap-2">
            {routes.map((route) => {
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
        </div>
      ) : null}

      {periodGroups.length > 0 ? (
        periodGroups.map((period) => {
          const hasNullRouteItems = period.items.some((item) => item.routeId === null)
          const routeColumns =
            routes.length === 0
              ? [null]
              : selectedRouteId
                ? [
                    ...routes.filter((route) => route.id === selectedRouteId),
                    ...(hasNullRouteItems ? [null] : []),
                  ]
                : [...routes, ...(hasNullRouteItems ? [null] : [])]

          return (
            <div key={period.key} className="rounded-lg border overflow-hidden">
              <div className="grid gap-3 border-b bg-secondary/30 px-4 py-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Valid from</Label>
                  <DatePicker
                    value={period.validFrom}
                    buttonClassName={
                      periodFieldErrors.has(`${period.key}|validFrom`)
                        ? "border-destructive focus-visible:ring-destructive/35"
                        : undefined
                    }
                    onChange={(value) =>
                      onUpdatePeriodField(
                        packageIndex,
                        period.key,
                        "validFrom",
                        value ?? "",
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid to</Label>
                  <div className="relative">
                    {!period.validTo?.trim() ? (
                      <Badge
                        variant="outline"
                        className="absolute top-0 right-1 z-10 -translate-y-1/2 bg-background px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide"
                      >
                        ONGOING
                      </Badge>
                    ) : null}
                    <DatePicker
                      value={period.validTo ?? ""}
                      buttonClassName={
                        periodFieldErrors.has(`${period.key}|validTo`)
                          ? "border-destructive focus-visible:ring-destructive/35"
                          : undefined
                      }
                      onChange={(value) =>
                        onUpdatePeriodField(
                          packageIndex,
                          period.key,
                          "validTo",
                          value || null,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <BufferedInput
                    maxLength={10}
                    value={period.currency}
                    onValueChange={(value) =>
                      onUpdatePeriodField(
                        packageIndex,
                        period.key,
                        "currency",
                        value.toUpperCase(),
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
                          key={route?.id ?? "no-route"}
                          className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {route
                            ? getRouteLabel(route, locationsById, vocabulary)
                            : `No ${vocabulary.route.toLowerCase()}`}
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
                            <td key={`${suiteType.id}-${routeId ?? "no-route"}`} className="px-4 py-3">
                              {match ? (
                                <div className="flex items-center gap-2">
                                  <NumericInput
                                    min="0"
                                    step="0.01"
                                    value={match.pricePerPerson}
                                    onValueChange={(value) =>
                                      onUpdateCellPrice(packageIndex, match.id, value ?? 0)
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
})

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

interface SuiteTypeEditorRowProps {
  suiteType: EditableSuiteType
  suiteTypeIndex: number
  vocabulary: SupplierVocabulary
  onUpdateSuiteType: (
    suiteTypeIndex: number,
    key: keyof EditableSuiteType,
    value: string | boolean,
  ) => void
  onRemoveSuiteType: (suiteTypeIndex: number) => void
}

const SuiteTypeEditorRow = memo(function SuiteTypeEditorRow({
  suiteType,
  suiteTypeIndex,
  vocabulary,
  onUpdateSuiteType,
  onRemoveSuiteType,
}: SuiteTypeEditorRowProps) {
  return (
    <div className="grid gap-4 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]">
      <div className="space-y-2">
        <Label>{`${vocabulary.suiteType} name`}</Label>
        <BufferedInput
          value={suiteType.name}
          onValueChange={(value) => onUpdateSuiteType(suiteTypeIndex, "name", value)}
        />
      </div>
      <div className="flex items-end gap-2">
        <Switch
          checked={suiteType.active}
          onCheckedChange={(checked) => onUpdateSuiteType(suiteTypeIndex, "active", checked)}
        />
        <span className="self-center text-sm text-muted-foreground">Active</span>
      </div>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={`self-end ${REMOVE_ICON_BUTTON_CLASS}`}
        aria-label={`Remove ${vocabulary.suiteType.toLowerCase()}`}
        onClick={() => onRemoveSuiteType(suiteTypeIndex)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
})

interface RouteEditorRowProps {
  route: EditableRoute
  routeIndex: number
  packageIndex: number
  vocabulary: SupplierVocabulary
  locations: Location[]
  onUpdateRoute: (
    packageIndex: number,
    routeIndex: number,
    key: keyof EditableRoute,
    value: string | boolean,
  ) => void
  onRemoveRoute: (packageIndex: number, routeIndex: number) => void
}

const RouteEditorRow = memo(function RouteEditorRow({
  route,
  routeIndex,
  packageIndex,
  vocabulary,
  locations,
  onUpdateRoute,
  onRemoveRoute,
}: RouteEditorRowProps) {
  return (
    <div
      className={`grid min-w-0 gap-4 overflow-hidden rounded-lg border p-3 ${
        vocabulary.routeHasLocations ? "md:grid-cols-2 xl:grid-cols-5" : "md:grid-cols-[1fr_auto]"
      }`}
    >
      <div className={`space-y-2 ${vocabulary.routeHasLocations ? "xl:col-span-2" : ""}`}>
        <Label>{`${vocabulary.route} name`}</Label>
        <BufferedInput
          value={route.name}
          onValueChange={(value) => onUpdateRoute(packageIndex, routeIndex, "name", value)}
        />
      </div>
      {vocabulary.routeHasLocations ? (
        <>
          <div className="min-w-0 space-y-2">
            <Label>Origin</Label>
            <Select
              value={route.originLocationId || undefined}
              onValueChange={(value) =>
                onUpdateRoute(packageIndex, routeIndex, "originLocationId", value)
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
                onUpdateRoute(packageIndex, routeIndex, "destinationLocationId", value)
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
            onCheckedChange={(checked) => onUpdateRoute(packageIndex, routeIndex, "active", checked)}
          />
          <span className="text-sm text-muted-foreground">Active</span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={REMOVE_ICON_BUTTON_CLASS}
          aria-label={`Remove ${vocabulary.route.toLowerCase()}`}
          onClick={() => onRemoveRoute(packageIndex, routeIndex)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
})

interface PackageEditorProps {
  pkg: EditablePackage
  packageIndex: number
  suiteTypes: EditableSuiteType[]
  locations: Location[]
  locationsById: Record<string, Location>
  vocabulary: SupplierVocabulary
  periodFieldErrors: Set<string>
  onRemovePackage: (packageIndex: number) => void
  onUpdatePackage: (
    packageIndex: number,
    updater: (pkg: EditablePackage) => EditablePackage,
  ) => void
  onAddRoute: (packageIndex: number) => void
  onUpdateRoute: (
    packageIndex: number,
    routeIndex: number,
    key: keyof EditableRoute,
    value: string | boolean,
  ) => void
  onRemoveRoute: (packageIndex: number, routeIndex: number) => void
  onAddRateCardPeriod: (packageIndex: number) => void
  onRemoveRateCardPeriod: (packageIndex: number, periodKey: string) => void
  onUpdateRateCardPeriodField: (
    packageIndex: number,
    periodKey: string,
    key: "validFrom" | "validTo" | "currency",
    value: string | null,
  ) => void
  onUpdateRateCardPrice: (packageIndex: number, rateCardId: string, value: number) => void
  onToggleRateCardCell: (
    packageIndex: number,
    periodKey: string,
    suiteTypeId: string,
    routeId: string | null,
    enabled: boolean,
  ) => void
}

const PackageEditor = memo(function PackageEditor({
  pkg,
  packageIndex,
  suiteTypes,
  locations,
  locationsById,
  vocabulary,
  periodFieldErrors,
  onRemovePackage,
  onUpdatePackage,
  onAddRoute,
  onUpdateRoute,
  onRemoveRoute,
  onAddRateCardPeriod,
  onRemoveRateCardPeriod,
  onUpdateRateCardPeriodField,
  onUpdateRateCardPrice,
  onToggleRateCardCell,
}: PackageEditorProps) {
  return (
    <div className="rounded-lg border p-4 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-foreground">{`${vocabulary.package} ${packageIndex + 1}`}</p>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={REMOVE_ICON_BUTTON_CLASS}
          aria-label={`Remove ${vocabulary.package.toLowerCase()}`}
          onClick={() => onRemovePackage(packageIndex)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 xl:col-span-2">
          <Label>{`${vocabulary.package} name`}</Label>
          <BufferedInput
            value={pkg.name}
            onValueChange={(value) =>
              onUpdatePackage(packageIndex, (current) => ({
                ...current,
                name: value,
              }))
            }
          />
        </div>
        {vocabulary.showDurationNights ? (
          <div className="space-y-2">
            <Label>Duration (nights)</Label>
            <NumericInput
              min="0"
              nullable
              value={pkg.durationNights}
              onValueChange={(value) =>
                onUpdatePackage(packageIndex, (current) => ({
                  ...current,
                  durationNights: value,
                }))
              }
            />
          </div>
        ) : null}
        {vocabulary.showSingleSupplement ? (
          <div className="space-y-2">
            <Label>Single supplement %</Label>
            <NumericInput
              min="0"
              step="0.01"
              value={pkg.singleSupplementPct}
              onValueChange={(value) =>
                onUpdatePackage(packageIndex, (current) => ({
                  ...current,
                  singleSupplementPct: value ?? 0,
                }))
              }
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Currency</Label>
          <BufferedInput
            maxLength={10}
            value={pkg.currency}
            onValueChange={(value) =>
              onUpdatePackage(packageIndex, (current) => ({
                ...current,
                currency: value.toUpperCase(),
              }))
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div>
            <p className="text-sm font-medium text-foreground">Active</p>
            <p className="text-xs text-muted-foreground">
              {`Include this ${vocabulary.package.toLowerCase()} in supplier listings.`}
            </p>
          </div>
          <Switch
            checked={pkg.active}
            onCheckedChange={(checked) =>
              onUpdatePackage(packageIndex, (current) => ({
                ...current,
                active: checked,
              }))
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <BufferedTextarea
          rows={3}
          value={pkg.description}
          onValueChange={(value) =>
            onUpdatePackage(packageIndex, (current) => ({
              ...current,
              description: value,
            }))
          }
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{vocabulary.routePlural}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => onAddRoute(packageIndex)}>
            <Plus className="mr-2 h-4 w-4" />
            {`Add ${vocabulary.route.toLowerCase()}`}
          </Button>
        </div>

        {pkg.routes.length > 0 ? (
          pkg.routes.map((route, routeIndex) => (
            <RouteEditorRow
              key={route.id}
              route={route}
              routeIndex={routeIndex}
              packageIndex={packageIndex}
              vocabulary={vocabulary}
              locations={locations}
              onUpdateRoute={onUpdateRoute}
              onRemoveRoute={onRemoveRoute}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {`No ${vocabulary.routePlural.toLowerCase()} added yet.`}
          </div>
        )}
      </div>

      <Separator />

      <RateCardMatrixEditor
        routes={pkg.routes}
        rateCards={pkg.rateCards}
        suiteTypes={suiteTypes}
        packageIndex={packageIndex}
        locationsById={locationsById}
        vocabulary={vocabulary}
        onAddPeriod={onAddRateCardPeriod}
        onRemovePeriod={onRemoveRateCardPeriod}
        onUpdatePeriodField={onUpdateRateCardPeriodField}
        onUpdateCellPrice={onUpdateRateCardPrice}
        onToggleCell={onToggleRateCardCell}
        periodFieldErrors={periodFieldErrors}
      />
    </div>
  )
})

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
  supplierSlug,
  presentation = "page",
  onDeleted,
  onClose,
}: SupplierDetailViewProps) {
  const router = useRouter()
  const { data, isLoading, error, mutate: mutateDetail } = useSupplierDetail(supplierSlug)
  const { data: allLocations = [] } = useLocations()
  const { mutate } = useSWRConfig()
  const { can } = useRole()
  const canEdit = can("edit:suppliers")
  const canDelete = can("delete:suppliers")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPatchInFlight, setIsPatchInFlight] = useState(false)
  const [staleVersionDialog, setStaleVersionDialog] = useState<StaleVersionDialogState | null>(null)
  const [form, setForm] = useState<SupplierFormState | null>(null)
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  )
  const [pendingLocalDraft, setPendingLocalDraft] = useState<SupplierFormState | null>(null)
  const baselineSnapshotRef = useRef<string | null>(null)
  const draftAutosavedSnapshotRef = useRef<string | null>(null)
  const hydratedSupplierIdentityRef = useRef<string | null>(null)
  const expectedUpdatedAtRef = useRef<string | null>(null)
  const lastDraftConflictSnapshotRef = useRef<string | null>(null)
  const lastOverlapWarningRef = useRef<string | null>(null)
  const lastInvertedDateWarningRef = useRef<string | null>(null)
  const draftAutosaveInFlightRef = useRef(false)
  const patchWriteLockRef = useRef(new SupplierPatchWriteLock())
  const draftStatusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlapFieldErrorsCacheRef = useRef<{
    signature: string
    errors: Map<number, Set<string>>
  } | null>(null)
  const formRef = useRef(form)

  const hasLoadError = Boolean(error)
  const supplier = data && !("error" in data) ? data : null
  const isDraftSupplier = supplier?.status === "draft"
  const supplierUpdatedAt = supplier?.updatedAt
  const localDraftStorageKey = `supplier-draft-${supplierSlug}`
  formRef.current = form

  const tryAcquirePatchWriteLock = useCallback(() => {
    const acquired = patchWriteLockRef.current.tryAcquire()
    if (acquired) {
      setIsPatchInFlight(true)
    }
    return acquired
  }, [])

  const releasePatchWriteLock = useCallback(() => {
    patchWriteLockRef.current.release()
    setIsPatchInFlight(false)
  }, [])

  useEffect(() => {
    if (!hasLoadError) {
      return
    }
    router.replace("/app/suppliers")
  }, [hasLoadError, router])

  const exitSupplierDetail = useCallback(() => {
    if (presentation === "modal") {
      onClose?.()
      return
    }
    router.push("/app/suppliers")
  }, [onClose, presentation, router])

  useEffect(() => {
    if (supplier) {
      const nextForm = buildFormState(supplier)
      const snapshot = JSON.stringify(nextForm)
      const supplierIdentity = `${supplier.id}:${supplier.updatedAt}`
      const shouldHydrateFromServer = shouldHydrateFormFromServer({
        hasLocalForm: form !== null,
        isEditing,
        supplierStatus: supplier.status,
        supplierIdentityChanged: hydratedSupplierIdentityRef.current !== supplierIdentity,
      })

      if (shouldHydrateFromServer) {
        setForm(nextForm)
        baselineSnapshotRef.current = snapshot
        draftAutosavedSnapshotRef.current = snapshot
        overlapFieldErrorsCacheRef.current = null
      }
      expectedUpdatedAtRef.current = supplier.updatedAt
      hydratedSupplierIdentityRef.current = supplierIdentity

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
          const parsedEmails = Array.isArray((parsed as { emails?: unknown }).emails)
            ? parsed.emails
            : []
          if (
            parsed &&
            typeof parsed === "object" &&
            Array.isArray(parsed.suiteTypes) &&
            Array.isArray(parsed.packages)
          ) {
            setPendingLocalDraft({
              ...parsed,
              emails:
                parsedEmails.length > 0
                  ? parsedEmails
                  : supplier.email
                    ? [{ id: makeClientId(), email: supplier.email, label: "General" }]
                    : [createEmptySupplierEmail()],
            })
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
    startTransition(() => {
      setForm((current) => (current ? { ...current, [key]: value } : current))
    })
  }

  const updateSuiteTypes = useCallback(
    (updater: (suiteTypes: EditableSuiteType[]) => EditableSuiteType[]) => {
      startTransition(() => {
        setForm((current) =>
          current ? { ...current, suiteTypes: updater(current.suiteTypes) } : current,
        )
      })
    },
    [],
  )

  const addSuiteType = useCallback(() => {
    updateSuiteTypes((suiteTypes) => [...suiteTypes, createEmptySuiteType()])
  }, [updateSuiteTypes])

  const updateSuiteType = useCallback(
    (
      suiteTypeIndex: number,
      key: keyof EditableSuiteType,
      value: string | boolean,
    ) => {
      updateSuiteTypes((suiteTypes) =>
        suiteTypes.map((suiteType, index) =>
          index === suiteTypeIndex ? { ...suiteType, [key]: value } : suiteType,
        ),
      )
    },
    [updateSuiteTypes],
  )

  const removeSuiteType = useCallback((suiteTypeIndex: number) => {
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
  }, [])

  const updatePackages = useCallback(
    (updater: (packages: EditablePackage[]) => EditablePackage[]) => {
      startTransition(() => {
        setForm((current) =>
          current ? { ...current, packages: updater(current.packages) } : current,
        )
      })
    },
    [],
  )

  const updatePackage = useCallback(
    (
      packageIndex: number,
      updater: (pkg: EditablePackage) => EditablePackage,
    ) => {
      updatePackages((packages) =>
        packages.map((pkg, index) => (index === packageIndex ? updater(pkg) : pkg)),
      )
    },
    [updatePackages],
  )

  const overlapFieldErrorsByPackage = useMemo(() => {
    if (!form) {
      return new Map<number, Set<string>>()
    }
    const signature = getOverlapValidationSignature(form)
    const cached = overlapFieldErrorsCacheRef.current
    if (cached && cached.signature === signature) {
      return cached.errors
    }
    const errors = new Map(
      form.packages.map((pkg, packageIndex) => {
        const overlapFieldErrors = getRateCardOverlapFieldErrorKeys(pkg, form.suiteTypes)
        const invertedDateFieldErrors = getInvertedDateRangeFieldErrorKeys(pkg)
        for (const fieldError of invertedDateFieldErrors) {
          overlapFieldErrors.add(fieldError)
        }
        return [packageIndex, overlapFieldErrors]
      }),
    )
    overlapFieldErrorsCacheRef.current = { signature, errors }
    return errors
  }, [form])

  const warnForOverlapIfNeeded = useCallback(
    (
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
      toast.warning(buildRateCardOverlapWarningMessage(overlapConflict, vocabulary), {
        id: "rate-card-overlap",
      })
    },
    [],
  )

  const warnForInvertedDateRangeIfNeeded = useCallback((pkg: EditablePackage) => {
    const invertedDateConflict = findPackageInvertedDateRangeConflicts(pkg)[0]
    if (!invertedDateConflict) {
      lastInvertedDateWarningRef.current = null
      return
    }

    const warningKey = [
      invertedDateConflict.packageId,
      invertedDateConflict.periodKey,
      invertedDateConflict.validFrom,
      invertedDateConflict.validTo,
    ].join("|")

    if (lastInvertedDateWarningRef.current === warningKey) {
      return
    }
    lastInvertedDateWarningRef.current = warningKey
    toast.warning(buildInvertedDateRangeMessage(invertedDateConflict), {
      id: "rate-card-inverted-date",
      duration: 4500,
    })
  }, [])

  const addPackage = useCallback(() => {
    updatePackages((packages) => [...packages, createEmptyPackage()])
  }, [updatePackages])

  const removePackage = useCallback(
    (packageIndex: number) => {
      updatePackages((packages) => packages.filter((_pkg, index) => index !== packageIndex))
    },
    [updatePackages],
  )

  const addRoute = useCallback(
    (packageIndex: number) => {
      updatePackage(packageIndex, (pkg) => ({
        ...pkg,
        routes: [...pkg.routes, createEmptyRoute(locations)],
      }))
    },
    [locations, updatePackage],
  )

  const updateRoute = useCallback(
    (
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
    },
    [updatePackage],
  )

  const removeRoute = useCallback(
    (packageIndex: number, routeIndex: number) => {
      const currentForm = formRef.current
      if (!currentForm) return
      const pkg = currentForm.packages[packageIndex]
      if (!pkg) return

      const routeId = pkg.routes[routeIndex]?.id
      const nextPackage = {
        ...pkg,
        routes: pkg.routes.filter((_route, index) => index !== routeIndex),
        rateCards: pkg.rateCards.map((rateCard) =>
          rateCard.routeId === routeId ? { ...rateCard, routeId: null } : rateCard,
        ),
      }

      const conflict = findPackageRateCardConflicts(nextPackage, currentForm.suiteTypes)[0]
      if (conflict) {
        const vocabulary = getSupplierVocabulary(currentForm.kind)
        toast.error(buildRateCardConflictMessage(conflict, vocabulary), { id: "rate-card-conflict" })
        return
      }

      updatePackage(packageIndex, () => nextPackage)
    },
    [updatePackage],
  )

  const addRateCardPeriod = useCallback(
    (packageIndex: number) => {
      const currentForm = formRef.current
      if (!currentForm) return

      const vocabulary = getSupplierVocabulary(currentForm.kind)
      const availableSuiteTypes = currentForm.suiteTypes
      if (availableSuiteTypes.length === 0) {
        toast.error(
          `Add at least one ${vocabulary.suiteType.toLowerCase()} before creating a pricing period.`,
          { id: "rate-card-no-suite-type" },
        )
        return
      }

      const pkg = currentForm.packages[packageIndex]
      if (!pkg) return

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

      const nextPackage = { ...pkg, rateCards: [...baseRateCards, ...newRateCards] }
      const conflict = findPackageRateCardConflicts(nextPackage, availableSuiteTypes)[0]
      if (conflict) {
        toast.error(
          "This pricing period duplicates an existing suite type/route/start-date combination. Choose a different start date.",
          { id: "rate-card-conflict" },
        )
        return
      }

      warnForOverlapIfNeeded(nextPackage, availableSuiteTypes, vocabulary)
      updatePackage(packageIndex, () => nextPackage)
    },
    [updatePackage, warnForOverlapIfNeeded],
  )

  const updateRateCardPeriodField = useCallback(
    (
      packageIndex: number,
      periodKey: string,
      key: "validFrom" | "validTo" | "currency",
      value: string | null,
    ) => {
      const currentForm = formRef.current
      if (!currentForm) return
      const pkg = currentForm.packages[packageIndex]
      if (!pkg) return

      let nextPeriodKey = periodKey
      let nextRateCards = pkg.rateCards.map((rateCard) => {
        if (
          getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) !== periodKey
        ) {
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
          const nextRateCard = { ...rateCard, validFrom: value ?? "" }
          nextPeriodKey = getRatePeriodKey(
            nextRateCard.validFrom,
            nextRateCard.validTo,
            nextRateCard.currency,
          )
          return nextRateCard
        }

        const nextRateCard = { ...rateCard, validTo: value }
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
        const availableSuiteTypes = currentForm.suiteTypes
        const conflict = findPackageRateCardConflicts(nextPackage, availableSuiteTypes)[0]
        if (conflict) {
          toast.error(
            "That start date duplicates an existing suite type/route/start-date combination.",
            { id: "rate-card-date-conflict" },
          )
          return
        }

        const vocabulary = getSupplierVocabulary(currentForm.kind)
        warnForInvertedDateRangeIfNeeded(nextPackage)
        warnForOverlapIfNeeded(nextPackage, availableSuiteTypes, vocabulary)
      }

      const finalRateCards = nextRateCards
      updatePackage(packageIndex, () => ({ ...pkg, rateCards: finalRateCards }))
    },
    [updatePackage, warnForInvertedDateRangeIfNeeded, warnForOverlapIfNeeded],
  )

  const removeRateCardPeriod = useCallback(
    (packageIndex: number, periodKey: string) => {
      updatePackage(packageIndex, (pkg) => ({
        ...pkg,
        rateCards: pkg.rateCards.filter(
          (rateCard) =>
            getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) !== periodKey,
        ),
      }))
    },
    [updatePackage],
  )

  const updateRateCardPrice = useCallback(
    (packageIndex: number, rateCardId: string, value: number) => {
      startTransition(() => {
        updatePackage(packageIndex, (pkg) => ({
          ...pkg,
          rateCards: pkg.rateCards.map((rateCard) =>
            rateCard.id === rateCardId ? { ...rateCard, pricePerPerson: value } : rateCard,
          ),
        }))
      })
    },
    [updatePackage],
  )

  const toggleRateCardCell = useCallback(
    (
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
    },
    [updatePackage],
  )

  useEffect(() => {
    if (!canEdit || !form || !isEditing || isPatchInFlight) return
    const disableDraftAutosaveFromQuery =
      new URLSearchParams(window.location.search).get("disableDraftAutosave") === "true"
    const draftAutosaveDisabled =
      window.__DISABLE_DRAFT_AUTOSAVE === true || disableDraftAutosaveFromQuery

    if (isDraftSupplier && !draftAutosaveDisabled) {
      const snapshot = JSON.stringify(form)
      if (snapshot === draftAutosavedSnapshotRef.current || draftAutosaveInFlightRef.current) {
        return
      }

      const timeout = setTimeout(async () => {
        if (!tryAcquirePatchWriteLock()) {
          return
        }
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
          const autosaveRequestStartedAt = performance.now()
          const response = await fetch(`/api/suppliers/${supplierSlug}?draft=true`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...buildDraftPayload(form),
              expectedUpdatedAt: expectedUpdatedAtRef.current ?? supplierUpdatedAt,
            }),
          })
          const payload = (await response.json()) as unknown
          if (!response.ok) {
            const staleConflict = parseStaleVersionConflictPayload(payload)
            if (staleConflict) {
              expectedUpdatedAtRef.current = staleConflict.currentUpdatedAt
              setDraftSaveStatus("idle")
              return
            }
            setDraftSaveStatus("error")
            return
          }
          const successPayload = payload as { updatedAt?: string }
          if (typeof successPayload.updatedAt === "string") {
            expectedUpdatedAtRef.current = successPayload.updatedAt
            if (supplier?.id) {
              hydratedSupplierIdentityRef.current = `${supplier.id}:${successPayload.updatedAt}`
            }
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
          releasePatchWriteLock()
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
  }, [
    canEdit,
    form,
    isDraftSupplier,
    isEditing,
    isPatchInFlight,
    localDraftStorageKey,
    mutate,
    mutateDetail,
    supplierSlug,
    supplierUpdatedAt,
    releasePatchWriteLock,
    tryAcquirePatchWriteLock,
  ])

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
    if (supplier?.status === "draft") {
      exitSupplierDetail()
      return
    }
    if (supplier) {
      setForm(buildFormState(supplier))
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

    const cleanedEmails = form.emails
      .map((entry) => ({
        id: entry.id,
        email: entry.email.trim(),
        label: entry.label.trim() || "General",
      }))
      .filter((entry) => entry.email.length > 0)

    const invalidEmail = cleanedEmails.find((entry) => !EMAIL_PATTERN.test(entry.email))
    if (invalidEmail) {
      toast.error(`Invalid email address: ${invalidEmail.email}`)
      return
    }

    const seenEmailValues = new Set<string>()
    const duplicateEmail = cleanedEmails.find((entry) => {
      const normalized = entry.email.toLowerCase()
      if (seenEmailValues.has(normalized)) {
        return true
      }
      seenEmailValues.add(normalized)
      return false
    })
    if (duplicateEmail) {
      toast.error(`Duplicate supplier email detected: ${duplicateEmail.email}`)
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
    const invertedDateConflict = findFirstInvertedDateRangeConflict(meaningfulPackages)
    if (invertedDateConflict) {
      toast.error(buildInvertedDateRangeMessage(invertedDateConflict), { duration: 4500 })
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

    if (!tryAcquirePatchWriteLock()) {
      toast.error("A supplier save is already in progress. Please wait a moment and try again.")
      return
    }

    setIsSaving(true)
    try {
      const saveRequestStartedAt = performance.now()
      const response = await fetch(`/api/suppliers/${supplierSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          kind: form.kind,
          email: "",
          emails: cleanedEmails,
          phone: form.phone.trim(),
          website: form.website.trim(),
          location: form.location.trim(),
          notes: form.notes.trim(),
          active: form.active,
          suiteTypes: cleanedSuiteTypes,
          packages: cleanedPackages,
          expectedUpdatedAt:
            expectedUpdatedAtRef.current ?? supplier?.updatedAt,
        }),
      })
      const payload = (await response.json()) as unknown

      if (!response.ok) {
        const staleConflict = parseStaleVersionConflictPayload(payload)
        if (response.status === 409 && staleConflict) {
          expectedUpdatedAtRef.current = staleConflict.currentUpdatedAt
          setStaleVersionDialog((current) => ({
            currentUpdatedAt: staleConflict.currentUpdatedAt,
            message: staleConflict.error,
            hasRetried: current?.hasRetried ?? false,
          }))
          return
        }

        const typedPayload = payload as {
          error?: string
          details?: unknown
        }
        const conflictDetails = typedPayload?.details as
          | {
              packageId?: string
              suiteTypeId?: string
              routeId?: string | null
              validFrom?: string
            }
          | undefined
        const isRouteNameConflict =
          response.status === 409 &&
          typeof typedPayload.error === "string" &&
          typedPayload.error.toLowerCase().includes("route with this name already exists")
        if (isRouteNameConflict) {
          toast.error(
            `Duplicate ${vocabulary.route.toLowerCase()} name in the same ${vocabulary.package.toLowerCase()}. Rename one and try again.`,
          )
          return
        }
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
        toast.error(typedPayload.error ?? "Failed to update supplier")
        return
      }
      const successPayload = payload as { updatedAt?: string }
      if (typeof successPayload?.updatedAt === "string") {
        expectedUpdatedAtRef.current = successPayload.updatedAt
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
      setStaleVersionDialog(null)
      toast.success(
        isDraftSupplier ? "Supplier published successfully" : "Supplier updated successfully",
      )
    } catch {
      toast.error("Failed to update supplier")
    } finally {
      setIsSaving(false)
      releasePatchWriteLock()
    }
  }

  const handleReloadAfterStaleConflict = async () => {
    if (!tryAcquirePatchWriteLock()) {
      return
    }

    setIsSaving(true)
    try {
      await mutateDetail()
      setIsEditing(false)
      setPendingLocalDraft(null)
      setStaleVersionDialog(null)
      toast.success("Latest supplier data loaded. Unsaved local edits were replaced.")
    } catch {
      toast.error("Failed to refresh supplier. Please try again.")
    } finally {
      setIsSaving(false)
      releasePatchWriteLock()
    }
  }

  const handleRetryAfterStaleConflict = async () => {
    if (!staleVersionDialog) {
      return
    }

    if (staleVersionDialog.hasRetried) {
      toast.error("Retry already attempted. Reload latest before trying again.")
      return
    }

    expectedUpdatedAtRef.current = staleVersionDialog.currentUpdatedAt
    setStaleVersionDialog({
      ...staleVersionDialog,
      hasRetried: true,
    })
    await handleSave()
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/suppliers/${supplierSlug}`, {
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
      if (onDeleted) {
        onDeleted()
      } else {
        router.push("/app/suppliers")
      }
    } catch {
      toast.error("Failed to delete supplier")
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading || hasLoadError) {
    return <SupplierDetailSkeleton presentation={presentation} />
  }

  if (!supplier || !form) {
    return null
  }

  const activeVocabulary = getSupplierVocabulary(isEditing ? form.kind : supplier.kind)
  const supplierEmailsForDisplay =
    supplier.emails.length > 0
      ? supplier.emails
      : supplier.email
        ? [{ id: "legacy-email", supplierId: supplier.id, email: supplier.email, label: "General", createdAt: supplier.createdAt }]
        : []

  return (
    <>
      <AlertDialog
        open={staleVersionDialog !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) {
            setStaleVersionDialog(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supplier changed while you were editing</AlertDialogTitle>
            <AlertDialogDescription>
              {staleVersionDialog?.message ??
                "This supplier changed before your latest save could complete."}
              {staleVersionDialog?.hasRetried
                ? " Retry already attempted once. Reload latest data before trying again."
                : " You can retry once with the latest server version token, or reload latest data."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Keep editing</AlertDialogCancel>
            <Button variant="outline" onClick={handleReloadAfterStaleConflict} disabled={isSaving}>
              Reload latest
            </Button>
            <AlertDialogAction
              onClick={handleRetryAfterStaleConflict}
              disabled={isSaving || staleVersionDialog?.hasRetried}
            >
              Retry my save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                {supplier.status !== "draft" && (
                  <Badge variant={supplier.status === "active" ? "default" : "outline"}>
                    {supplier.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-2${
              presentation === "modal" ? " mr-10 sm:mr-12" : ""
            }`}
          >
            {canEdit && !isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}

            {isEditing && (
              <>
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isDeleting || isPatchInFlight}>
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
                <Button variant="outline" onClick={cancelEdit} disabled={isPatchInFlight}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isPatchInFlight}>
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
                    <BufferedInput
                      id="supplier-name"
                      value={form.name}
                      onValueChange={(value) => updateField("name", value)}
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
                    <Label htmlFor="supplier-phone">Phone</Label>
                    <BufferedInput
                      id="supplier-phone"
                      value={form.phone}
                      onValueChange={(value) => updateField("phone", value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-website">Website</Label>
                    <BufferedInput
                      id="supplier-website"
                      value={form.website}
                      onValueChange={(value) => updateField("website", value)}
                      onBlur={(event) => updateField("website", shortenUrl(event.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-location">Location</Label>
                    <BufferedInput
                      id="supplier-location"
                      value={form.location}
                      onValueChange={(value) => updateField("location", value)}
                    />
                  </div>
                </div>

                <SupplierEmailEditor
                  emails={form.emails}
                  onChange={(emails) => updateField("emails", emails)}
                  idPrefix="supplier-detail"
                />

                <div className="space-y-2">
                  <Label htmlFor="supplier-notes">Notes</Label>
                  <BufferedTextarea
                    id="supplier-notes"
                    value={form.notes}
                    onValueChange={(value) => updateField("notes", value)}
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
                  <InfoItem label="Phone" value={supplier.phone} />
                  <InfoItem label="Website" value={supplier.website} />
                  <InfoItem label="Location" value={supplier.location} />
                  <InfoItem
                    label="Last updated"
                    value={formatDisplayDate(supplier.updatedAt)}
                  />
                  <InfoItem
                    label="Status"
                    value={
                      supplier.status === "draft"
                        ? "Draft"
                        : supplier.status === "active"
                          ? "Active"
                          : "Inactive"
                    }
                  />
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 text-sm text-muted-foreground sm:col-span-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>Supplier emails</span>
                    </div>
                    {supplierEmailsForDisplay.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {supplierEmailsForDisplay.map((entry) => (
                          <a
                            key={entry.id}
                            href={`mailto:${entry.email}`}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-foreground hover:bg-secondary/40"
                          >
                            <Badge variant="outline" className="rounded-full">
                              {entry.label}
                            </Badge>
                            <span>{entry.email}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span>No email on file</span>
                    )}
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
                      <SuiteTypeEditorRow
                        key={suiteType.id}
                        suiteType={suiteType}
                        suiteTypeIndex={suiteTypeIndex}
                        vocabulary={activeVocabulary}
                        onUpdateSuiteType={updateSuiteType}
                        onRemoveSuiteType={removeSuiteType}
                      />
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

              <Separator />

              {isEditing ? (
                form.packages.length > 0 ? (
                  form.packages.map((pkg, packageIndex) => (
                    <PackageEditor
                      key={pkg.id}
                      pkg={pkg}
                      packageIndex={packageIndex}
                      suiteTypes={form.suiteTypes}
                      locations={locations}
                      locationsById={locationsById}
                      vocabulary={activeVocabulary}
                      periodFieldErrors={
                        overlapFieldErrorsByPackage.get(packageIndex) ?? EMPTY_PERIOD_FIELD_ERRORS
                      }
                      onRemovePackage={removePackage}
                      onUpdatePackage={updatePackage}
                      onAddRoute={addRoute}
                      onUpdateRoute={updateRoute}
                      onRemoveRoute={removeRoute}
                      onAddRateCardPeriod={addRateCardPeriod}
                      onRemoveRateCardPeriod={removeRateCardPeriod}
                      onUpdateRateCardPeriodField={updateRateCardPeriodField}
                      onUpdateRateCardPrice={updateRateCardPrice}
                      onToggleRateCardCell={toggleRateCardCell}
                    />
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
    </>
  )
}
