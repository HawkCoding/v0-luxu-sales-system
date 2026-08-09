"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { SortableList } from "@/components/ui/sortable-list"
import { isOngoingRateCard } from "@/lib/rate-cards/resolve"
import { SuiteVocabularyCard, type EditableVocabularyValue } from "@/components/supplier/suite-vocabulary-card"
import { ApplicableRatesCard } from "@/components/supplier/applicable-rates-card"
import { VariantChipPicker } from "@/components/supplier/variant-chip-picker"
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
import { getMinSelectableRateYear } from "@/components/ui/calendar"
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
import {
  computeChildPrice,
  DEFAULT_TRAIN_CHILD_PRICE_RATIO,
  shouldAutoFillChild,
  shouldPromptChildUpdate,
} from "@/lib/suppliers/auto-child-price"
import { AgeRangeChip } from "@/components/ui/age-range-chip"
import {
  DEFAULT_AGE_BUCKETS,
  formatBucketRange,
  resolveAgeBuckets,
  type AgeBuckets,
} from "@/lib/pricing/age-buckets"
import { shortenUrl } from "@/lib/url"
import { applyRateMarkdown } from "@/lib/pricing/rate-markdown"
import { rebaseRateAdjustments } from "@/lib/rate-types/rebase-adjustments"
import { cn } from "@/lib/utils"
import { useAgeBandsSettings, useLocations, useSupplierDetail, useTrainChildPriceRatio } from "@/lib/use-data"
import { formatDisplayDate } from "@/lib/date-format"
import { formatRateCardValidityRange } from "@/lib/rate-card-validity"
import {
  rateCardMatchesPill,
  resolveRateTypePills,
} from "@/lib/rate-types/view-rate-type-pills"
import { buildRouteName } from "@/lib/routes/route-name"
import {
  getSupplierVocabulary,
  isTransportSupplier,
  SUPPLIER_KIND_LABELS,
  type Location,
  type SupplierDetail,
  type SupplierKind,
  type SupplierPackage,
  type SupplierRateCard,
  type SupplierSuiteType,
  type SupplierVocabulary,
  type RouteDirectionMode,
  type RateType,
  type SupplierRateAdjustment,
  type VehicleRentalRouteDetails,
} from "@/lib/types"

const DESCRIPTION_SOFT_LIMIT = 500

/** Inclusion/exclusion bullets are edited as one-per-line text and stored as a string[]. */
function splitBulletLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
}

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
  originLocationId: string | null
  destinationLocationId: string | null
  pickupPoint: string | null
  dropoffPoint: string | null
  vehicleRentalDetails: Omit<VehicleRentalRouteDetails, "routeId" | "createdAt" | "updatedAt"> | null
  directionMode: RouteDirectionMode
  durationDays: number | null
  active: boolean
}

interface EditableSuiteType {
  id: string
  name: string
  passengerCapacity: number | null
  luggageCapacity: number | null
  description: string | null
  active: boolean
  sortOrder: number
  bedroomTypeIds: string[]
  bedroomLayoutIds: string[]
  bathroomTypeIds: string[]
}

interface EditableRateCard {
  id: string
  routeId: string
  suiteTypeId: string
  rateTypeId: string
  pricePerPerson: number
  childPrice: number | null
  infantPrice: number | null
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
  /** 'manual' skips rate cards entirely -- the fare is typed per unit at quote-build time. */
  pricingMode: "rate_card" | "manual"
  emails: EditableSupplierEmail[]
  phone: string
  website: string
  location: string
  locationDetail: string
  locationId: string | null
  description: string
  notes: string
  active: boolean
  singleSupplementPct: number
  infantMaxAge: number | null
  childMaxAge: number | null
  /** HH:MM; empty string = unset. Check-in/check-out (hotels) or departure/arrival (trains). */
  defaultTimeStart: string
  defaultTimeEnd: string
  /** One client-facing bullet per line; split into a string[] on save. */
  inclusions: string
  exclusions: string
  /** This supplier's own default rate type; null means inherit from its kind / the system default. */
  defaultRateTypeOverrideId: string | null
  rateAdjustments: SupplierRateAdjustment[]
  suiteTypes: EditableSuiteType[]
  packages: EditablePackage[]
  bedroomTypes: EditableVocabularyValue[]
  bedroomLayouts: EditableVocabularyValue[]
  bathroomTypes: EditableVocabularyValue[]
}

const DRAFT_AUTOSAVE_DEBOUNCE_MS = 3000
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
  routeId: string
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
  routeId: string
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

function createEmptyRoute(kind: SupplierKind): EditableRoute {
  const isTransport = isTransportSupplier(kind)
  // Never pre-select locations: kinds without location fields (hotels, tour
  // operators) would silently persist whichever locations sort first, and
  // kinds with visible selects should force an explicit choice.
  return {
    id: makeClientId(),
    name: "",
    originLocationId: null,
    destinationLocationId: null,
    pickupPoint: "",
    dropoffPoint: "",
    vehicleRentalDetails:
      kind === "vehicle_rental"
        ? {
            includedKmPerDay: null,
            extraKmPrice: null,
            securityDeposit: null,
            oneWayFee: null,
          }
        : null,
    directionMode: "one_way",
    durationDays: null,
    active: true,
  }
}

function createEmptySuiteType(sortOrder = 0): EditableSuiteType {
  return {
    id: makeClientId(),
    name: "",
    passengerCapacity: null,
    luggageCapacity: null,
    description: null,
    active: true,
    sortOrder,
    bedroomTypeIds: [],
    bedroomLayoutIds: [],
    bathroomTypeIds: [],
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

function createRoutesRateGroup(): EditablePackage {
  return {
    ...createEmptyPackage(),
    id: "supplier-routes-and-rates",
    name: "Routes and Rates",
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
    pricingMode: supplier.pricingMode,
    emails: detailEmails,
    phone: supplier.phone ?? "",
    website: supplier.website ?? "",
    location: supplier.location ?? "",
    locationDetail: supplier.locationDetail ?? "",
    locationId: supplier.kind === "train_operator" ? null : supplier.locationId ?? null,
    description: supplier.description ?? "",
    notes: supplier.notes ?? "",
    active: supplier.active,
    singleSupplementPct: supplier.singleSupplementPct,
    infantMaxAge: supplier.infantMaxAge ?? null,
    childMaxAge: supplier.childMaxAge ?? null,
    // Postgres `time` columns arrive as HH:MM:SS — keep only HH:MM for the inputs.
    defaultTimeStart: (supplier.defaultTimeStart ?? "").slice(0, 5),
    defaultTimeEnd: (supplier.defaultTimeEnd ?? "").slice(0, 5),
    inclusions: (supplier.inclusions ?? []).join("\n"),
    exclusions: (supplier.exclusions ?? []).join("\n"),
    defaultRateTypeOverrideId: supplier.defaultRateTypeOverrideId ?? null,
    rateAdjustments: (supplier.rateAdjustments ?? []).map((adjustment) => ({
      rateTypeId: adjustment.rateTypeId,
      discountPct: adjustment.discountPct,
    })),
    suiteTypes: supplier.suiteTypes.map((suiteType, index) => ({
      id: suiteType.id,
      name: suiteType.name,
      passengerCapacity: suiteType.passengerCapacity ?? null,
      luggageCapacity: suiteType.luggageCapacity ?? null,
      description: suiteType.description ?? null,
      active: suiteType.active,
      sortOrder: suiteType.sortOrder ?? index,
      bedroomTypeIds: suiteType.bedroomTypeIds ?? [],
      bedroomLayoutIds: suiteType.bedroomLayoutIds ?? [],
      bathroomTypeIds: suiteType.bathroomTypeIds ?? [],
    })),
    bedroomTypes: (supplier.bedroomTypes ?? []).map((value, index) => ({
      id: value.id,
      name: value.name,
      sortOrder: value.sortOrder ?? index,
      archivedAt: value.archivedAt ?? null,
    })),
    bedroomLayouts: (supplier.bedroomLayouts ?? []).map((value, index) => ({
      id: value.id,
      name: value.name,
      sortOrder: value.sortOrder ?? index,
      archivedAt: value.archivedAt ?? null,
    })),
    bathroomTypes: (supplier.bathroomTypes ?? []).map((value, index) => ({
      id: value.id,
      name: value.name,
      sortOrder: value.sortOrder ?? index,
      archivedAt: value.archivedAt ?? null,
    })),
    packages: [
      {
        ...createRoutesRateGroup(),
        routes: supplier.routes.map((route) => ({
          id: route.id,
          name: route.name,
          originLocationId: route.originLocationId,
          destinationLocationId: route.destinationLocationId,
          pickupPoint: route.pickupPoint ?? null,
          dropoffPoint: route.dropoffPoint ?? null,
          vehicleRentalDetails: route.vehicleRentalDetails
            ? {
                includedKmPerDay: route.vehicleRentalDetails.includedKmPerDay,
                extraKmPrice: route.vehicleRentalDetails.extraKmPrice,
                securityDeposit: route.vehicleRentalDetails.securityDeposit,
                oneWayFee: route.vehicleRentalDetails.oneWayFee,
              }
            : null,
          directionMode: route.directionMode ?? "one_way",
          durationDays: route.durationDays ?? null,
          active: route.active,
        })),
        rateCards: supplier.rateCards.map((rateCard) => ({
          id: rateCard.id,
          routeId: rateCard.routeId,
          suiteTypeId: rateCard.suiteTypeId,
          rateTypeId: rateCard.rateTypeId,
          pricePerPerson: rateCard.pricePerPerson,
          childPrice: rateCard.childPrice,
          infantPrice: rateCard.infantPrice,
          currency: rateCard.currency,
          validFrom: rateCard.validFrom,
          validTo: rateCard.validTo,
        })),
      },
    ],
  }
}

function getSupplierLocationId(form: SupplierFormState): string | null {
  return form.kind === "train_operator" ? null : form.locationId ?? null
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
  routeId?: string,
  rateTypeId?: string,
): EditableRateCard[] {
  return rateCards.map((rateCard) =>
    getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) === periodKey &&
    (!routeId || rateCard.routeId === routeId) &&
    (!rateTypeId || rateCard.rateTypeId === rateTypeId)
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
  routeId: string
  rateTypeId?: string
  validFrom: string
}) {
  return [
    rateCard.rateTypeId ?? "__default__",
    rateCard.suiteTypeId,
    rateCard.routeId ?? "__null__",
    rateCard.validFrom,
  ].join("|")
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
      rateTypeId: rateCard.rateTypeId,
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
  return `Duplicate rate for ${vocabulary.suiteType.toLowerCase()} "${conflict.suiteTypeName}", ${vocabulary.route.toLowerCase()} "${conflict.routeName}", start date ${formatDisplayDate(conflict.validFrom)}. Keep only one row for that combination.`
}

function buildRouteDeletionConfirmationMessage({
  routeName,
  linkedRateCardCount,
  vocabulary,
}: {
  routeName: string
  linkedRateCardCount: number
  vocabulary: SupplierVocabulary
}): string {
  const rateCardLabel = linkedRateCardCount === 1 ? "pricing row" : "pricing rows"
  return `Delete ${vocabulary.route.toLowerCase()} "${routeName}"? This will also permanently delete ${linkedRateCardCount} linked ${rateCardLabel}.`
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
  routeId: string
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

    const key = [rateCard.rateTypeId ?? "__default__", rateCard.suiteTypeId, rateCard.routeId ?? "__null__"].join("|")
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
  const to = range.validTo ? formatDisplayDate(range.validTo) : "open ended"
  return `${formatDisplayDate(range.validFrom)} to ${to}`
}

function buildRateCardOverlapConflictMessage(
  conflict: RateCardOverlapConflict,
  vocabulary: SupplierVocabulary,
): string {
  return `Overlapping rate periods for ${vocabulary.suiteType.toLowerCase()} "${conflict.suiteTypeName}", ${vocabulary.route.toLowerCase()} "${conflict.routeName}": ${buildRateCardDateRangeLabel(conflict.firstRange)} overlaps ${buildRateCardDateRangeLabel(conflict.secondRange)}. Adjust dates so periods do not overlap.`
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
      label: formatRateCardValidityRange(rateCard.validFrom, rateCard.validTo, formatDisplayDate),
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
    : "p-6 space-y-6"
}

function getLocationName(locationsById: Record<string, Location>, id: string | null) {
  if (!id) return "Unknown location"
  return locationsById[id]?.name ?? "Unknown location"
}

function getRouteLabel(
  route: {
    name: string
    originLocationId: string | null
    destinationLocationId: string | null
    pickupPoint?: string | null
    dropoffPoint?: string | null
  },
  locationsById: Record<string, Location>,
  vocabulary: SupplierVocabulary,
) {
  if (route.name.trim()) {
    return route.name
  }

  if (!vocabulary.routeHasLocations) {
    return route.name || `Unnamed ${vocabulary.route.toLowerCase()}`
  }

  if (route.pickupPoint || route.dropoffPoint) {
    return `${route.pickupPoint || "Pickup"} -> ${route.dropoffPoint || "Drop-off"}`
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
  rateTypes,
  defaultRateTypeId,
  locationsById,
  vocabulary,
}: {
  pkg: SupplierPackage
  suiteTypes: SupplierSuiteType[]
  rateTypes: RateType[]
  defaultRateTypeId: string | null
  locationsById: Record<string, Location>
  vocabulary: SupplierVocabulary
}) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [selectedRateTypeId, setSelectedRateTypeId] = useState<string | null>(null)

  const { pills: rateTypePills, defaultSelectedId: defaultRateTypePillId } = useMemo(
    () => resolveRateTypePills(pkg.rateCards, rateTypes, defaultRateTypeId),
    [pkg.rateCards, rateTypes, defaultRateTypeId],
  )
  const effectiveSelectedRateTypeId =
    selectedRateTypeId && rateTypePills.some((pill) => pill.id === selectedRateTypeId)
      ? selectedRateTypeId
      : defaultRateTypePillId

  const effectiveSelectedRouteId =
    selectedRouteId && pkg.routes.some((route) => route.id === selectedRouteId)
      ? selectedRouteId
      : pkg.routes[0]?.id ?? null

  if (pkg.routes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {`No ${vocabulary.routePlural.toLowerCase()} have been configured for this supplier yet.`}
      </div>
    )
  }

  const routeColumns = effectiveSelectedRouteId
    ? pkg.routes.filter((route) => route.id === effectiveSelectedRouteId)
    : pkg.routes
  const visibleRateCards = pkg.rateCards.filter((rateCard) => {
    if (effectiveSelectedRouteId && rateCard.routeId !== effectiveSelectedRouteId) {
      return false
    }
    if (
      effectiveSelectedRateTypeId &&
      !rateCardMatchesPill(rateCard, effectiveSelectedRateTypeId, rateTypes)
    ) {
      return false
    }
    return true
  })
  const periodGroups = groupRateCardsByPeriod(visibleRateCards)

  return (
    <div className="space-y-4">
      {rateTypePills.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rate type
          </p>
          <div className="flex flex-wrap gap-2">
            {rateTypePills.map((pill) => {
              const isSelected = effectiveSelectedRateTypeId === pill.id

              return (
                <Button
                  key={pill.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedRateTypeId(pill.id)}
                >
                  {pill.name}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      {pkg.routes.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {vocabulary.routePlural}
          </p>
          <div className="flex flex-wrap gap-2">
            {pkg.routes.map((route) => {
              const routeLabel = getRouteLabel(route, locationsById, vocabulary)
              const isSelected = effectiveSelectedRouteId === route.id

              return (
                <Button
                  key={route.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedRouteId(route.id)}
                >
                  {routeLabel}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      {periodGroups.length === 0 || suiteTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No rates have been configured for this supplier yet.
        </div>
      ) : (
        periodGroups.map((period) => {
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
        })
      )}
    </div>
  )
}

interface RateCardMatrixEditorProps {
  routes: EditableRoute[]
  rateCards: EditableRateCard[]
  suiteTypes: EditableSuiteType[]
  rateTypes: RateType[]
  defaultRateTypeId: string | null
  adjustments: SupplierRateAdjustment[]
  packageIndex: number
  locationsById: Record<string, Location>
  vocabulary: SupplierVocabulary
  isTransport: boolean
  supplierKind: SupplierKind
  trainChildPriceRatio: number
  ageBuckets: AgeBuckets
  onAddRate: (rateTypeId: string) => void
  onApplyMarkdown: (
    packageIndex: number,
    routeId: string,
    periodKey: string,
    rateTypeId: string,
    discountPct: number,
  ) => void
  onAddPeriod: (packageIndex: number, routeId: string, rateTypeId: string) => void
  onRemovePeriod: (packageIndex: number, routeId: string, periodKey: string, rateTypeId: string) => void
  onUpdatePeriodField: (
    packageIndex: number,
    routeId: string,
    periodKey: string,
    key: "validFrom" | "validTo" | "currency",
    value: string | null,
    rateTypeId: string,
  ) => void
  onUpdateCellPrice: (
    packageIndex: number,
    rateCardId: string,
    value: number,
  ) => void
  onUpdateCellField: (
    packageIndex: number,
    rateCardId: string,
    field: "childPrice" | "infantPrice",
    value: number | null,
  ) => void
  onToggleCell: (
    packageIndex: number,
    periodKey: string,
    suiteTypeId: string,
    routeId: string,
    enabled: boolean,
    rateTypeId: string,
  ) => void
  periodFieldErrors: Set<string>
}

interface RateCardPricingCellProps {
  match: EditableRateCard
  packageIndex: number
  isTransport: boolean
  supplierKind: SupplierKind
  trainChildPriceRatio: number
  ageBuckets: AgeBuckets
  onUpdateCellPrice: (
    packageIndex: number,
    rateCardId: string,
    value: number,
  ) => void
  onUpdateCellField: (
    packageIndex: number,
    rateCardId: string,
    field: "childPrice" | "infantPrice",
    value: number | null,
  ) => void
}

function RateCardPricingCell({
  match,
  packageIndex,
  isTransport,
  supplierKind,
  trainChildPriceRatio,
  ageBuckets,
  onUpdateCellPrice,
  onUpdateCellField,
}: RateCardPricingCellProps) {
  const lastCommittedAdultRef = useRef<number>(match.pricePerPerson)
  const [pendingChildSuggestion, setPendingChildSuggestion] = useState<number | null>(null)

  const handleAdultBlur = useCallback(() => {
    const adult = match.pricePerPerson
    if (adult === lastCommittedAdultRef.current) return

    lastCommittedAdultRef.current = adult

    if (
      shouldAutoFillChild({
        kind: supplierKind,
        currentChild: match.childPrice,
        newAdult: adult,
      })
    ) {
      onUpdateCellField(
        packageIndex,
        match.id,
        "childPrice",
        computeChildPrice(adult, trainChildPriceRatio),
      )
      setPendingChildSuggestion(null)
      return
    }

    if (
      shouldPromptChildUpdate({
        kind: supplierKind,
        currentChild: match.childPrice,
        newAdult: adult,
        ratio: trainChildPriceRatio,
      })
    ) {
      setPendingChildSuggestion(computeChildPrice(adult, trainChildPriceRatio))
    } else {
      setPendingChildSuggestion(null)
    }
  }, [
    match.pricePerPerson,
    match.childPrice,
    match.id,
    packageIndex,
    supplierKind,
    trainChildPriceRatio,
    onUpdateCellField,
  ])

  const acceptSuggestion = useCallback(() => {
    if (pendingChildSuggestion === null) return
    onUpdateCellField(packageIndex, match.id, "childPrice", pendingChildSuggestion)
    setPendingChildSuggestion(null)
  }, [pendingChildSuggestion, packageIndex, match.id, onUpdateCellField])

  const dismissSuggestion = useCallback(() => {
    setPendingChildSuggestion(null)
  }, [])

  const formattedSuggestion = useMemo(() => {
    if (pendingChildSuggestion === null) return ""
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: match.currency || "ZAR",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(pendingChildSuggestion)
  }, [pendingChildSuggestion, match.currency])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="flex w-16 shrink-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {isTransport ? "Flat" : "Adult"}
          {!isTransport ? <AgeRangeChip kind="adult" buckets={ageBuckets} /> : null}
        </span>
        <NumericInput
          min="0"
          step="0.01"
          value={match.pricePerPerson}
          onValueChange={(value) =>
            onUpdateCellPrice(packageIndex, match.id, value ?? 0)
          }
          onBlur={handleAdultBlur}
        />
      </div>
      {!isTransport ? (
        <>
          <div className="flex items-center gap-1">
            <span className="flex w-16 shrink-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Child
              <AgeRangeChip kind="child" buckets={ageBuckets} />
            </span>
            <NumericInput
              min="0"
              step="0.01"
              nullable
              nullDisplayValue="0"
              value={match.childPrice}
              onValueChange={(value) =>
                onUpdateCellField(packageIndex, match.id, "childPrice", value)
              }
            />
          </div>
          {pendingChildSuggestion !== null ? (
            <div className="flex items-center gap-2 rounded-md bg-secondary/40 px-2 py-1 text-xs">
              <span className="text-muted-foreground">
                Update Child to {formattedSuggestion}?
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={acceptSuggestion}
              >
                Yes
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={dismissSuggestion}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
          <div className="flex items-center gap-1">
            <span className="flex w-16 shrink-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Infant
              <AgeRangeChip kind="infant" buckets={ageBuckets} />
            </span>
            <NumericInput
              min="0"
              step="0.01"
              nullable
              nullDisplayValue="0"
              value={match.infantPrice}
              onValueChange={(value) =>
                onUpdateCellField(packageIndex, match.id, "infantPrice", value)
              }
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

const RateCardMatrixEditor = memo(function RateCardMatrixEditor({
  routes,
  rateCards,
  suiteTypes,
  rateTypes,
  defaultRateTypeId,
  adjustments,
  packageIndex,
  locationsById,
  vocabulary,
  isTransport,
  supplierKind,
  trainChildPriceRatio,
  ageBuckets,
  onAddRate,
  onApplyMarkdown,
  onAddPeriod,
  onRemovePeriod,
  onUpdatePeriodField,
  onUpdateCellPrice,
  onUpdateCellField,
  onToggleCell,
  periodFieldErrors,
}: RateCardMatrixEditorProps) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(routes[0]?.id ?? null)
  const activeRateTypes = useMemo(() => rateTypes.filter((rt) => !rt.archivedAt), [rateTypes])
  const effectiveDefaultRateTypeId =
    (defaultRateTypeId && activeRateTypes.some((rt) => rt.id === defaultRateTypeId)
      ? defaultRateTypeId
      : null) ??
    activeRateTypes.find((rt) => rt.isDefault)?.id ??
    activeRateTypes[0]?.id ??
    null
  // Only the default rate plus the rates flagged as applicable to this supplier
  // are shown as tabs (in declared order, default first).
  const adjustmentIds = useMemo(() => new Set(adjustments.map((a) => a.rateTypeId)), [adjustments])
  const visibleRateTypes = useMemo(
    () =>
      activeRateTypes.filter(
        (rt) => rt.id === effectiveDefaultRateTypeId || adjustmentIds.has(rt.id),
      ),
    [activeRateTypes, effectiveDefaultRateTypeId, adjustmentIds],
  )
  const addableRateTypes = useMemo(
    () =>
      activeRateTypes.filter(
        (rt) => rt.id !== effectiveDefaultRateTypeId && !adjustmentIds.has(rt.id),
      ),
    [activeRateTypes, effectiveDefaultRateTypeId, adjustmentIds],
  )
  const [selectedRateTypeId, setSelectedRateTypeId] = useState<string | null>(
    effectiveDefaultRateTypeId,
  )
  const selectedDiscountPct =
    selectedRateTypeId && selectedRateTypeId !== effectiveDefaultRateTypeId
      ? adjustments.find((a) => a.rateTypeId === selectedRateTypeId)?.discountPct ?? null
      : null
  const periodGroups = useMemo(
    () =>
      groupEditableRateCardsByPeriod(
        selectedRouteId && selectedRateTypeId
          ? rateCards.filter(
              (rateCard) =>
                rateCard.routeId === selectedRouteId && rateCard.rateTypeId === selectedRateTypeId,
            )
          : [],
      ),
    [rateCards, selectedRouteId, selectedRateTypeId],
  )

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

  useEffect(() => {
    if (visibleRateTypes.length === 0) {
      if (selectedRateTypeId !== null) setSelectedRateTypeId(null)
      return
    }
    if (!selectedRateTypeId || !visibleRateTypes.some((rt) => rt.id === selectedRateTypeId)) {
      setSelectedRateTypeId(effectiveDefaultRateTypeId)
    }
  }, [visibleRateTypes, selectedRateTypeId, effectiveDefaultRateTypeId])

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
        <p className="text-sm font-semibold text-foreground">Rates</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (selectedRouteId && selectedRateTypeId) {
              onAddPeriod(packageIndex, selectedRouteId, selectedRateTypeId)
            }
          }}
          disabled={!selectedRouteId || !selectedRateTypeId}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add pricing period
        </Button>
      </div>

      {visibleRateTypes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rate Types
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {visibleRateTypes.map((rt) => {
              const isSelected = selectedRateTypeId === rt.id
              const isDefault = rt.id === effectiveDefaultRateTypeId
              return (
                <Button
                  key={rt.id}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => setSelectedRateTypeId(rt.id)}
                  title={rt.code}
                >
                  {rt.name}
                  {isDefault ? (
                    <span className="ml-1 text-[10px] uppercase opacity-70">default</span>
                  ) : null}
                </Button>
              )
            })}
            {addableRateTypes.length > 0 ? (
              <Select value="" onValueChange={(value) => onAddRate(value)}>
                <SelectTrigger className="h-7 w-auto gap-1 rounded-full px-3 text-xs" aria-label="Add a rate">
                  <Plus className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Add rate" />
                </SelectTrigger>
                <SelectContent>
                  {addableRateTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button asChild type="button" size="sm" variant="ghost" className="h-7 text-xs">
              <Link href="/app/settings/rate-types">+ Create new rate</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No rate types configured.{" "}
          <Link href="/app/settings/rate-types" className="underline">Set up rate types</Link>
          {" "}before adding pricing periods.
        </div>
      )}

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
          const routeColumns =
            routes.length === 0
              ? []
              : selectedRouteId
                ? routes.filter((route) => route.id === selectedRouteId)
                : routes

          return (
            <div key={period.key} className="rounded-lg border overflow-hidden">
              <div className="grid gap-3 border-b bg-secondary/30 px-4 py-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Valid from</Label>
                  <DatePicker
                    value={period.validFrom}
                    fromYear={getMinSelectableRateYear()}
                    buttonClassName={
                      periodFieldErrors.has(`${period.key}|validFrom`)
                        ? "border-destructive focus-visible:ring-destructive/35"
                        : undefined
                    }
                    onChange={(value) =>
                      onUpdatePeriodField(
                        packageIndex,
                        selectedRouteId ?? "",
                        period.key,
                        "validFrom",
                        value ?? "",
                        selectedRateTypeId ?? "",
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid to</Label>
                  <div className="relative">
                    {isOngoingRateCard(period.validTo) ? (
                      <Badge
                        variant="outline"
                        className="absolute top-0 right-1 z-10 -translate-y-1/2 bg-background px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide"
                      >
                        ONGOING
                      </Badge>
                    ) : null}
                    <DatePicker
                      value={period.validTo ?? ""}
                      fromYear={getMinSelectableRateYear()}
                      buttonClassName={
                        periodFieldErrors.has(`${period.key}|validTo`)
                          ? "border-destructive focus-visible:ring-destructive/35"
                          : undefined
                      }
                      onChange={(value) =>
                        onUpdatePeriodField(
                          packageIndex,
                          selectedRouteId ?? "",
                          period.key,
                          "validTo",
                          value || null,
                          selectedRateTypeId ?? "",
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
                        selectedRouteId ?? "",
                        period.key,
                        "currency",
                        value.toUpperCase(),
                        selectedRateTypeId ?? "",
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
                    onClick={() => onRemovePeriod(packageIndex, selectedRouteId ?? "", period.key, selectedRateTypeId ?? "")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {selectedRateTypeId && selectedRateTypeId !== effectiveDefaultRateTypeId ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/10 px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    {selectedDiscountPct === null
                      ? "Set this rate's markdown in Applicable Rates above to calculate prices from the default rate."
                      : `Calculate from default rate: -${selectedDiscountPct.toFixed(2)}% of the default price.`}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedDiscountPct === null}
                    onClick={() =>
                      onApplyMarkdown(
                        packageIndex,
                        selectedRouteId ?? "",
                        period.key,
                        selectedRateTypeId,
                        selectedDiscountPct ?? 0,
                      )
                    }
                  >
                    Apply markdown
                  </Button>
                </div>
              ) : null}

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
                          const routeId = route.id
                          const match = period.items.find(
                            (item) =>
                              item.suiteTypeId === suiteType.id && item.routeId === routeId,
                          )

                          return (
                            <td key={`${suiteType.id}-${routeId}`} className="px-4 py-3">
                              {match ? (
                                <div className="flex flex-col gap-1.5">
                                  <RateCardPricingCell
                                    match={match}
                                    packageIndex={packageIndex}
                                    isTransport={isTransport}
                                    supplierKind={supplierKind}
                                    trainChildPriceRatio={trainChildPriceRatio}
                                    ageBuckets={ageBuckets}
                                    onUpdateCellPrice={onUpdateCellPrice}
                                    onUpdateCellField={onUpdateCellField}
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
                                        selectedRateTypeId ?? "",
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
                                      selectedRateTypeId ?? "",
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
          No rates added yet. Add a pricing period to begin.
        </div>
      )}
    </div>
  )
})


interface SuiteTypeEditorRowProps {
  suiteType: EditableSuiteType
  suiteTypeIndex: number
  vocabulary: SupplierVocabulary
  bedroomTypes: EditableVocabularyValue[]
  bedroomLayouts: EditableVocabularyValue[]
  bathroomTypes: EditableVocabularyValue[]
  showVariants: boolean
  dragHandle?: React.ReactNode
  onUpdateSuiteType: (
    suiteTypeIndex: number,
    key: keyof EditableSuiteType,
    value: string | boolean | number | null,
  ) => void
  onUpdateSuiteTypeVariantIds?: (
    suiteTypeIndex: number,
    key: "bedroomTypeIds" | "bedroomLayoutIds" | "bathroomTypeIds",
    ids: string[],
  ) => void
  onRemoveSuiteType: (suiteTypeIndex: number) => void
}

const SuiteTypeEditorRow = memo(function SuiteTypeEditorRow({
  suiteType,
  suiteTypeIndex,
  vocabulary,
  bedroomTypes,
  bedroomLayouts,
  bathroomTypes,
  showVariants,
  dragHandle,
  onUpdateSuiteType,
  onUpdateSuiteTypeVariantIds,
  onRemoveSuiteType,
}: SuiteTypeEditorRowProps) {
  const isTransport = vocabulary.suiteType === "Vehicle Type"

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div
        className={
          isTransport
            ? "grid gap-4 md:grid-cols-2 xl:grid-cols-[auto_1fr_10rem_10rem_1fr_auto_auto]"
            : "grid gap-4 md:grid-cols-[auto_1fr_auto_auto]"
        }
      >
        {dragHandle ? <div className="flex items-center pt-6">{dragHandle}</div> : null}
      <div className="space-y-1.5">
        <Label>{`${vocabulary.suiteType} name`}</Label>
        <BufferedInput
          value={suiteType.name}
          onValueChange={(value) => onUpdateSuiteType(suiteTypeIndex, "name", value)}
        />
      </div>
      {isTransport ? (
        <>
          <div className="space-y-2">
            <Label>Passengers</Label>
            <NumericInput
              min="0"
              step="1"
              nullable
              value={suiteType.passengerCapacity}
              onValueChange={(value) =>
                onUpdateSuiteType(suiteTypeIndex, "passengerCapacity", value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Luggage</Label>
            <NumericInput
              min="0"
              step="1"
              nullable
              value={suiteType.luggageCapacity}
              onValueChange={(value) =>
                onUpdateSuiteType(suiteTypeIndex, "luggageCapacity", value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <BufferedInput
              value={suiteType.description ?? ""}
              onValueChange={(value) => onUpdateSuiteType(suiteTypeIndex, "description", value)}
            />
          </div>
        </>
      ) : null}
      <div className="space-y-1.5">
        <Label>Active</Label>
        <div className="flex h-9 items-center">
          <Switch
            checked={suiteType.active}
            onCheckedChange={(checked) => onUpdateSuiteType(suiteTypeIndex, "active", checked)}
          />
        </div>
      </div>
      <div className="flex items-end">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={REMOVE_ICON_BUTTON_CLASS}
          aria-label={`Remove ${vocabulary.suiteType.toLowerCase()}`}
          onClick={() => onRemoveSuiteType(suiteTypeIndex)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      </div>
      {showVariants && onUpdateSuiteTypeVariantIds ? (
        <div className="grid gap-3 md:grid-cols-3">
          <VariantChipPicker
            label="Bedroom Types"
            available={bedroomTypes.map((value) => ({ id: value.id, name: value.name }))}
            selectedIds={suiteType.bedroomTypeIds}
            onChange={(ids) =>
              onUpdateSuiteTypeVariantIds(suiteTypeIndex, "bedroomTypeIds", ids)
            }
          />
          <VariantChipPicker
            label="Bedroom Layouts"
            available={bedroomLayouts.map((value) => ({ id: value.id, name: value.name }))}
            selectedIds={suiteType.bedroomLayoutIds}
            onChange={(ids) =>
              onUpdateSuiteTypeVariantIds(suiteTypeIndex, "bedroomLayoutIds", ids)
            }
          />
          <VariantChipPicker
            label="Bathroom Types"
            available={bathroomTypes.map((value) => ({ id: value.id, name: value.name }))}
            selectedIds={suiteType.bathroomTypeIds}
            onChange={(ids) =>
              onUpdateSuiteTypeVariantIds(suiteTypeIndex, "bathroomTypeIds", ids)
            }
          />
        </div>
      ) : null}
    </div>
  )
})

interface PassengerAgeBandsSectionProps {
  isEditing: boolean
  infantMaxAge: number | null
  childMaxAge: number | null
  onChangeInfantMaxAge: (value: number | null) => void
  onChangeChildMaxAge: (value: number | null) => void
}

function PassengerAgeBandsSection({
  isEditing,
  infantMaxAge,
  childMaxAge,
  onChangeInfantMaxAge,
  onChangeChildMaxAge,
}: PassengerAgeBandsSectionProps) {
  const usingInfantDefault = infantMaxAge === null
  const usingChildDefault = childMaxAge === null
  const effectiveInfant = infantMaxAge ?? DEFAULT_AGE_BUCKETS.infantMax
  const effectiveChild = childMaxAge ?? DEFAULT_AGE_BUCKETS.childMax
  const usingAnyDefault = usingInfantDefault || usingChildDefault
  const ranges = formatBucketRange({ infantMax: effectiveInfant, childMax: effectiveChild })

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">Passenger Age Bands</p>
          <p className="text-xs text-muted-foreground">
            Override the defaults set in Settings. Leave blank to inherit.
          </p>
        </div>
        {isEditing && !usingAnyDefault ? (
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => {
              onChangeInfantMaxAge(null)
              onChangeChildMaxAge(null)
            }}
          >
            Reset to default
          </button>
        ) : null}
      </div>
      {isEditing ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Infant max age</Label>
            <NumericInput
              min="0"
              max="17"
              step="1"
              nullable
              value={infantMaxAge}
              placeholder="default"
              onValueChange={(value) => onChangeInfantMaxAge(value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Child max age</Label>
            <NumericInput
              min="0"
              max="17"
              step="1"
              nullable
              value={childMaxAge}
              placeholder="default"
              onValueChange={(value) => onChangeChildMaxAge(value)}
            />
          </div>
        </div>
      ) : null}
      <div className="text-xs text-muted-foreground">
        Resolves to:{" "}
        <span className="tabular-nums">
          Infant {ranges.infant}
          {usingInfantDefault ? " (default)" : ""}
        </span>{" "}
        ·{" "}
        <span className="tabular-nums">
          Child {ranges.child}
          {usingChildDefault ? " (default)" : ""}
        </span>{" "}
        · <span className="tabular-nums">Adult {ranges.adult}</span>
      </div>
    </div>
  )
}

interface RouteEditorRowProps {
  route: EditableRoute
  routeIndex: number
  packageIndex: number
  kind: SupplierKind
  vocabulary: SupplierVocabulary
  locations: Location[]
  onUpdateRoute: (
    packageIndex: number,
    routeIndex: number,
    key: keyof EditableRoute,
    value: EditableRoute[keyof EditableRoute],
  ) => void
  onRemoveRoute: (packageIndex: number, routeIndex: number) => void
}

const RouteEditorRow = memo(function RouteEditorRow({
  route,
  routeIndex,
  packageIndex,
  kind,
  vocabulary,
  locations,
  onUpdateRoute,
  onRemoveRoute,
}: RouteEditorRowProps) {
  const isTransport = vocabulary.suiteType === "Vehicle Type"
  const isRental = vocabulary.priceLabel === "per day"
  const autoDeriveName = vocabulary.routeNameAutoDerived
  const derivedRouteName = useMemo(() => {
    if (!autoDeriveName) return null
    const originName = locations.find((l) => l.id === route.originLocationId)?.name
    const destinationName = locations.find((l) => l.id === route.destinationLocationId)?.name
    if (!originName || !destinationName) return null
    return buildRouteName(originName, destinationName, route.directionMode)
  }, [autoDeriveName, locations, route.originLocationId, route.destinationLocationId, route.directionMode])

  useEffect(() => {
    if (!autoDeriveName || derivedRouteName === null) return
    if (route.name.trim() !== "") return
    onUpdateRoute(packageIndex, routeIndex, "name", derivedRouteName)
  }, [autoDeriveName, derivedRouteName, route.name, onUpdateRoute, packageIndex, routeIndex])

  const rentalDetails =
    route.vehicleRentalDetails ?? {
      includedKmPerDay: null,
      extraKmPrice: null,
      securityDeposit: null,
      oneWayFee: null,
    }
  const updateRentalDetails = (
    key: keyof typeof rentalDetails,
    value: number | null,
  ) => {
    onUpdateRoute(packageIndex, routeIndex, "vehicleRentalDetails", {
      ...rentalDetails,
      [key]: value,
    })
  }

  return (
    <div
      className={`grid min-w-0 items-end gap-3 overflow-hidden rounded-lg border p-3 ${
        isTransport
          ? "md:grid-cols-2 xl:grid-cols-5"
          : vocabulary.routeHasLocations
            ? vocabulary.routeHasDuration
              ? "md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto_auto]"
              : "md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"
            : "md:grid-cols-[1.5fr_1fr_auto]"
      }`}
    >
      <div className="space-y-1.5">
        <Label>{`${vocabulary.route} name`}</Label>
        {kind === "tour_operator" ? (
          // Itinerary text can run long — wrap down instead of scrolling sideways.
          <BufferedTextarea
            rows={2}
            className="resize-none"
            value={route.name}
            onValueChange={(value) => onUpdateRoute(packageIndex, routeIndex, "name", value)}
          />
        ) : (
          <BufferedInput
            value={route.name}
            onValueChange={(value) => onUpdateRoute(packageIndex, routeIndex, "name", value)}
          />
        )}
      </div>
      {isTransport ? (
        <>
          <div className="min-w-0 space-y-2">
            <Label>{vocabulary.originLabel}</Label>
            <BufferedInput
              value={route.pickupPoint ?? ""}
              onValueChange={(value) => onUpdateRoute(packageIndex, routeIndex, "pickupPoint", value)}
              placeholder=""
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>{vocabulary.destinationLabel}</Label>
            <BufferedInput
              value={route.dropoffPoint ?? ""}
              onValueChange={(value) => onUpdateRoute(packageIndex, routeIndex, "dropoffPoint", value)}
              placeholder=""
            />
          </div>
          {isRental ? (
            <>
              <div className="min-w-0 space-y-2">
                <Label>Included km/day</Label>
                <NumericInput
                  min="0"
                  step="1"
                  nullable
                  value={rentalDetails.includedKmPerDay}
                  onValueChange={(value) => updateRentalDetails("includedKmPerDay", value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Extra km price</Label>
                <NumericInput
                  min="0"
                  step="0.01"
                  nullable
                  value={rentalDetails.extraKmPrice}
                  onValueChange={(value) => updateRentalDetails("extraKmPrice", value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Security deposit</Label>
                <NumericInput
                  min="0"
                  step="0.01"
                  nullable
                  value={rentalDetails.securityDeposit}
                  onValueChange={(value) => updateRentalDetails("securityDeposit", value)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>One-way fee</Label>
                <NumericInput
                  min="0"
                  step="0.01"
                  nullable
                  value={rentalDetails.oneWayFee}
                  onValueChange={(value) => updateRentalDetails("oneWayFee", value)}
                />
              </div>
            </>
          ) : null}
        </>
      ) : vocabulary.routeHasLocations ? (
        <>
          <div className="min-w-0 space-y-1.5">
            <Label>{vocabulary.originLabel}</Label>
            <Select
              value={route.originLocationId || ""}
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
          <div className="min-w-0 space-y-1.5">
            <Label>{vocabulary.destinationLabel}</Label>
            <Select
              value={route.destinationLocationId || ""}
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
      {vocabulary.routeHasDirection ? (
        <div className="min-w-0 space-y-1.5">
          <Label>Direction</Label>
          <Select
            value={route.directionMode}
            onValueChange={(value) =>
              onUpdateRoute(packageIndex, routeIndex, "directionMode", value as RouteDirectionMode)
            }
          >
            <SelectTrigger className="max-w-full">
              <SelectValue placeholder="Select direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_way">One way</SelectItem>
              <SelectItem value="round_trip">Two way</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {vocabulary.routeHasDuration ? (
        <div className="min-w-0 space-y-1.5">
          <Label className="whitespace-nowrap">Duration (days)</Label>
          <NumericInput
            min="1"
            step="1"
            nullable
            className="w-16 text-center"
            value={route.durationDays}
            onValueChange={(value) => onUpdateRoute(packageIndex, routeIndex, "durationDays", value)}
          />
        </div>
      ) : null}
      <div className="flex h-9 items-center gap-3 self-end">
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
  const { data: trainRatioData } = useTrainChildPriceRatio()
  const trainChildPriceRatio = trainRatioData?.ratio ?? DEFAULT_TRAIN_CHILD_PRICE_RATIO
  const { data: ageBandsData } = useAgeBandsSettings()
  const globalAgeDefaults: AgeBuckets = ageBandsData
    ? { infantMax: ageBandsData.infantMaxAge, childMax: ageBandsData.childMaxAge }
    : DEFAULT_AGE_BUCKETS
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
  const [pendingLocalDraft, setPendingLocalDraft] = useState<SupplierFormState | null>(null)
  const baselineSnapshotRef = useRef<string | null>(null)
  const hydratedSupplierIdentityRef = useRef<string | null>(null)
  const expectedUpdatedAtRef = useRef<string | null>(null)
  const lastOverlapWarningRef = useRef<string | null>(null)
  const lastInvertedDateWarningRef = useRef<string | null>(null)
  const patchWriteLockRef = useRef(new SupplierPatchWriteLock())
  const overlapFieldErrorsCacheRef = useRef<{
    signature: string
    errors: Map<number, Set<string>>
  } | null>(null)
  const formRef = useRef(form)

  const hasLoadError = Boolean(error)
  const supplier = data && !("error" in data) ? data : null
  const isDraftSupplier = supplier?.status === "draft"
  const isTemporarySupplier = supplier?.status === "temporary"
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
        overlapFieldErrorsCacheRef.current = null
      }
      expectedUpdatedAtRef.current = supplier.updatedAt
      hydratedSupplierIdentityRef.current = supplierIdentity

      if (canEdit && (supplier.status === "draft" || supplier.status === "temporary")) {
        setIsEditing(true)
      }

      if (supplier.status !== "draft" && supplier.status !== "temporary") {
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

  /**
   * The baseline every rate adjustment on this supplier is measured against. While editing this
   * follows the unsaved override so the "% off X" labels and matrix tabs update as soon as the
   * default is changed, rather than only after a save round-trip.
   */
  const hasForm = form !== null
  const formDefaultRateTypeOverrideId = form?.defaultRateTypeOverrideId ?? null
  const effectiveDefaultRateTypeId = useMemo(() => {
    const active = (supplier?.rateTypes ?? []).filter((rt) => !rt.archivedAt)
    const candidates = [
      hasForm ? formDefaultRateTypeOverrideId : supplier?.defaultRateTypeOverrideId ?? null,
      supplier?.inheritedDefaultRateTypeId ?? null,
      active.find((rt) => rt.isDefault)?.id ?? null,
      active[0]?.id ?? null,
    ]
    return candidates.find((id) => id && active.some((rt) => rt.id === id)) ?? null
  }, [
    hasForm,
    formDefaultRateTypeOverrideId,
    supplier?.rateTypes,
    supplier?.defaultRateTypeOverrideId,
    supplier?.inheritedDefaultRateTypeId,
  ])

  const updateSupplierKind = (kind: SupplierKind) => {
    setForm((current) =>
      current
        ? {
            ...current,
            kind,
            locationId: kind === "train_operator" ? null : current.locationId,
            packages: current.packages.map((pkg) => ({
              ...pkg,
              routes: pkg.routes.map((route) => ({
                ...route,
                originLocationId: isTransportSupplier(kind) ? null : route.originLocationId,
                destinationLocationId: isTransportSupplier(kind) ? null : route.destinationLocationId,
                vehicleRentalDetails:
                  kind === "vehicle_rental"
                    ? route.vehicleRentalDetails ?? {
                        includedKmPerDay: null,
                        extraKmPrice: null,
                        securityDeposit: null,
                        oneWayFee: null,
                      }
                    : null,
              })),
            })),
          }
        : current,
    )
  }

  const updateSuiteTypes = useCallback(
    (updater: (suiteTypes: EditableSuiteType[]) => EditableSuiteType[]) => {
      setForm((current) =>
        current ? { ...current, suiteTypes: updater(current.suiteTypes) } : current,
      )
    },
    [],
  )

  const addSuiteType = useCallback(() => {
    updateSuiteTypes((suiteTypes) => [
      ...suiteTypes,
      createEmptySuiteType(suiteTypes.length),
    ])
  }, [updateSuiteTypes])

  const reorderSuiteTypes = useCallback(
    (orderedIds: string[]) => {
      updateSuiteTypes((suiteTypes) => {
        const byId = new Map(suiteTypes.map((suiteType) => [suiteType.id, suiteType]))
        return orderedIds.flatMap((id, index) => {
          const suiteType = byId.get(id)
          return suiteType ? [{ ...suiteType, sortOrder: index }] : []
        })
      })
    },
    [updateSuiteTypes],
  )

  const updateSuiteTypeVariantIds = useCallback(
    (
      suiteTypeIndex: number,
      key: "bedroomTypeIds" | "bedroomLayoutIds" | "bathroomTypeIds",
      ids: string[],
    ) => {
      updateSuiteTypes((suiteTypes) =>
        suiteTypes.map((suiteType, index) =>
          index === suiteTypeIndex ? { ...suiteType, [key]: ids } : suiteType,
        ),
      )
    },
    [updateSuiteTypes],
  )

  const setBedroomTypes = useCallback((next: EditableVocabularyValue[]) => {
    setForm((current) => (current ? { ...current, bedroomTypes: next } : current))
  }, [])
  const setBedroomLayouts = useCallback((next: EditableVocabularyValue[]) => {
    setForm((current) => (current ? { ...current, bedroomLayouts: next } : current))
  }, [])
  const setBathroomTypes = useCallback((next: EditableVocabularyValue[]) => {
    setForm((current) => (current ? { ...current, bathroomTypes: next } : current))
  }, [])

  const updateSuiteType = useCallback(
    (
      suiteTypeIndex: number,
      key: keyof EditableSuiteType,
      value: string | boolean | number | null,
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
      setForm((current) =>
        current ? { ...current, packages: updater(current.packages) } : current,
      )
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
      const currentForm = formRef.current
      if (!currentForm) return

      updatePackage(packageIndex, (pkg) => ({
        ...pkg,
        routes: [...pkg.routes, createEmptyRoute(currentForm.kind)],
      }))
    },
    [locations, updatePackage],
  )

  const updateRoute = useCallback(
    (
      packageIndex: number,
      routeIndex: number,
      key: keyof EditableRoute,
      value: EditableRoute[keyof EditableRoute],
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

      const route = pkg.routes[routeIndex]
      if (!route) return

      const routeId = route.id
      const linkedRateCardCount = pkg.rateCards.filter((rateCard) => rateCard.routeId === routeId).length
      if (linkedRateCardCount > 0) {
        const vocabulary = getSupplierVocabulary(currentForm.kind)
        const routeName = route.name.trim() || "Unnamed route"
        const shouldDeleteRoute = window.confirm(
          buildRouteDeletionConfirmationMessage({
            routeName,
            linkedRateCardCount,
            vocabulary,
          }),
        )
        if (!shouldDeleteRoute) return
      }

      const nextPackage = {
        ...pkg,
        routes: pkg.routes.filter((_route, index) => index !== routeIndex),
        rateCards: pkg.rateCards.filter((rateCard) => rateCard.routeId !== routeId),
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
    (packageIndex: number, routeId: string, rateTypeId: string) => {
      updatePackage(packageIndex, (pkg) => {
        const currentForm = formRef.current
        if (!currentForm) return pkg

        const vocabulary = getSupplierVocabulary(currentForm.kind)
        const availableSuiteTypes = currentForm.suiteTypes
        if (availableSuiteTypes.length === 0) {
          toast.error(
            `Add at least one ${vocabulary.suiteType.toLowerCase()} before creating a pricing period.`,
            { id: "rate-card-no-suite-type" },
          )
          return pkg
        }

        const currency = pkg.currency.trim().toUpperCase() || "ZAR"
        const route = pkg.routes.find((candidate) => candidate.id === routeId)
        if (!route) {
          toast.error(
            `Add at least one ${vocabulary.route.toLowerCase()} before creating a pricing period.`,
            { id: "rate-card-no-route" },
          )
          return pkg
        }
        const { nextValidFrom, previousPeriodKey } = getNextRateCardPeriodStart({
          ...pkg,
          rateCards: pkg.rateCards.filter(
            (rateCard) => rateCard.routeId === route.id && rateCard.rateTypeId === rateTypeId,
          ),
        })
        const linkedPreviousValidTo = addIsoDays(nextValidFrom, -1)
        const baseRateCards =
          previousPeriodKey && linkedPreviousValidTo
            ? updateRateCardPeriodDateValues(pkg.rateCards, previousPeriodKey, {
                validTo: linkedPreviousValidTo,
              }, route.id, rateTypeId)
            : pkg.rateCards

        const newRateCards = availableSuiteTypes.map((suiteType) => ({
            id: makeClientId(),
            routeId: route.id,
            suiteTypeId: suiteType.id,
            rateTypeId,
            pricePerPerson: 0,
            childPrice: null,
            infantPrice: null,
            currency,
            validFrom: nextValidFrom,
            validTo: null,
          }))

        const nextPackage = { ...pkg, rateCards: [...baseRateCards, ...newRateCards] }
        const conflict = findPackageRateCardConflicts(nextPackage, availableSuiteTypes)[0]
        if (conflict) {
          toast.error(
            "This pricing period duplicates an existing suite type/route/start-date combination. Choose a different start date.",
            { id: "rate-card-conflict" },
          )
          return pkg
        }

        warnForOverlapIfNeeded(nextPackage, availableSuiteTypes, vocabulary)
        return nextPackage
      })
    },
    [updatePackage, warnForOverlapIfNeeded],
  )

  const updateRateCardPeriodField = useCallback(
    (
      packageIndex: number,
      routeId: string,
      periodKey: string,
      key: "validFrom" | "validTo" | "currency",
      value: string | null,
      rateTypeId: string,
    ) => {
      updatePackage(packageIndex, (pkg) => {
        const currentForm = formRef.current
        if (!currentForm) return pkg

        let nextPeriodKey = periodKey
        let nextRateCards = pkg.rateCards.map((rateCard) => {
          if (
            rateCard.routeId !== routeId ||
            (rateTypeId && rateCard.rateTypeId !== rateTypeId) ||
            getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) !== periodKey
          ) {
            return rateCard
          }

          if (key === "currency") {
            const nextRateCard = {
              ...rateCard,
              currency:
                (value ?? "").trim().toUpperCase() || pkg.currency.trim().toUpperCase() || "ZAR",
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
          nextRateCards = applyBidirectionalPeriodDateLinking(
            nextRateCards.filter((rateCard) => rateCard.routeId === routeId && rateCard.rateTypeId === rateTypeId),
            nextPeriodKey,
            key,
          ).concat(nextRateCards.filter((rateCard) => rateCard.routeId !== routeId || rateCard.rateTypeId !== rateTypeId))
        }

        const nextPackage = { ...pkg, rateCards: nextRateCards }
        if (key === "validFrom" || key === "validTo") {
          const availableSuiteTypes = currentForm.suiteTypes
          const conflict = findPackageRateCardConflicts(nextPackage, availableSuiteTypes)[0]
          if (conflict) {
            toast.error(
              "That start date duplicates an existing suite type/route/start-date combination.",
              { id: "rate-card-date-conflict" },
            )
            return pkg
          }

          const vocabulary = getSupplierVocabulary(currentForm.kind)
          warnForInvertedDateRangeIfNeeded(nextPackage)
          warnForOverlapIfNeeded(nextPackage, availableSuiteTypes, vocabulary)
        }

        return nextPackage
      })
    },
    [updatePackage, warnForInvertedDateRangeIfNeeded, warnForOverlapIfNeeded],
  )

  const removeRateCardPeriod = useCallback(
    (packageIndex: number, routeId: string, periodKey: string, rateTypeId: string) => {
      updatePackage(packageIndex, (pkg) => ({
        ...pkg,
        rateCards: pkg.rateCards.filter((rateCard) => {
          const matchesRoute = rateCard.routeId === routeId
          const matchesType = !rateTypeId || rateCard.rateTypeId === rateTypeId
          const matchesPeriod =
            getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) === periodKey
          return !(matchesRoute && matchesType && matchesPeriod)
        }),
      }))
    },
    [updatePackage],
  )

  const updateRateCardPrice = useCallback(
    (packageIndex: number, rateCardId: string, value: number) => {
      updatePackage(packageIndex, (pkg) => ({
        ...pkg,
        rateCards: pkg.rateCards.map((rateCard) =>
          rateCard.id === rateCardId ? { ...rateCard, pricePerPerson: value } : rateCard,
        ),
      }))
    },
    [updatePackage],
  )

  const updateRateCardField = useCallback(
    (
      packageIndex: number,
      rateCardId: string,
      field: "childPrice" | "infantPrice",
      value: number | null,
    ) => {
      updatePackage(packageIndex, (pkg) => ({
        ...pkg,
        rateCards: pkg.rateCards.map((rateCard) =>
          rateCard.id === rateCardId ? { ...rateCard, [field]: value } : rateCard,
        ),
      }))
    },
    [updatePackage],
  )

  const toggleRateCardCell = useCallback(
    (
      packageIndex: number,
      periodKey: string,
      suiteTypeId: string,
      routeId: string,
      enabled: boolean,
      rateTypeId: string,
    ) => {
      updatePackage(packageIndex, (pkg) => {
        const period = groupEditableRateCardsByPeriod(
          pkg.rateCards.filter((rateCard) => !rateTypeId || rateCard.rateTypeId === rateTypeId),
        ).find((candidate) => candidate.key === periodKey)
        if (!period) return pkg

        const existingCard = period.items.find(
          (item) =>
            item.suiteTypeId === suiteTypeId &&
            item.routeId === routeId &&
            (!rateTypeId || item.rateTypeId === rateTypeId),
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
                rateTypeId,
                pricePerPerson: 0,
                childPrice: null,
                infantPrice: null,
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

  const addRateAdjustment = useCallback((rateTypeId: string) => {
    setForm((current) => {
      if (!current) return current
      if (current.rateAdjustments.some((adjustment) => adjustment.rateTypeId === rateTypeId)) {
        return current
      }
      return {
        ...current,
        rateAdjustments: [...current.rateAdjustments, { rateTypeId, discountPct: 0 }],
      }
    })
  }, [])

  const handleChangeDefaultRateType = useCallback(
    (nextDefaultRateTypeId: string) => {
      setForm((current) =>
        current
          ? {
              ...current,
              defaultRateTypeOverrideId: nextDefaultRateTypeId,
              rateAdjustments: rebaseRateAdjustments(
                current.rateAdjustments,
                effectiveDefaultRateTypeId,
                nextDefaultRateTypeId,
              ),
            }
          : current,
      )
    },
    [effectiveDefaultRateTypeId],
  )

  const handleApplyRateMarkdown = useCallback(
    (
      packageIndex: number,
      routeId: string,
      periodKey: string,
      rateTypeId: string,
      discountPct: number,
    ) => {
      if (!effectiveDefaultRateTypeId) {
        toast.error("No rate types configured — add one in Settings before applying markdown.", {
          id: "apply-markdown-no-type",
        })
        return
      }
      if (rateTypeId === effectiveDefaultRateTypeId) return

      updatePackage(packageIndex, (pkg) => {
        const targetCards = pkg.rateCards.filter(
          (rateCard) =>
            rateCard.routeId === routeId &&
            rateCard.rateTypeId === rateTypeId &&
            getRatePeriodKey(rateCard.validFrom, rateCard.validTo, rateCard.currency) === periodKey,
        )
        if (targetCards.length === 0) return pkg

        const baseCards = pkg.rateCards.filter(
          (rateCard) => rateCard.routeId === routeId && rateCard.rateTypeId === effectiveDefaultRateTypeId,
        )
        const targetIds = new Set(targetCards.map((card) => card.id))

        const baseCardsBySuite = new Map<string, EditableRateCard[]>()
        for (const card of baseCards) {
          const bucket = baseCardsBySuite.get(card.suiteTypeId) ?? []
          bucket.push(card)
          baseCardsBySuite.set(card.suiteTypeId, bucket)
        }

        const findBaseCard = (
          rateCard: EditableRateCard,
        ): { card: EditableRateCard; period: string | null } | undefined => {
          const suite = baseCardsBySuite.get(rateCard.suiteTypeId) ?? []
          const exact = suite.find(
            (candidate) =>
              candidate.validFrom <= rateCard.validFrom &&
              (candidate.validTo === null || candidate.validTo >= rateCard.validFrom),
          )
          if (exact) return { card: exact, period: null }
          const specialStart = toUtcDate(rateCard.validFrom)
          if (!specialStart || suite.length === 0) return undefined
          let nearest: EditableRateCard | undefined
          let minDist = Infinity
          for (const candidate of suite) {
            const candidateDate = toUtcDate(candidate.validFrom)
            if (!candidateDate) continue
            const dist = Math.abs(specialStart.getTime() - candidateDate.getTime())
            if (dist < minDist) {
              minDist = dist
              nearest = candidate
            }
          }
          return nearest
            ? {
                card: nearest,
                period: formatRateCardValidityRange(nearest.validFrom, nearest.validTo),
              }
            : undefined
        }

        let applied = 0
        const fallbackPeriods = new Set<string>()
        const nextRateCards = pkg.rateCards.map((rateCard) => {
          if (!targetIds.has(rateCard.id)) return rateCard
          const found = findBaseCard(rateCard)
          if (!found) return rateCard
          if (found.period) fallbackPeriods.add(found.period)
          applied += 1
          return {
            ...rateCard,
            pricePerPerson: applyRateMarkdown(found.card.pricePerPerson, discountPct),
            childPrice:
              found.card.childPrice === null ? null : applyRateMarkdown(found.card.childPrice, discountPct),
            infantPrice:
              found.card.infantPrice === null ? null : applyRateMarkdown(found.card.infantPrice, discountPct),
          }
        })

        const baseRateName =
          (supplier?.rateTypes ?? []).find((rt) => rt.id === effectiveDefaultRateTypeId)?.name ?? "Rack"

        if (applied === 0) {
          toast.error(`No ${baseRateName} prices found — add ${baseRateName} rate cards first.`, {
            id: "apply-markdown-none",
          })
          return pkg
        }

        if (fallbackPeriods.size > 0) {
          const periodList = [...fallbackPeriods].join(", ")
          toast.success(
            `Applied ${discountPct}% markdown using nearest ${baseRateName} period${fallbackPeriods.size > 1 ? "s" : ""} (${periodList}).`,
            { id: "apply-markdown-done" },
          )
        } else {
          toast.success(
            `Applied ${discountPct}% markdown to ${applied} ${applied === 1 ? "row" : "rows"}.`,
            { id: "apply-markdown-done" },
          )
        }
        return { ...pkg, rateCards: nextRateCards }
      })
    },
    [updatePackage, supplier, effectiveDefaultRateTypeId],
  )

  useEffect(() => {
    if (!canEdit || !form || !isEditing || isPatchInFlight) return

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
    isEditing,
    isPatchInFlight,
    localDraftStorageKey,
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
    if (supplier?.status === "draft" || supplier?.status === "temporary") {
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
      .map((suiteType, index) => ({
        id: suiteType.id,
        name: suiteType.name.trim(),
        passengerCapacity: isTransportSupplier(form.kind) ? suiteType.passengerCapacity : null,
        luggageCapacity: isTransportSupplier(form.kind) ? suiteType.luggageCapacity : null,
        description: isTransportSupplier(form.kind) ? suiteType.description?.trim() || null : null,
        active: suiteType.active,
        sortOrder: suiteType.sortOrder ?? index,
        bedroomTypeIds: suiteType.bedroomTypeIds,
        bedroomLayoutIds: suiteType.bedroomLayoutIds,
        bathroomTypeIds: suiteType.bathroomTypeIds,
      }))
    const cleanedBedroomTypes = form.bedroomTypes
      .filter((value) => value.name.trim())
      .map((value, index) => ({
        id: value.id,
        name: value.name.trim(),
        sortOrder: value.sortOrder ?? index,
        archivedAt: value.archivedAt ?? null,
      }))
    const cleanedBedroomLayouts = form.bedroomLayouts
      .filter((value) => value.name.trim())
      .map((value, index) => ({
        id: value.id,
        name: value.name.trim(),
        sortOrder: value.sortOrder ?? index,
        archivedAt: value.archivedAt ?? null,
      }))
    const cleanedBathroomTypes = form.bathroomTypes
      .filter((value) => value.name.trim())
      .map((value, index) => ({
        id: value.id,
        name: value.name.trim(),
        sortOrder: value.sortOrder ?? index,
        archivedAt: value.archivedAt ?? null,
      }))
    const suiteTypeIds = new Set(cleanedSuiteTypes.map((suiteType) => suiteType.id))
    const activeRateTypeIds = new Set(
      (supplier?.rateTypes ?? []).filter((rt) => !rt.archivedAt).map((rt) => rt.id),
    )

    const routeRateGroup = form.packages[0] ?? createRoutesRateGroup()
    // Drop rate cards that reference an archived rate type: the editor hides them
    // but the server would otherwise reject the whole save (orphaned cards 409).
    // Only prune when the active rate-type set is actually loaded — if `supplier`
    // is stale/unhydrated the set is empty, and pruning would blank the payload,
    // which the server treats as "delete every existing rate card" (route.ts).
    const activeRateCards =
      activeRateTypeIds.size > 0
        ? routeRateGroup.rateCards.filter(
            (rc) => !rc.rateTypeId || activeRateTypeIds.has(rc.rateTypeId),
          )
        : routeRateGroup.rateCards
    const meaningfulPackages = [
      {
        ...routeRateGroup,
        routes: routeRateGroup.routes.filter(
          (route) =>
            route.name.trim() ||
            route.originLocationId ||
            route.destinationLocationId ||
            route.pickupPoint ||
            route.dropoffPoint ||
            activeRateCards.some((rateCard) => rateCard.routeId === route.id),
        ),
        rateCards: activeRateCards,
      },
    ]

    const hasRateCards = meaningfulPackages.some((pkg) => pkg.rateCards.length > 0)
    if (hasRateCards && cleanedSuiteTypes.length === 0) {
      toast.error(
        `Add at least one supplier ${vocabulary.suiteType.toLowerCase()} before saving rates.`,
      )
      return
    }

    for (const pkg of meaningfulPackages) {
      for (const route of pkg.routes) {
        const isTransport = isTransportSupplier(form.kind)
        const needsLocations = vocabulary.routeHasLocations && !isTransport
        if (
          !route.name.trim() ||
          (needsLocations && (!route.originLocationId || !route.destinationLocationId))
        ) {
          toast.error(`Complete all ${vocabulary.route.toLowerCase()} fields before saving.`)
          return
        }
        if (isTransport && (!route.pickupPoint?.trim() || !route.dropoffPoint?.trim())) {
          toast.error("Complete pickup point and drop-off point before saving transport services.")
          return
        }
        if (form.kind === "vehicle_rental" && !route.vehicleRentalDetails) {
          toast.error("Vehicle rental routes require rental details before saving.")
          return
        }
      }
      for (const rateCard of pkg.rateCards) {
        if (!rateCard.suiteTypeId || !rateCard.validFrom || !suiteTypeIds.has(rateCard.suiteTypeId)) {
          toast.error("Complete all rate fields before saving.")
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

    const invalidCardCount = form.packages
      .flatMap((pkg) => pkg.rateCards)
      .filter((card) => !card.rateTypeId).length
    if (invalidCardCount > 0) {
      toast.error(
        `${invalidCardCount} rate card${invalidCardCount > 1 ? "s are" : " is"} missing a rate type. Select a rate type for each card before publishing.`,
      )
      return
    }

    const cleanedRoutes = routeRateGroup.routes
      .filter((route) => route.name.trim())
      .map((route) => ({
        id: route.id,
        name: route.name.trim(),
        originLocationId: route.originLocationId,
        destinationLocationId: route.destinationLocationId,
        pickupPoint: isTransportSupplier(form.kind) ? route.pickupPoint?.trim() ?? "" : null,
        dropoffPoint: isTransportSupplier(form.kind) ? route.dropoffPoint?.trim() ?? "" : null,
        vehicleRentalDetails:
          form.kind === "vehicle_rental"
            ? route.vehicleRentalDetails ?? {
                includedKmPerDay: null,
                extraKmPrice: null,
                securityDeposit: null,
                oneWayFee: null,
              }
            : null,
        directionMode: route.directionMode,
        durationDays: route.durationDays,
        active: route.active,
        rateCards: activeRateCards
          .filter((rateCard) => rateCard.routeId === route.id)
          .map((rateCard) => ({
            id: rateCard.id,
            routeId: rateCard.routeId,
            suiteTypeId: rateCard.suiteTypeId,
            rateTypeId: rateCard.rateTypeId,
            pricePerPerson: rateCard.pricePerPerson,
            childPrice: isTransportSupplier(form.kind) ? null : rateCard.childPrice,
            infantPrice: isTransportSupplier(form.kind) ? null : rateCard.infantPrice,
            currency: rateCard.currency.trim().toUpperCase() || "ZAR",
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
          pricingMode: form.pricingMode,
          email: "",
          emails: cleanedEmails,
          phone: form.phone.trim(),
          website: form.website.trim(),
          location: form.location.trim(),
          locationDetail: form.locationDetail.trim(),
          locationId: getSupplierLocationId(form),
          description: form.description.trim() || null,
          notes: form.notes.trim(),
          active: form.active,
          singleSupplementPct: form.singleSupplementPct,
          infantMaxAge: form.infantMaxAge,
          childMaxAge: form.childMaxAge,
          defaultTimeStart: form.defaultTimeStart || null,
          defaultTimeEnd: form.defaultTimeEnd || null,
          inclusions: splitBulletLines(form.inclusions),
          exclusions: splitBulletLines(form.exclusions),
          rateAdjustments: form.rateAdjustments,
          defaultRateTypeId: form.defaultRateTypeOverrideId,
          suiteTypes: cleanedSuiteTypes,
          routes: cleanedRoutes,
          bedroomTypes: cleanedBedroomTypes,
          bedroomLayouts: cleanedBedroomLayouts,
          bathroomTypes: cleanedBathroomTypes,
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
          currentUpdatedAt?: string
        }
        if (typeof typedPayload.currentUpdatedAt === "string") {
          expectedUpdatedAtRef.current = typedPayload.currentUpdatedAt
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
            `Duplicate ${vocabulary.route.toLowerCase()} name for this supplier. Rename one and try again.`,
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
  const isTrainOperatorForm = form.kind === "train_operator"
  const isTrainOperatorSupplier = supplier.kind === "train_operator"
  const routeRateGroup = form?.packages[0] ?? createRoutesRateGroup()
  const supplierRouteRatePackage: SupplierPackage = {
    id: "supplier-routes-and-rates",
    slug: "supplier-routes-and-rates",
    name: "Routes and Rates",
    description: null,
    durationNights: null,
    singleSupplementPct: supplier.singleSupplementPct,
    currency: "ZAR",
    active: true,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
    routes: supplier.routes,
    rateCards: supplier.rateCards,
  }
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
            <Button
              onClick={() => {
                void handleRetryAfterStaleConflict()
              }}
              disabled={isSaving || staleVersionDialog?.hasRetried}
            >
              Retry my save
            </Button>
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
                {supplier.status === "temporary" && (
                  <Badge variant="outline" className="border-amber-400 text-amber-600">
                    Pending Activation
                  </Badge>
                )}
                {supplier.status !== "draft" && supplier.status !== "temporary" && (
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
                      : supplier.status === "temporary"
                        ? "Save & Activate"
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
            </CardContent>
          </Card>
        )}

        {supplier.status === "temporary" && (
          <Card className="border-dashed border-amber-300 bg-amber-50/40">
            <CardContent className="p-4 text-sm text-amber-700">
              {canEdit
                ? "This supplier was created on-the-go during a quote session. Review and complete the details, then save to activate it and make it available for future bookings."
                : "This supplier was created on-the-go and is awaiting review by a manager before it can be used in future quotes."}
            </CardContent>
          </Card>
        )}

        {canEdit && supplier.status !== "draft" && supplier.status !== "temporary" && pendingLocalDraft && !isEditing && (
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
              {` ${activeVocabulary.routePlural.toLowerCase()}, ${activeVocabulary.suiteTypePlural.toLowerCase()}, and rates are restricted to managers`}
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
                      onValueChange={(value: SupplierKind) => updateSupplierKind(value)}
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

                  {!isTrainOperatorForm && (
                    <div className="space-y-2">
                      <Label htmlFor="supplier-location-city">City</Label>
                      <Select
                        value={form.locationId ?? "none"}
                        onValueChange={(value) =>
                          updateField("locationId", value === "none" ? null : value)
                        }
                      >
                        <SelectTrigger id="supplier-location-city">
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="supplier-location-detail">Suburb / Area</Label>
                    <BufferedInput
                      id="supplier-location-detail"
                      value={form.locationDetail}
                      onValueChange={(value) => updateField("locationDetail", value)}
                    />
                  </div>
                </div>

                <SupplierEmailEditor
                  emails={form.emails}
                  onChange={(emails) => updateField("emails", emails)}
                  idPrefix="supplier-detail"
                />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="supplier-description">Description</Label>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                      External
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Visible to clients - describes the supplier.
                  </p>
                  <BufferedTextarea
                    id="supplier-description"
                    value={form.description}
                    onValueChange={(value) => updateField("description", value)}
                    rows={3}
                  />
                  <div className="flex items-start justify-between gap-2 mt-1">
                    {form.description.length > DESCRIPTION_SOFT_LIMIT && (
                      <p className="text-xs text-amber-600">
                        Text is too long and may not present well on the voucher.
                      </p>
                    )}
                    <p
                      className={cn(
                        "text-xs ml-auto tabular-nums",
                        form.description.length > DESCRIPTION_SOFT_LIMIT
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {form.description.length} / {DESCRIPTION_SOFT_LIMIT}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="supplier-inclusions">What's included</Label>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                        External
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One per line. Listed under this supplier in the quote itinerary.
                    </p>
                    <BufferedTextarea
                      id="supplier-inclusions"
                      value={form.inclusions}
                      onValueChange={(value) => updateField("inclusions", value)}
                      rows={5}
                      placeholder={"High Tea\n24-hour Butler service\nWi-Fi"}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="supplier-exclusions">What's excluded</Label>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                        External
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One per line. Pooled into the quote&apos;s exclusions section.
                    </p>
                    <BufferedTextarea
                      id="supplier-exclusions"
                      value={form.exclusions}
                      onValueChange={(value) => updateField("exclusions", value)}
                      rows={5}
                      placeholder={"French Champagne, caviar, telephone calls, and gratuities"}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="supplier-notes">Notes</Label>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      Internal
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Internal only — not visible to clients.
                  </p>
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
                  <InfoItem label="Suburb / Area" value={supplier.locationDetail} />
                  {!isTrainOperatorSupplier && (
                    <InfoItem
                      label="City"
                      value={
                        supplier.locationId
                          ? (locations.find((loc) => loc.id === supplier.locationId)?.name ?? null)
                          : null
                      }
                    />
                  )}
                  <InfoItem
                    label="Last updated"
                    value={formatDisplayDate(supplier.updatedAt)}
                  />
                  <InfoItem
                    label="Status"
                    value={
                      supplier.status === "draft"
                        ? "Draft"
                        : supplier.status === "temporary"
                          ? "Pending Activation"
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

                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium text-emerald-800">Description</span>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                        External
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {supplier.description || "No description added."}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-emerald-800">What&apos;s included</span>
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                          External
                        </span>
                      </div>
                      {supplier.inclusions.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                          {supplier.inclusions.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nothing listed.</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-emerald-800">What&apos;s excluded</span>
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                          External
                        </span>
                      </div>
                      {supplier.exclusions.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                          {supplier.exclusions.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nothing listed.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">Notes</span>
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                        Internal
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {supplier.notes || "No internal notes recorded."}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {form.kind === "train_operator" || form.kind === "hotel_property" ? (
          <SuiteVocabularyCard
            kind={form.kind}
            bedroomTypes={form.bedroomTypes}
            bedroomLayouts={form.bedroomLayouts}
            bathroomTypes={form.bathroomTypes}
            onChangeBedroomTypes={setBedroomTypes}
            onChangeBedroomLayouts={setBedroomLayouts}
            onChangeBathroomTypes={setBathroomTypes}
            isEditing={isEditing}
          />
        ) : null}

        <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle>{activeVocabulary.sectionTitle}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeVocabulary.sectionDescription}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                {isEditing ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="supplier-pricing-mode" className="text-sm font-semibold text-foreground">
                        Manual pricing
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {form.pricingMode === "manual"
                          ? "Rate cards are hidden. Prices are typed per unit when a quote is built."
                          : "Prices come from rate cards below, as usual."}
                        {supplier.rateCards.length > 0 ? (
                          <span className="block text-xs">
                            Existing rate cards are kept either way — switching only changes whether they're used.
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Switch
                      id="supplier-pricing-mode"
                      checked={form.pricingMode === "manual"}
                      onCheckedChange={(checked) =>
                        updateField("pricingMode", checked ? "manual" : "rate_card")
                      }
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Pricing</p>
                      <p className="text-sm text-muted-foreground">
                        {supplier.pricingMode === "manual"
                          ? "Manual — typed per unit at quote-build time."
                          : "Rate cards."}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {supplier.pricingMode === "manual" ? "Manual" : "Rate cards"}
                    </Badge>
                  </div>
                )}
              </div>

              {activeVocabulary.showSingleSupplement &&
              (isEditing ? form.pricingMode : supplier.pricingMode) !== "manual" ? (
                <div className="rounded-lg border p-4">
                  {isEditing ? (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
                      <div className="space-y-2">
                        <Label htmlFor="supplier-single-supplement">
                          Single supplement %
                        </Label>
                        <NumericInput
                          id="supplier-single-supplement"
                          min="0"
                          step="0.01"
                          value={form.singleSupplementPct}
                          onValueChange={(value) =>
                            updateField("singleSupplementPct", value ?? 0)
                          }
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Added to the per-person sharing rate when a traveller occupies a suite alone.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Single supplement
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Added when a traveller occupies a suite alone.
                        </p>
                      </div>
                      <Badge variant="outline">
                        +{supplier.singleSupplementPct.toFixed(2)}%
                      </Badge>
                    </div>
                  )}
                </div>
              ) : null}

              {form.kind === "hotel_property" || form.kind === "train_operator" ? (
                <div className="rounded-lg border p-4">
                  {isEditing ? (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_1fr] sm:items-end">
                      <div className="space-y-2">
                        <Label htmlFor="supplier-default-time-start">
                          {activeVocabulary.scheduleFields?.timeStartLabel ?? "Check-in time"}
                        </Label>
                        <BufferedInput
                          id="supplier-default-time-start"
                          type="time"
                          value={form.defaultTimeStart}
                          onValueChange={(value) => updateField("defaultTimeStart", value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supplier-default-time-end">
                          {activeVocabulary.scheduleFields?.timeEndLabel ?? "Check-out time"}
                        </Label>
                        <BufferedInput
                          id="supplier-default-time-end"
                          type="time"
                          value={form.defaultTimeEnd}
                          onValueChange={(value) => updateField("defaultTimeEnd", value)}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Shown on the quote itinerary and prefilled on new booking schedules.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {activeVocabulary.scheduleFields?.timeStartLabel ?? "Start"}
                          {" / "}
                          {activeVocabulary.scheduleFields?.timeEndLabel ?? "End"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Shown on the quote itinerary and prefilled on new booking schedules.
                        </p>
                      </div>
                      <Badge variant="outline">
                        {(supplier.defaultTimeStart ?? "").slice(0, 5) || "—"}
                        {" / "}
                        {(supplier.defaultTimeEnd ?? "").slice(0, 5) || "—"}
                      </Badge>
                    </div>
                  )}
                </div>
              ) : null}

              <PassengerAgeBandsSection
                isEditing={isEditing}
                infantMaxAge={isEditing ? form.infantMaxAge : supplier.infantMaxAge}
                childMaxAge={isEditing ? form.childMaxAge : supplier.childMaxAge}
                onChangeInfantMaxAge={(value) => updateField("infantMaxAge", value)}
                onChangeChildMaxAge={(value) => updateField("childMaxAge", value)}
              />

              {(isEditing ? form.pricingMode : supplier.pricingMode) !== "manual" ? (
                <ApplicableRatesCard
                  isEditing={isEditing}
                  rateTypes={supplier.rateTypes ?? []}
                  defaultRateTypeId={effectiveDefaultRateTypeId}
                  adjustments={isEditing ? form.rateAdjustments : supplier.rateAdjustments ?? []}
                  onChange={(next) => updateField("rateAdjustments", next)}
                  onChangeDefaultRateType={handleChangeDefaultRateType}
                />
              ) : null}

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {`Supplier ${activeVocabulary.suiteTypePlural.toLowerCase()}`}
                    </p>
                    <p className="text-xs text-muted-foreground">Used by all route rate cards.</p>
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
                    <SortableList
                      items={form.suiteTypes}
                      onReorder={reorderSuiteTypes}
                      renderItem={({ item, index, dragHandle }) => (
                        <SuiteTypeEditorRow
                          suiteType={item}
                          suiteTypeIndex={index}
                          vocabulary={activeVocabulary}
                          bedroomTypes={form.bedroomTypes}
                          bedroomLayouts={form.bedroomLayouts}
                          bathroomTypes={form.bathroomTypes}
                          showVariants={
                            form.kind === "train_operator" || form.kind === "hotel_property"
                          }
                          dragHandle={dragHandle}
                          onUpdateSuiteType={updateSuiteType}
                          onUpdateSuiteTypeVariantIds={updateSuiteTypeVariantIds}
                          onRemoveSuiteType={removeSuiteType}
                        />
                      )}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {`No ${activeVocabulary.suiteTypePlural.toLowerCase()} added yet.`}
                    </div>
                  )
                ) : supplier.suiteTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {supplier.suiteTypes.map((suiteType) => {
                      const variantLabels = [
                        ...(suiteType.bedroomTypes ?? []),
                        ...(suiteType.bedroomLayouts ?? []),
                        ...(suiteType.bathroomTypes ?? []),
                      ]
                      const variantSuffix =
                        variantLabels.length > 0 ? ` — ${variantLabels.join(", ")}` : ""
                      return (
                        <Badge key={suiteType.id} variant="outline">
                          {suiteType.name}
                          {variantSuffix}
                        </Badge>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    {`No ${activeVocabulary.suiteTypePlural.toLowerCase()} configured.`}
                  </div>
                )}
              </div>

              <Separator />

              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {activeVocabulary.routePlural}
                  </p>
                  {isEditing && (
                    <Button type="button" size="sm" variant="outline" onClick={() => addRoute(0)}>
                      <Plus className="mr-2 h-4 w-4" />
                      {`Add ${activeVocabulary.route.toLowerCase()}`}
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  routeRateGroup.routes.length > 0 ? (
                    routeRateGroup.routes.map((route, routeIndex) => (
                      <RouteEditorRow
                        key={route.id}
                        route={route}
                        routeIndex={routeIndex}
                        packageIndex={0}
                        kind={form.kind}
                        vocabulary={activeVocabulary}
                        locations={locations}
                        onUpdateRoute={updateRoute}
                        onRemoveRoute={removeRoute}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {`No ${activeVocabulary.routePlural.toLowerCase()} added yet.`}
                    </div>
                  )
                ) : supplier.routes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {supplier.routes.map((route) => (
                      <Badge key={route.id} variant="outline">
                        {getRouteLabel(route, locationsById, activeVocabulary)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    {`No ${activeVocabulary.routePlural.toLowerCase()} configured.`}
                  </div>
                )}
              </div>

              <Separator />

              {(isEditing ? form.pricingMode : supplier.pricingMode) === "manual" ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Manually priced — rate cards are hidden. The fare is typed per unit when a quote
                  is built.
                  {supplier.rateCards.length > 0
                    ? " Existing rate cards aren't shown here but haven't been removed."
                    : ""}
                </div>
              ) : isEditing ? (
                <RateCardMatrixEditor
                  routes={routeRateGroup.routes}
                  rateCards={routeRateGroup.rateCards}
                  suiteTypes={form.suiteTypes}
                  rateTypes={supplier.rateTypes ?? []}
                  defaultRateTypeId={effectiveDefaultRateTypeId}
                  adjustments={form.rateAdjustments}
                  onAddRate={addRateAdjustment}
                  onApplyMarkdown={handleApplyRateMarkdown}
                  packageIndex={0}
                  locationsById={locationsById}
                  vocabulary={activeVocabulary}
                  isTransport={isTransportSupplier(form.kind)}
                  supplierKind={form.kind}
                  trainChildPriceRatio={trainChildPriceRatio}
                  ageBuckets={resolveAgeBuckets(globalAgeDefaults, {
                    infantMaxAge: form.infantMaxAge,
                    childMaxAge: form.childMaxAge,
                  })}
                  onAddPeriod={addRateCardPeriod}
                  onRemovePeriod={removeRateCardPeriod}
                  onUpdatePeriodField={updateRateCardPeriodField}
                  onUpdateCellPrice={updateRateCardPrice}
                  onUpdateCellField={updateRateCardField}
                  onToggleCell={toggleRateCardCell}
                  periodFieldErrors={overlapFieldErrorsByPackage.get(0) ?? EMPTY_PERIOD_FIELD_ERRORS}
                />
              ) : (
                <PackageRateCardMatrix
                  pkg={supplierRouteRatePackage}
                  suiteTypes={supplier.suiteTypes}
                  rateTypes={supplier.rateTypes ?? []}
                  defaultRateTypeId={effectiveDefaultRateTypeId}
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
