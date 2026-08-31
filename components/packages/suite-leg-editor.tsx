"use client"

import { useState } from "react"
import { ArrowLeftRight, ChevronDown, Gift, Info, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { WallClockTimeInput } from "@/components/ui/wall-clock-time-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { NumericInput } from "@/components/ui/numeric-input"
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PackageLeg, RateType, ServiceDateAnchor, SupplierRateCard } from "@/lib/types"
import {
  getSupplierVocabulary,
  isOptionalPackageLegKind,
  isTypePricedSupplier,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatDisplayDate } from "@/lib/date-format"
import { distributePassengerTotals, type PassengerTotals } from "@/lib/packages/passenger-totals"
import { addDays } from "@/lib/packages/hotel-dates"
import { resolveTransferPickupDate } from "@/lib/packages/transfer-dates"
import { AnchorDateSection } from "@/components/packages/anchor-date-section"
// TODO: Supplier admin hidden from quote builder — for the booking worksheet, revisit later.
// import { ServiceAdminDates } from "@/components/packages/service-admin-dates"
import {
  createDraftUnit,
  isRouteReversible,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  PASSENGER_SUM_SUPPLIER_KINDS,
  type HotelAnchorContext,
  type SuiteLegState,
  type SuiteUnitState,
  type TransferAnchorContext,
} from "@/lib/packages/apply-dialog-state"
import { resolveDirectedEndpointCodes, resolveDirectedRouteName } from "@/lib/routes/route-name"
import { findRateCardCandidates, hasAnyRateCardFor, selectRateCard } from "@/lib/rate-cards/resolve"
import { RateTypeSelect } from "@/components/rate-type-select"
import { CurrencySelect } from "@/components/currency-select"
import { formatMoney, BASE_CURRENCY } from "@/lib/money"
import { convertAmount, type FxRateMap } from "@/lib/pricing/convert-currency"

const NONE_VALUE = "__none"

interface ConvertedFareHintProps {
  adultPrice: number | null
  childPrice: number | null
  infantPrice: number | null
  from: string
  to: string
  rates: FxRateMap
}

/**
 * Shows what a typed foreign fare becomes in the quote's currency, as it is typed. Purely a
 * preview — the conversion that ends up on the quote is done server-side at pricing time, so a
 * missing rate here silently renders nothing rather than blocking the field.
 */
function ConvertedFareHint({
  adultPrice,
  childPrice,
  infantPrice,
  from,
  to,
  rates,
}: ConvertedFareHintProps) {
  if (from === to) return null

  const entries = [
    { label: "Adult", amount: adultPrice },
    { label: "Child", amount: childPrice },
    { label: "Infant", amount: infantPrice },
  ].filter((entry): entry is { label: string; amount: number } => typeof entry.amount === "number")

  if (entries.length === 0) return null

  let rate: number
  let converted: { label: string; value: string }[]
  try {
    rate = convertAmount(1, from, to, rates).rate
    converted = entries.map((entry) => ({
      label: entry.label,
      value: formatMoney(convertAmount(entry.amount, from, to, rates).amount, to),
    }))
  } catch {
    // No rate for this pair yet. The apply step will say so properly; a half-rendered hint here
    // would just be noise.
    return null
  }

  return (
    <p className="w-full text-xs text-muted-foreground">
      {converted.map((entry) => `${entry.label} ${entry.value}`).join(" · ")}
      <span className="ml-1.5 opacity-70">
        @ {rate.toLocaleString("en-ZA", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
      </span>
    </p>
  )
}

interface RoomPriceOverrideProps {
  unit: SuiteUnitState
  index: number
  nights: number
  /** The card this room would otherwise price off, or null when none covers it. */
  baseRateCard: SupplierRateCard | null
  /** Used for the override's currency when no rate card covers the room. */
  fallbackCurrency: string
  quoteCurrency: string
  formatInQuoteCurrency: (amount: number, from: string) => string | null
  onChange: (next: number | null) => void
  onComplimentaryChange: (next: boolean) => void
}

/**
 * A hotel charges what it charges for a given room — single occupancy above all, which can be
 * 100% of the double rate at one property, 90% at the next and a flat amount at a third, varying
 * by season. Rather than model those rules, the consultant types the amount the hotel quoted for
 * this specific room and it carries straight through to the quote.
 *
 * The typed figure is deliberately not validated against the rate card: the card is shown beside
 * it so a mistake is visible, but the number that goes out is the one that was typed. It applies
 * to this booking only and is never read back as a rate for a later one.
 */
function RoomPriceOverride({
  unit,
  index,
  nights,
  baseRateCard,
  fallbackCurrency,
  quoteCurrency,
  formatInQuoteCurrency,
  onChange,
  onComplimentaryChange,
}: RoomPriceOverrideProps) {
  const currency = baseRateCard?.currency ?? fallbackCurrency
  // 0 is a real price (a comped room), so this is a null check, not a truthiness one.
  const overridden = unit.manualRoomPrice !== null && unit.manualRoomPrice !== undefined
  // A fully comped room is an override whose typed price happens to be zero — the client sees
  // "Complimentary" instead of "R0.00" and it's exempted from the missing-pricing check
  // (see isMissingPricing in lib/quotes/pricing-engine.ts).
  const isComplimentary = overridden && unit.manualRoomPrice === 0
  // The far commoner deal: the hotel gifts the first night and charges the rest. Independent of
  // the override, so a gifted night composes with either the rate card price or a typed one.
  const firstNightFree = unit.complimentaryFirstNight === true
  // Derived rather than synced: a leg loaded with a saved override opens expanded on first paint,
  // and reverting collapses it again, so the two can never drift apart.
  const [requested, setRequested] = useState(false)
  const expanded = requested || overridden

  const price = unit.manualRoomPrice ?? 0
  const chargedNights = firstNightFree ? Math.max(0, nights - 1) : nights
  const stayTotal = Math.round(price * chargedNights * 100) / 100
  const convertedStayTotal = formatInQuoteCurrency(stayTotal, currency)
  const nightLabel = `${chargedNights} ${chargedNights === 1 ? "night" : "nights"}`
  // What the quote will actually charge, whichever price the room is running on.
  const effectivePrice = overridden ? price : baseRateCard?.pricePerPerson ?? null
  const complimentarySummary =
    effectivePrice === null
      ? `First night complimentary · ${chargedNights} of ${nights} nights charged`
      : `First night complimentary · ${chargedNights} of ${nights} nights at ${formatMoney(
          effectivePrice,
          currency,
        )} = ${formatMoney(Math.round(effectivePrice * chargedNights * 100) / 100, currency)}`

  const complimentaryToggle = (
    <Button
      type="button"
      size="sm"
      variant="link"
      className={`h-auto gap-1 p-0 text-xs ${
        firstNightFree
          ? "text-muted-foreground hover:text-foreground"
          : "text-emerald-600 hover:text-emerald-700"
      }`}
      aria-pressed={firstNightFree}
      onClick={() => onComplimentaryChange(!firstNightFree)}
    >
      <Gift className="h-3.5 w-3.5" />
      {firstNightFree ? "Charge the first night" : "First night complimentary"}
    </Button>
  )

  if (!expanded) {
    return (
      <div className="space-y-1.5 border-t pt-3 md:col-span-2 xl:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {baseRateCard ? (
              <>
                Rate card{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)}
                </span>{" "}
                per room per night
              </>
            ) : (
              "No rate card price for this room yet"
            )}
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setRequested(true)}
            >
              Override price
            </Button>
            {complimentaryToggle}
          </div>
        </div>
        {firstNightFree ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-500">{complimentarySummary}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3 md:col-span-2 xl:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label>Price override</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About price overrides"
                className="text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              The client sees only the amount. This price applies to this booking alone and is never
              saved as a rate.
              {unit.manualRoomPriceSetAt
                ? ` Last set ${formatDisplayDate(unit.manualRoomPriceSetAt)}.`
                : ""}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1.5">
          {firstNightFree ? (
            <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
              First night free
            </Badge>
          ) : null}
          {isComplimentary ? (
            <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
              Complimentary
            </Badge>
          ) : overridden ? (
            <Badge variant="secondary" className="h-5 text-[10px]">
              Overridden
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon align="inline-start">
            <InputGroupText className="text-xs font-medium">{currency}</InputGroupText>
          </InputGroupAddon>
          <NumericInput
            min="0"
            step="0.01"
            nullable
            data-slot="input-group-control"
            className="flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder={
              baseRateCard
                ? baseRateCard.pricePerPerson.toLocaleString("en-ZA", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "Rate card price"
            }
            aria-label={`Price override for room ${index + 1}`}
            value={unit.manualRoomPrice ?? null}
            onValueChange={onChange}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs">/ night</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => {
            setRequested(false)
            onChange(null)
          }}
        >
          Revert
        </Button>
        {complimentaryToggle}
      </div>

      {overridden ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(stayTotal, currency)} for {nightLabel}
              {/* The gifted night is not in the charged count above, so say so rather than let
                  the figure read as the whole stay. */}
              {firstNightFree ? ` of ${nights} (first night complimentary)` : ""}
            </span>
            {convertedStayTotal ? <span className="tabular-nums">≈ {convertedStayTotal}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {isComplimentary
              ? "The client's quote and voucher will show this room as complimentary."
              : baseRateCard
                ? `Replaces the rate card's ${formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)} per night.`
                : "No rate card covers this room, so nothing is being replaced."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Leave blank to keep pricing this room off the rate card.
          </p>
          {firstNightFree ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-500">{complimentarySummary}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

interface TourPriceOverrideProps {
  unit: SuiteUnitState
  index: number
  /** The card this unit would otherwise price off, or null when none covers it. */
  baseRateCard: SupplierRateCard | null
  /** Used for the override's currency when no rate card covers the unit. */
  fallbackCurrency: string
  quoteCurrency: string
  formatInQuoteCurrency: (amount: number, from: string) => string | null
  onChange: (next: number | null) => void
}

/**
 * A tour operator sometimes quotes a flat figure for a booking that doesn't decompose cleanly
 * into adult/child/infant rates — a negotiated group rate, a one-off deal. Rather than force that
 * back into per-passenger fares, the consultant types one flat amount that replaces the whole
 * tour unit's rate-card-computed total. Unlike a hotel room, there's no per-night multiplication
 * here — the typed figure is exactly what the line charges.
 *
 * The typed figure is deliberately not validated against the rate card: the card is shown beside
 * it so a mistake is visible, but the number that goes out is the one that was typed. It applies
 * to this booking only and is never read back as a rate for a later one.
 */
function TourPriceOverride({
  unit,
  index,
  baseRateCard,
  fallbackCurrency,
  quoteCurrency,
  formatInQuoteCurrency,
  onChange,
}: TourPriceOverrideProps) {
  const currency = baseRateCard?.currency ?? fallbackCurrency
  // 0 is a real price (a comped tour), so this is a null check, not a truthiness one.
  const overridden = unit.manualTourPrice !== null && unit.manualTourPrice !== undefined
  // Derived rather than synced: a leg loaded with a saved override opens expanded on first paint,
  // and reverting collapses it again, so the two can never drift apart.
  const [requested, setRequested] = useState(false)
  const expanded = requested || overridden

  const price = unit.manualTourPrice ?? 0
  const convertedPrice = formatInQuoteCurrency(price, currency)

  if (!expanded) {
    return (
      <div className="space-y-1.5 border-t pt-3 md:col-span-2 xl:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {baseRateCard ? (
              <>
                Rate card{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)}
                </span>{" "}
                per adult
              </>
            ) : (
              "No rate card price for this tour yet"
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => setRequested(true)}
          >
            Override price
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3 md:col-span-2 xl:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label>Price override</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About price overrides"
                className="text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              The client sees only the amount. This price applies to this booking alone and is
              never saved as a rate.
              {unit.manualTourPriceSetAt ? ` Last set ${formatDisplayDate(unit.manualTourPriceSetAt)}.` : ""}
            </TooltipContent>
          </Tooltip>
        </div>
        {overridden ? (
          <Badge variant="secondary" className="h-5 text-[10px]">
            Overridden
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon align="inline-start">
            <InputGroupText className="text-xs font-medium">{currency}</InputGroupText>
          </InputGroupAddon>
          <NumericInput
            min="0"
            step="0.01"
            nullable
            data-slot="input-group-control"
            className="flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder={
              baseRateCard
                ? baseRateCard.pricePerPerson.toLocaleString("en-ZA", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "Flat price"
            }
            aria-label={`Price override for tour unit ${index + 1}`}
            value={unit.manualTourPrice ?? null}
            onValueChange={onChange}
          />
        </InputGroup>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => {
            setRequested(false)
            onChange(null)
          }}
        >
          Revert
        </Button>
      </div>

      {overridden ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{formatMoney(price, currency)}</span>
            {convertedPrice ? <span className="tabular-nums">≈ {convertedPrice}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {baseRateCard
              ? `Replaces the rate card's ${formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)} per adult.`
              : "No rate card covers this tour, so nothing is being replaced."}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Leave blank to keep pricing this tour off the rate card.
        </p>
      )}
    </div>
  )
}

interface SuiteLegEditorProps {
  leg: PackageLeg
  value: SuiteLegState
  onChange: (next: SuiteLegState) => void
  /** Booking totals for this leg's supplier — shown as the target for per-unit passenger splits. */
  expectedTotals?: PassengerTotals | null
  /** Hotel legs only — absent when the package has no train leg to anchor to. */
  anchorContext?: HotelAnchorContext | null
  /** Airline legs only — the leg directly above this one in the itinerary (skipping past transport/
   *  transfer legs), same resolver a transfer's pickup date anchors to. Absent when nothing dated
   *  precedes it. */
  flightAnchorContext?: TransferAnchorContext | null
  /** Active (non-archived) rate types — shows the per-leg rate type selector when non-empty. */
  rateTypes?: RateType[]
  /** The quote's currency. Typed fares in another currency are previewed converted into it. */
  quoteCurrency?: string
  /** Base-currency rates, used only for the live "↳ R x @ rate" preview under a typed fare. The
   *  authoritative conversion happens server-side at pricing time. */
  fxRates?: FxRateMap
}

const ANCHOR_OPTIONS: { value: ServiceDateAnchor; label: string; hint: string }[] = [
  { value: "pre", label: "Pre-train", hint: "Night(s) before the train departs" },
  { value: "post", label: "Post-train", hint: "From the day the train arrives" },
  { value: "custom", label: "Custom date", hint: "Pick the check-in date manually" },
]

const AIRLINE_ANCHOR_OPTIONS: { value: ServiceDateAnchor; label: string; hint: string }[] = [
  { value: "pre", label: "Pre", hint: "The day the service above starts" },
  { value: "post", label: "Post", hint: "The day the service above ends" },
  { value: "custom", label: "Custom date", hint: "Pick the departure date manually" },
]

type ArrivalOffsetMode = "same" | "plus1" | "plus2" | "custom"

const ARRIVAL_OFFSET_OPTIONS: { value: ArrivalOffsetMode; label: string; hint: string }[] = [
  { value: "same", label: "Same day", hint: "Arrives the day it departs" },
  { value: "plus1", label: "+1 day", hint: "Arrives the day after it departs" },
  { value: "plus2", label: "+2 days", hint: "Arrives two days after it departs" },
  { value: "custom", label: "Custom date", hint: "Pick the arrival date manually" },
]

export function SuiteLegEditor({
  leg,
  value,
  onChange,
  expectedTotals,
  anchorContext,
  flightAnchorContext,
  rateTypes = [],
  quoteCurrency = BASE_CURRENCY,
  fxRates = { [BASE_CURRENCY]: 1 },
}: SuiteLegEditorProps) {
  const isHotel = leg.supplierKind === "hotel_property"
  const isTour = leg.supplierKind === "tour_operator"
  const isAirline = leg.supplierKind === "airline"
  const vocab = getSupplierVocabulary(leg.supplierKind)
  const optional = isOptionalPackageLegKind(leg.supplierKind)
  // A non-optional leg is always part of the booking, whatever a legacy row has stored.
  const included = optional ? value.selected : true
  const showPassengerSplit = PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)
  // Tours show the same per-unit Adults/Children/Infants inputs but each unit prices off its own
  // headcount independently -- there's nothing to reconcile against the booking total, so the
  // running "X/Y adults" tally and its "Spread evenly" fixup only make sense for sleeping/seating
  // suppliers where every traveller must land in exactly one unit.
  const showPassengerSumCheck = PASSENGER_SUM_SUPPLIER_KINDS.has(leg.supplierKind)

  // Same two rules the server enforces, surfaced under the fields instead of arriving as a 400 the
  // consultant has to trace back. A later arrival date is legitimate (overnight flight) and gets a
  // muted confirmation rather than silence, so it never looks like a mistyped year.
  const flightScheduleError =
    isAirline && value.arrivalDate && value.serviceDate
      ? value.arrivalDate < value.serviceDate
        ? "The flight cannot arrive before it departs."
        : value.arrivalDate === value.serviceDate &&
            value.arrivalTime &&
            value.departureTime &&
            value.arrivalTime <= value.departureTime
          ? "A flight arriving on its departure day must arrive after it departs."
          : null
      : null
  const landsNextDay = Boolean(
    isAirline && value.arrivalDate && value.serviceDate && value.arrivalDate > value.serviceDate,
  )
  // Arrival is almost always same-day or the next day, so a Same day/+1/+2 toggle covers the
  // real cases without making someone click through a calendar every time. "Custom" is only
  // shown once requested, or once the stored offset doesn't match any of the quick options
  // (e.g. legacy data with a multi-day layover).
  const arrivalOffsetDays =
    value.serviceDate && value.arrivalDate
      ? Math.round(
          (Date.parse(`${value.arrivalDate}T00:00:00Z`) - Date.parse(`${value.serviceDate}T00:00:00Z`)) /
            86_400_000,
        )
      : null
  const arrivalOffsetMode: ArrivalOffsetMode | null =
    arrivalOffsetDays === null
      ? null
      : arrivalOffsetDays === 0
        ? "same"
        : arrivalOffsetDays === 1
          ? "plus1"
          : arrivalOffsetDays === 2
            ? "plus2"
            : "custom"
  const [arrivalCustomRequested, setArrivalCustomRequested] = useState(false)
  // Collapsed by default so a leg's fields aren't drowned out by an empty textarea -- but a saved
  // note must never be hidden by default, so a leg loaded with one opens expanded on first paint.
  const [notesRequested, setNotesRequested] = useState(false)
  const notesOpen = notesRequested || Boolean(value.notes?.trim())
  const showArrivalDatePicker = arrivalOffsetMode === "custom" || arrivalCustomRequested
  const setArrivalOffset = (mode: ArrivalOffsetMode) => {
    if (mode === "custom") {
      setArrivalCustomRequested(true)
      return
    }
    setArrivalCustomRequested(false)
    const days = mode === "same" ? 0 : mode === "plus1" ? 1 : 2
    onChange({ ...value, arrivalDate: addDays(value.serviceDate!, days) })
  }
  const pricesByTypeOnly = isTypePricedSupplier(leg.supplierKind)
  const activeSuiteTypes = leg.suiteTypes.filter((suiteType) => suiteType.active)

  const selectedRoute = leg.routes.find((route) => route.id === value.routeId)
  const canFlipDirection = vocab.routeHasDirection && isRouteReversible(leg, value.routeId)
  const directedRouteLabel =
    canFlipDirection && selectedRoute?.originLocationName && selectedRoute?.destinationLocationName
      ? resolveDirectedRouteName(
          selectedRoute.originLocationName,
          selectedRoute.destinationLocationName,
          value.reversed,
        )
      : null

  // Itinerary is descriptive-only for a tour operator and belongs to exactly one tour type, so
  // it's never picked by the user (see legFields below) — re-derive it from whatever tour types
  // are currently chosen, rather than leaving whatever routeId happens to be stored. Every caller
  // that can change *which* tour types are on the leg (picking a type, adding a unit, removing a
  // unit) must run this, or a stale itinerary from a since-changed/removed tour can stick around —
  // see getRequiredRouteId in lib/quotes/build-from-package.ts, the server-side counterpart.
  function deriveTourRoutePatch(nextUnits: SuiteUnitState[]): { routeId?: string | null } {
    if (!pricesByTypeOnly) return {}
    const nextSuiteTypeIds = new Set(nextUnits.flatMap((unit) => (unit.suiteTypeId ? [unit.suiteTypeId] : [])))
    const matchingRoutes = leg.routes.filter(
      (route) => route.suiteTypeId && nextSuiteTypeIds.has(route.suiteTypeId),
    )
    return { routeId: matchingRoutes.length === 1 ? matchingRoutes[0].id : null }
  }

  function updateUnit(id: string, patch: Partial<SuiteUnitState>) {
    const units = value.units.map((unit) =>
      unit.id === id
        ? {
            ...unit,
            ...patch,
            // Bed/layout/bathroom choices only make sense for the currently selected suite type.
            ...(patch.suiteTypeId !== undefined
              ? { bedroomTypeId: null, bedroomLayoutId: null, bathroomTypeId: null }
              : {}),
          }
        : unit,
    )

    const routePatch = patch.suiteTypeId !== undefined ? deriveTourRoutePatch(units) : {}

    onChange({ ...value, units, ...routePatch })
  }

  const splitSummed = value.units.reduce(
    (acc, unit) => ({
      adultCount: acc.adultCount + unit.adultCount,
      childCount: acc.childCount + unit.childCount,
      infantCount: acc.infantCount + unit.infantCount,
    }),
    { adultCount: 0, childCount: 0, infantCount: 0 },
  )
  const splitMatches =
    !expectedTotals ||
    (splitSummed.adultCount === expectedTotals.adultCount &&
      splitSummed.childCount === expectedTotals.childCount &&
      splitSummed.infantCount === expectedTotals.infantCount)

  const nights = Math.max(1, value.nights ?? 1)
  const anchored = value.dateAnchor === "pre" || value.dateAnchor === "post"
  // Chained with any other stay anchored to the same train on the same side (see
  // resolveAllAnchoredHotelDates) — not just this hotel resolved on its own — so the preview
  // always matches what applyAnchoredHotelDates is about to save.
  const stayDates = anchorContext?.stayDates ?? null
  // Post-stay dates are counted off the train's arrival, which we can only work out from the
  // route's length — without it we'd silently check the guest in on the departure day.
  const missingTrainDuration =
    value.dateAnchor === "post" && anchorContext != null && anchorContext.durationDays == null

  const flightAnchored = value.dateAnchor === "pre" || value.dateAnchor === "post"
  const flightAnchoredDate = flightAnchorContext
    ? resolveTransferPickupDate(value.dateAnchor, {
        start: flightAnchorContext.startDate,
        end: flightAnchorContext.endDate,
      })
    : null

  function setAnchor(next: ServiceDateAnchor) {
    onChange({ ...value, dateAnchor: next })
  }

  // Re-seeds every unit from the booking's totals, same helper the auto-builder uses to seed a
  // fresh leg (lib/packages/apply-dialog-state.ts createDraftUnit) — covers a customer removing
  // travellers, or just not wanting to redistribute a bigger party across suites by hand. Never
  // runs on its own: it would clobber a split the salesperson just typed.
  function spreadEvenly() {
    if (!expectedTotals) return
    const split = distributePassengerTotals(expectedTotals, value.units.length)
    onChange({
      ...value,
      units: value.units.map((unit, index) => ({ ...unit, ...split[index] })),
    })
  }

  // A tour operator prices the tour type, so the type (picked per unit below) comes first and the
  // itinerary — description only — is chosen from the ones belonging to it.
  const chosenSuiteTypeIds = new Set(
    value.units.flatMap((unit) => (unit.suiteTypeId ? [unit.suiteTypeId] : [])),
  )
  const routeOptions =
    pricesByTypeOnly && chosenSuiteTypeIds.size > 0
      ? leg.routes.filter((route) => route.suiteTypeId && chosenSuiteTypeIds.has(route.suiteTypeId))
      : leg.routes
  const routePlaceholder = pricesByTypeOnly
    ? chosenSuiteTypeIds.size === 0
      ? `Pick a ${vocab.suiteType.toLowerCase()} first`
      : routeOptions.length === 0
        ? `No ${vocab.routePlural.toLowerCase()} for this ${vocab.suiteType.toLowerCase()}`
        : `Select ${vocab.route.toLowerCase()}`
    : leg.routes.length === 0
      ? isHotel
        ? "No meal plans configured"
        : "No routes configured"
      : isHotel
        ? "Select meal plan"
        : "Select route"

  /**
   * The card this room/tour unit would price off today — shown next to a typed override so the
   * consultant can see what they are replacing, and read for the override's currency (a typed
   * price is in the same money as the rate it stands in for). Null when nothing covers the unit,
   * which is a legitimate reason to type a price rather than a blocker.
   *
   * The system-default rate type isn't loaded client-side, so the last inherited tier is skipped
   * here; a unit that only prices off the system default shows no base rate and still overrides
   * correctly — the server resolves the real card when it stamps the snapshot.
   */
  function resolveRoomRateCard(suiteTypeId: string | null, unitRateTypeId?: string | null) {
    if (!(isHotel || isTour) || !suiteTypeId || !value.serviceDate) return null
    const candidates = findRateCardCandidates(
      leg.rateCards,
      value.routeId ?? "",
      suiteTypeId,
      value.serviceDate,
    )
    const selected = selectRateCard(
      candidates,
      // Tours resolve their rate type per unit; every other kind uses the leg's own value.
      unitRateTypeId ?? value.rateTypeId,
      leg.quoteRateTypeId,
      leg.baseRateTypeId,
      null,
    )
    return selected?.ok ? selected.card : null
  }

  /** Same preview-only contract as ConvertedFareHint: no rate for the pair renders nothing. */
  function formatInQuoteCurrency(amount: number, from: string): string | null {
    if (from === quoteCurrency) return null
    try {
      return formatMoney(convertAmount(amount, from, quoteCurrency, fxRates).amount, quoteCurrency)
    } catch {
      return null
    }
  }

  // A tour operator's itinerary belongs to exactly one tour type and carries no price of its own,
  // so it's never a separate choice here — it's auto-derived (see updateUnit) from the tour type
  // picked below and shown only as description text when one exists. Tours show this at the bottom
  // (it's descriptive, not a decision), everything else shows its route picker up top.
  const routeOrItineraryField = pricesByTypeOnly ? (
    selectedRoute?.description ? (
      <div className="space-y-1.5">
        <Label>{vocab.route}</Label>
        <p className="text-xs text-muted-foreground">{selectedRoute.description}</p>
      </div>
    ) : null
  ) : (
    <div className="space-y-1.5">
      <Label>{isHotel ? "Meal plan" : vocab.route}</Label>
      <div className="flex items-center gap-2">
        <Select
          value={value.routeId ?? ""}
          disabled={routeOptions.length === 0}
          onValueChange={(routeId) => {
            const nextReversed = isRouteReversible(leg, routeId) ? value.reversed : false
            // Airline routes are named as their own airport-code pair (e.g. "CPT > ORT") — the one
            // place that pair exists, since locations carry no IATA/ICAO code. An unparseable name
            // (a prose route) leaves From/To exactly as they were.
            const endpointCodes = isAirline
              ? resolveDirectedEndpointCodes(
                  routeOptions.find((route) => route.id === routeId)?.name,
                  nextReversed,
                )
              : null
            onChange({
              ...value,
              routeId,
              reversed: nextReversed,
              ...(endpointCodes
                ? {
                    departureAirportCode: endpointCodes.departure,
                    arrivalAirportCode: endpointCodes.arrival,
                  }
                : null),
            })
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={routePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {routeOptions.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {route.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canFlipDirection ? (
          <Button
            type="button"
            size="icon"
            variant={value.reversed ? "default" : "outline"}
            className="h-9 w-9 shrink-0"
            aria-pressed={value.reversed}
            aria-label="Flip travel direction"
            title="Flip travel direction"
            onClick={() => {
              const nextReversed = !value.reversed
              // Prefer re-deriving from the route name; fall back to swapping whatever From/To
              // already hold so flipping still works for a route whose name doesn't parse.
              const endpointCodes = isAirline
                ? (resolveDirectedEndpointCodes(selectedRoute?.name, nextReversed) ?? {
                    departure: value.arrivalAirportCode,
                    arrival: value.departureAirportCode,
                  })
                : null
              onChange({
                ...value,
                reversed: nextReversed,
                ...(endpointCodes
                  ? {
                      departureAirportCode: endpointCodes.departure,
                      arrivalAirportCode: endpointCodes.arrival,
                    }
                  : null),
              })
            }}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {directedRouteLabel ? (
        <p className="text-xs text-muted-foreground">{directedRouteLabel}</p>
      ) : null}
    </div>
  )

  const rateAndCurrencyFields = (
    <>
      <RateTypeSelect
        rateTypes={rateTypes}
        allowedRateTypeIds={leg.applicableRateTypeIds}
        value={value.rateTypeId}
        onChange={(rateTypeId) => onChange({ ...value, rateTypeId })}
        id={`rate-type-${leg.id}`}
        inheritLabel={
          leg.inheritedRateTypeName
            ? `Supplier default (${leg.inheritedRateTypeName})`
            : "Supplier default"
        }
      />

      {/* Only manual-pricing legs have a fare typed by hand, so only they need to say which
          currency it is in. A rate-card leg carries the card's own currency instead. */}
      {leg.pricingMode === "manual" ? (
        <CurrencySelect
          id={`price-currency-${leg.id}`}
          label="Fare currency"
          value={value.priceCurrency}
          onChange={(priceCurrency) => onChange({ ...value, priceCurrency })}
        />
      ) : null}
    </>
  )

  // Tours show the rate type inside the tour-type card (see the units.map below) and the itinerary
  // at the bottom instead of here — everything else keeps the original single grid up top.
  const legFields = pricesByTypeOnly ? null : (
    <div className="grid gap-3 md:grid-cols-2">
      {routeOrItineraryField}

      {isHotel ? (
        <div className="space-y-1.5">
          <Label htmlFor={`nights-${leg.id}`}>Nights</Label>
          <Input
            id={`nights-${leg.id}`}
            type="number"
            min={1}
            value={value.nights ?? 1}
            onChange={(event) =>
              onChange({ ...value, nights: Math.max(1, Math.floor(Number(event.target.value) || 1)) })
            }
          />
        </div>
      ) : null}

      {rateAndCurrencyFields}
    </div>
  )

  return (
    // border-2 (vs. a unit card's plain border below) so one supplier's whole leg reads as a
    // distinct block -- with several tours/suites stacked underneath each other the single-width
    // border made it easy to lose track of which fields belonged to which leg.
    <div className="space-y-3 rounded-md border-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[160px] flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-medium">{leg.label ?? leg.supplierName}</div>
            {value.origin === "auto" && (
              <Badge
                variant="secondary"
                className="text-[10px] h-4"
                title="Filled automatically from the enquiry — edit any field, or use Confirm services, to accept it"
              >
                Auto-filled
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{leg.supplierName}</div>
        </div>
        {isHotel || isAirline ? null : (
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`service-date-${leg.id}`}>
              Service date
            </Label>
            <DatePicker
              id={`service-date-${leg.id}`}
              value={value.serviceDate ?? ""}
              onChange={(date) => onChange({ ...value, serviceDate: date || null })}
              className="w-40"
              buttonClassName="h-8"
            />
          </div>
        )}
        {/* A non-optional leg is priced into the quote whether or not it is ticked, so letting it
            be unticked only ever produced a voucher missing the journey the customer paid for. */}
        <label
          className="flex items-center gap-1.5 text-xs"
          title={optional ? undefined : "The train journey is part of every booking."}
        >
          <Checkbox
            checked={optional ? value.selected : true}
            disabled={!optional}
            onCheckedChange={(checked) => {
              if (!optional) return
              onChange({ ...value, selected: checked === true })
            }}
          />
          {optional ? "Include in quote & voucher" : "Always included"}
        </label>
      </div>

      {included ? (
        <>
          {isHotel ? (
            <AnchorDateSection
              label="Stay dates"
              options={ANCHOR_OPTIONS}
              value={value.dateAnchor}
              onChange={setAnchor}
              disabledValues={anchorContext ? [] : ["pre", "post"]}
            >
              {anchored ? (
                <p className={cn("text-xs", stayDates ? "text-muted-foreground" : "text-destructive")}>
                  {stayDates ? (
                    <>
                      Check-in <span className="font-medium text-foreground">{formatDisplayDate(stayDates.checkIn)}</span>{" "}
                      &rarr; check-out{" "}
                      <span className="font-medium text-foreground">{formatDisplayDate(stayDates.checkOut)}</span> (
                      {nights} {nights === 1 ? "night" : "nights"}
                      {anchorContext ? `, ${value.dateAnchor === "pre" ? "before" : "after"} ${anchorContext.trainLabel}` : ""})
                    </>
                  ) : (
                    "Set the train leg's service date to work out this hotel's check-in."
                  )}
                </p>
              ) : (
                <DatePicker
                  id={`service-date-${leg.id}`}
                  aria-label="Check-in date"
                  value={value.serviceDate ?? ""}
                  onChange={(date) => onChange({ ...value, serviceDate: date || null })}
                  className="w-40"
                  buttonClassName="h-8"
                />
              )}

              {missingTrainDuration ? (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {anchorContext?.trainLabel} has no journey length set, so the check-in falls on the departure
                  day. Set the route&apos;s duration in Suppliers, or pick a custom date.
                </p>
              ) : null}

              {!anchorContext ? (
                <p className="text-xs text-muted-foreground">
                  This package has no train leg to anchor to — pick the check-in date manually.
                </p>
              ) : null}

              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={value.luggageStorageAvailable}
                  onCheckedChange={(checked) =>
                    onChange({ ...value, luggageStorageAvailable: checked === true })
                  }
                />
                Luggage storage available at reception
              </label>
            </AnchorDateSection>
          ) : null}

          {legFields}

          {isAirline ? (
            <div className="space-y-3 rounded-md border bg-muted/40 p-3">
              <Label className="text-xs">Flight details</Label>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`flight-number-${leg.id}`}>Flight number</Label>
                  <Input
                    id={`flight-number-${leg.id}`}
                    value={value.flightNumber ?? ""}
                    onChange={(event) =>
                      onChange({ ...value, flightNumber: event.target.value.trim() || null })
                    }
                    placeholder="FA212"
                    maxLength={20}
                    className="h-10 w-28"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`departure-airport-${leg.id}`}>From</Label>
                  <Input
                    id={`departure-airport-${leg.id}`}
                    value={value.departureAirportCode ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        departureAirportCode: event.target.value.toUpperCase().trim() || null,
                      })
                    }
                    placeholder="HLA"
                    maxLength={4}
                    aria-label="Departure airport code"
                    className="h-10 w-20 text-center uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`arrival-airport-${leg.id}`}>To</Label>
                  <Input
                    id={`arrival-airport-${leg.id}`}
                    value={value.arrivalAirportCode ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        arrivalAirportCode: event.target.value.toUpperCase().trim() || null,
                      })
                    }
                    placeholder="CPT"
                    maxLength={4}
                    aria-label="Arrival airport code"
                    className="h-10 w-20 text-center uppercase"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <AnchorDateSection
                    label="Departure date"
                    options={AIRLINE_ANCHOR_OPTIONS}
                    value={value.dateAnchor}
                    onChange={setAnchor}
                    disabledValues={flightAnchorContext ? [] : ["pre", "post"]}
                  >
                    {flightAnchored ? (
                      <p
                        className={cn(
                          "text-xs",
                          flightAnchoredDate ? "text-muted-foreground" : "text-destructive",
                        )}
                      >
                        {flightAnchoredDate ? (
                          <>
                            Departs{" "}
                            <span className="font-medium text-foreground">
                              {formatDisplayDate(flightAnchoredDate)}
                            </span>
                            {flightAnchorContext
                              ? ` (${value.dateAnchor === "pre" ? "start" : "end"} of ${flightAnchorContext.legLabel})`
                              : ""}
                          </>
                        ) : (
                          `Set ${flightAnchorContext?.legLabel}'s date to work out this flight's departure.`
                        )}
                      </p>
                    ) : (
                      <DatePicker
                        id={`service-date-${leg.id}`}
                        aria-label="Departure date"
                        value={value.serviceDate ?? ""}
                        onChange={(date) =>
                          onChange({
                            ...value,
                            serviceDate: date || null,
                            // Most flights land the day they take off, so the arrival date follows the
                            // departure until someone says otherwise — an overnight flight is then a
                            // single deliberate edit rather than two fields to fill every time.
                            ...(date && !value.arrivalDate ? { arrivalDate: date } : {}),
                          })
                        }
                        className="w-40"
                      />
                    )}

                    {!flightAnchorContext ? (
                      <p className="text-xs text-muted-foreground">
                        Nothing above this flight has a date to anchor to — pick the departure date
                        manually.
                      </p>
                    ) : null}

                    {value.dateAnchor === "post" && flightAnchorContext?.endDateAssumed ? (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        {flightAnchorContext.legLabel} has no journey length set, so the departure falls
                        on its start day. Set the route&apos;s duration in Suppliers, or pick a custom
                        date.
                      </p>
                    ) : null}
                  </AnchorDateSection>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`departure-time-${leg.id}`}>Departs at</Label>
                  <WallClockTimeInput
                    id={`departure-time-${leg.id}`}
                    value={value.departureTime}
                    onChange={(time) => onChange({ ...value, departureTime: time })}
                    aria-label="Flight departure time"
                  />
                </div>
                <div className="space-y-1.5">
                  <AnchorDateSection
                    label="Arrives on"
                    options={ARRIVAL_OFFSET_OPTIONS}
                    value={arrivalOffsetMode}
                    onChange={setArrivalOffset}
                    disabledValues={value.serviceDate ? [] : ["same", "plus1", "plus2"]}
                  >
                    {showArrivalDatePicker ? (
                      <DatePicker
                        id={`arrival-date-${leg.id}`}
                        aria-label="Flight arrival date"
                        value={value.arrivalDate ?? ""}
                        onChange={(date) => onChange({ ...value, arrivalDate: date || null })}
                        className="w-40"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {value.arrivalDate ? (
                          <>
                            Arrives{" "}
                            <span className="font-medium text-foreground">
                              {formatDisplayDate(value.arrivalDate)}
                            </span>
                          </>
                        ) : (
                          "Set the departure date to work out the arrival."
                        )}
                      </p>
                    )}
                  </AnchorDateSection>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`arrival-time-${leg.id}`}>Arrives at</Label>
                  <WallClockTimeInput
                    id={`arrival-time-${leg.id}`}
                    value={value.arrivalTime}
                    onChange={(time) => onChange({ ...value, arrivalTime: time })}
                    aria-label="Flight arrival time"
                  />
                </div>
              </div>

              {flightScheduleError ? (
                <p className="text-xs text-destructive">{flightScheduleError}</p>
              ) : landsNextDay ? (
                <p className="text-xs text-muted-foreground">
                  Arrives the following day — the quote will show the arrival on its own date.
                </p>
              ) : null}

              {/* Baggage prints on the voucher and is what the voucher-readiness check looks for,
                  so it is captured here with the rest of the flight rather than chased later. */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`hand-luggage-${leg.id}`}>Hand luggage (kg)</Label>
                  <NumericInput
                    id={`hand-luggage-${leg.id}`}
                    min="0"
                    step="0.5"
                    className="h-10 w-24"
                    nullable
                    value={value.handLuggageKg}
                    onValueChange={(next) => onChange({ ...value, handLuggageKg: next })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`checked-luggage-${leg.id}`}>Checked luggage (kg)</Label>
                  <NumericInput
                    id={`checked-luggage-${leg.id}`}
                    min="0"
                    step="0.5"
                    className="h-10 w-24"
                    nullable
                    value={value.checkedLuggageKg}
                    onValueChange={(next) => onChange({ ...value, checkedLuggageKg: next })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {vocab.unitNounPlural.charAt(0).toUpperCase() + vocab.unitNounPlural.slice(1)}
              {showPassengerSumCheck && expectedTotals ? (
                <span className={splitMatches ? "ml-2 font-normal" : "ml-2 font-normal text-destructive"}>
                  {splitSummed.adultCount}/{expectedTotals.adultCount} adults,{" "}
                  {splitSummed.childCount}/{expectedTotals.childCount} children,{" "}
                  {splitSummed.infantCount}/{expectedTotals.infantCount} infants
                </span>
              ) : null}
              {showPassengerSumCheck && expectedTotals && !splitMatches ? (
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  className="ml-2 h-auto p-0 text-xs"
                  onClick={spreadEvenly}
                  title={`Re-split the booking's traveller totals evenly across these ${vocab.unitNounPlural.toLowerCase()}`}
                >
                  Spread evenly
                </Button>
              ) : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                // Tours are independent activities, not sleeping/seating slots -- a new tour is
                // almost always the same travellers doing something else, so prefill it with the
                // booking's full headcount instead of 0/0/0. Trains/hotels/airlines keep the old
                // blank-unit behaviour since Spread evenly is what reconciles those.
                const units = [...value.units, createDraftUnit(isTour ? expectedTotals ?? undefined : undefined)]
                onChange({ ...value, units, ...deriveTourRoutePatch(units) })
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add {vocab.unitNoun}
            </Button>
          </div>

          {value.units.map((unit, index) => {
            const selectedSuiteType = leg.suiteTypes.find((suiteType) => suiteType.id === unit.suiteTypeId)
            const bedroomTypeIds = selectedSuiteType?.bedroomTypeIds ?? []
            const bedroomTypeNames = selectedSuiteType?.bedroomTypes ?? []
            const bedroomLayoutIds = selectedSuiteType?.bedroomLayoutIds ?? []
            const bedroomLayoutNames = selectedSuiteType?.bedroomLayouts ?? []
            const bathroomTypeIds = selectedSuiteType?.bathroomTypeIds ?? []
            const bathroomTypeNames = selectedSuiteType?.bathroomTypes ?? []

            return (
              <div key={unit.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-3">
                {/* Several tours stacked under one supplier otherwise look identical at a glance --
                    this index is the only thing that says which card is the next one to fill in. */}
                {pricesByTypeOnly ? (
                  <p className="text-xs font-medium text-muted-foreground md:col-span-2 xl:col-span-3">
                    {vocab.unitNoun.charAt(0).toUpperCase() + vocab.unitNoun.slice(1)} {index + 1}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label>{vocab.suiteType}</Label>
                  {activeSuiteTypes.length === 0 ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {`No ${vocab.suiteTypePlural.toLowerCase()} set up for ${leg.supplierName} — add one under Suppliers first.`}
                    </p>
                  ) : (
                    <Select
                      value={unit.suiteTypeId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { suiteTypeId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue className="truncate" placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {activeSuiteTypes.map((suiteType) => (
                          <SelectItem key={suiteType.id} value={suiteType.id}>
                            {suiteType.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {leg.pricingMode !== "manual" &&
                  unit.suiteTypeId &&
                  (pricesByTypeOnly || value.routeId) &&
                  !hasAnyRateCardFor(leg.rateCards, value.routeId ?? "", unit.suiteTypeId) ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {pricesByTypeOnly
                        ? `No rate card for this ${vocab.suiteType.toLowerCase()}`
                        : "No rate card for this type on the selected route"}
                    </p>
                  ) : null}
                </div>

                {/* Tours price independently unit by unit (see PASSENGER_SUM_SUPPLIER_KINDS), so
                    unlike every other kind's one leg-level rate type, each tour card gets its own —
                    changing it here must not silently reprice every other tour on this supplier. */}
                {pricesByTypeOnly ? (
                  <RateTypeSelect
                    rateTypes={rateTypes}
                    allowedRateTypeIds={leg.applicableRateTypeIds}
                    value={unit.rateTypeId}
                    onChange={(rateTypeId) => updateUnit(unit.id, { rateTypeId })}
                    id={`rate-type-${leg.id}-${unit.id}`}
                    inheritLabel={
                      value.rateTypeId
                        ? `Leg default (${rateTypes.find((rt) => rt.id === value.rateTypeId)?.name ?? "custom"})`
                        : leg.inheritedRateTypeName
                          ? `Supplier default (${leg.inheritedRateTypeName})`
                          : "Supplier default"
                    }
                  />
                ) : null}

                {/* Fare currency stays a leg-level fact even for tours -- a manual fare is typed
                    once for the whole leg, not per unit -- so it keeps its old single placement. */}
                {pricesByTypeOnly && index === 0 && leg.pricingMode === "manual" ? (
                  <CurrencySelect
                    id={`price-currency-${leg.id}`}
                    label="Fare currency"
                    value={value.priceCurrency}
                    onChange={(priceCurrency) => onChange({ ...value, priceCurrency })}
                  />
                ) : null}

                {/* TODO: bedroom_types vocab is hidden (hotel_property only) but still fully wired
                    in the DB/quote/voucher layers — see suite-vocabulary-card.tsx. */}
                {!isHotel && bedroomTypeIds.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Bed configuration</Label>
                    <Select
                      value={unit.bedroomTypeId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { bedroomTypeId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue className="truncate" placeholder="Select bed configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {bedroomTypeIds.map((id, idx) => (
                          <SelectItem key={id} value={id}>
                            {bedroomTypeNames[idx] ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {bedroomLayoutIds.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Bedroom layout</Label>
                    <Select
                      value={unit.bedroomLayoutId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { bedroomLayoutId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue className="truncate" placeholder="Select layout" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {bedroomLayoutIds.map((id, idx) => (
                          <SelectItem key={id} value={id}>
                            {bedroomLayoutNames[idx] ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {bathroomTypeIds.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Bathroom type</Label>
                    <Select
                      value={unit.bathroomTypeId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { bathroomTypeId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue className="truncate" placeholder="Select bathroom type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {bathroomTypeIds.map((id, idx) => (
                          <SelectItem key={id} value={id}>
                            {bathroomTypeNames[idx] ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {showPassengerSplit ? (
                  <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3">
                    <div className="space-y-1.5">
                      <Label>Adults</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        integer
                        className="h-8 w-14 text-center"
                        value={unit.adultCount}
                        onValueChange={(next) => updateUnit(unit.id, { adultCount: next ?? 0 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Children</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        integer
                        className="h-8 w-14 text-center"
                        value={unit.childCount}
                        onValueChange={(next) => updateUnit(unit.id, { childCount: next ?? 0 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Infants</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        integer
                        className="h-8 w-14 text-center"
                        value={unit.infantCount}
                        onValueChange={(next) => updateUnit(unit.id, { infantCount: next ?? 0 })}
                      />
                    </div>
                  </div>
                ) : null}

                {isHotel ? (
                  <RoomPriceOverride
                    unit={unit}
                    index={index}
                    nights={nights}
                    baseRateCard={resolveRoomRateCard(unit.suiteTypeId)}
                    fallbackCurrency={value.priceCurrency}
                    quoteCurrency={quoteCurrency}
                    formatInQuoteCurrency={formatInQuoteCurrency}
                    onChange={(next) => updateUnit(unit.id, { manualRoomPrice: next })}
                    onComplimentaryChange={(next) =>
                      updateUnit(unit.id, { complimentaryFirstNight: next })
                    }
                  />
                ) : null}

                {isTour && leg.pricingMode !== "manual" ? (
                  <TourPriceOverride
                    unit={unit}
                    index={index}
                    baseRateCard={resolveRoomRateCard(unit.suiteTypeId, unit.rateTypeId)}
                    fallbackCurrency={value.priceCurrency}
                    quoteCurrency={quoteCurrency}
                    formatInQuoteCurrency={formatInQuoteCurrency}
                    onChange={(next) => updateUnit(unit.id, { manualTourPrice: next })}
                  />
                ) : null}

                {leg.pricingMode === "manual" ? (
                  <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-3">
                    <div className="space-y-1.5">
                      <Label>Adult fare</Label>
                      <NumericInput
                        min="0"
                        step="0.01"
                        className="h-8 w-24"
                        nullable
                        nullDisplayValue="0"
                        value={unit.manualAdultPrice}
                        onValueChange={(next) => updateUnit(unit.id, { manualAdultPrice: next })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Child fare</Label>
                      <NumericInput
                        min="0"
                        step="0.01"
                        className="h-8 w-24"
                        nullable
                        placeholder="Same as adult"
                        value={unit.manualChildPrice}
                        onValueChange={(next) => updateUnit(unit.id, { manualChildPrice: next })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Infant fare</Label>
                      <NumericInput
                        min="0"
                        step="0.01"
                        className="h-8 w-24"
                        nullable
                        placeholder="Same as child"
                        value={unit.manualInfantPrice}
                        onValueChange={(next) => updateUnit(unit.id, { manualInfantPrice: next })}
                      />
                    </div>
                    {!unit.manualAdultPrice ? (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Fare required — the quote will flag this line until it's priced.
                      </p>
                    ) : null}
                    <ConvertedFareHint
                      adultPrice={unit.manualAdultPrice}
                      childPrice={unit.manualChildPrice}
                      infantPrice={unit.manualInfantPrice}
                      from={value.priceCurrency}
                      to={quoteCurrency}
                      rates={fxRates}
                    />
                  </div>
                ) : null}

                {value.units.length > 1 ? (
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remove ${vocab.unitNoun} ${index + 1}`}
                      onClick={() => {
                        const units = value.units.filter((item) => item.id !== unit.id)
                        onChange({ ...value, units, ...deriveTourRoutePatch(units) })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}

          {pricesByTypeOnly ? routeOrItineraryField : null}

          <Collapsible open={notesOpen} onOpenChange={setNotesRequested}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium"
                aria-expanded={notesOpen}
              >
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notesOpen ? "" : "-rotate-90"}`} />
                Special requests / allergies
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1.5">
              <Textarea
                value={value.notes ?? ""}
                onChange={(event) => onChange({ ...value, notes: event.target.value || null })}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* TODO: Supplier admin hidden from quote builder — for the booking worksheet, revisit later.
          <ServiceAdminDates
            value={{
              bookingDate: value.bookingDate,
              confirmationDate: value.confirmationDate,
              paymentMadeDate: value.paymentMadeDate,
              paidWith: value.paidWith,
            }}
            onChange={(next) => onChange({ ...value, ...next })}
          /> */}
        </>
      ) : null}
    </div>
  )
}
