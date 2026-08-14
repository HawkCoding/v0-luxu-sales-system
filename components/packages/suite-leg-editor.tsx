"use client"

import { useState } from "react"
import { ArrowLeftRight, Info, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import type { HotelDateAnchor, PackageLeg, RateType, SupplierRateCard } from "@/lib/types"
import {
  getSupplierVocabulary,
  isOptionalPackageLegKind,
  isTypePricedSupplier,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatDisplayDate } from "@/lib/date-format"
import { distributePassengerTotals, type PassengerTotals } from "@/lib/packages/passenger-totals"
import { resolveHotelStayDates } from "@/lib/packages/hotel-dates"
import {
  createDraftUnit,
  isRouteReversible,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  type HotelAnchorContext,
  type SuiteLegState,
  type SuiteUnitState,
} from "@/lib/packages/apply-dialog-state"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
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
}: RoomPriceOverrideProps) {
  const currency = baseRateCard?.currency ?? fallbackCurrency
  // 0 is a real price (a comped room), so this is a null check, not a truthiness one.
  const overridden = unit.manualRoomPrice !== null && unit.manualRoomPrice !== undefined
  // Derived rather than synced: a leg loaded with a saved override opens expanded on first paint,
  // and reverting collapses it again, so the two can never drift apart.
  const [requested, setRequested] = useState(false)
  const expanded = requested || overridden

  const price = unit.manualRoomPrice ?? 0
  const stayTotal = Math.round(price * nights * 100) / 100
  const convertedStayTotal = formatInQuoteCurrency(stayTotal, currency)
  const nightLabel = `${nights} ${nights === 1 ? "night" : "nights"}`

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 md:col-span-2 xl:col-span-3">
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
      </div>

      {overridden ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(stayTotal, currency)} for {nightLabel}
            </span>
            {convertedStayTotal ? <span className="tabular-nums">≈ {convertedStayTotal}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {baseRateCard
              ? `Replaces the rate card's ${formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)} per night.`
              : "No rate card covers this room, so nothing is being replaced."}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Leave blank to keep pricing this room off the rate card.
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
  /** Active (non-archived) rate types — shows the per-leg rate type selector when non-empty. */
  rateTypes?: RateType[]
  /** The quote's currency. Typed fares in another currency are previewed converted into it. */
  quoteCurrency?: string
  /** Base-currency rates, used only for the live "↳ R x @ rate" preview under a typed fare. The
   *  authoritative conversion happens server-side at pricing time. */
  fxRates?: FxRateMap
}

const ANCHOR_OPTIONS: { value: HotelDateAnchor; label: string; hint: string }[] = [
  { value: "pre", label: "Pre-train", hint: "Night(s) before the train departs" },
  { value: "post", label: "Post-train", hint: "From the day the train arrives" },
  { value: "custom", label: "Custom date", hint: "Pick the check-in date manually" },
]

export function SuiteLegEditor({
  leg,
  value,
  onChange,
  expectedTotals,
  anchorContext,
  rateTypes = [],
  quoteCurrency = BASE_CURRENCY,
  fxRates = { [BASE_CURRENCY]: 1 },
}: SuiteLegEditorProps) {
  const isHotel = leg.supplierKind === "hotel_property"
  const vocab = getSupplierVocabulary(leg.supplierKind)
  const optional = isOptionalPackageLegKind(leg.supplierKind)
  // A non-optional leg is always part of the booking, whatever a legacy row has stored.
  const included = optional ? value.selected : true
  const showPassengerSplit = PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)
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

    // An itinerary belongs to one tour type, so changing the type strands the chosen itinerary.
    const nextSuiteTypeIds = new Set(units.flatMap((unit) => (unit.suiteTypeId ? [unit.suiteTypeId] : [])))
    const chosenRoute = leg.routes.find((route) => route.id === value.routeId)
    const routeStranded =
      pricesByTypeOnly &&
      patch.suiteTypeId !== undefined &&
      Boolean(chosenRoute) &&
      (!chosenRoute?.suiteTypeId || !nextSuiteTypeIds.has(chosenRoute.suiteTypeId))

    onChange({ ...value, units, ...(routeStranded ? { routeId: null } : {}) })
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
  const stayDates = anchorContext
    ? resolveHotelStayDates(value.dateAnchor, nights, {
        departureDate: anchorContext.departureDate,
        durationDays: anchorContext.durationDays,
      })
    : null
  // Post-stay dates are counted off the train's arrival, which we can only work out from the
  // route's length — without it we'd silently check the guest in on the departure day.
  const missingTrainDuration =
    value.dateAnchor === "post" && anchorContext != null && anchorContext.durationDays == null

  function setAnchor(next: HotelDateAnchor) {
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
   * The card this room would price off today — shown next to a typed override so the consultant
   * can see what they are replacing, and read for the override's currency (a typed price is in
   * the same money as the rate it stands in for). Null when nothing covers the room, which is a
   * legitimate reason to type a price rather than a blocker.
   *
   * The system-default rate type isn't loaded client-side, so the last inherited tier is skipped
   * here; a room that only prices off the system default shows no base rate and still overrides
   * correctly — the server resolves the real card when it stamps the snapshot.
   */
  function resolveRoomRateCard(suiteTypeId: string | null) {
    if (!isHotel || !suiteTypeId || !value.serviceDate) return null
    const candidates = findRateCardCandidates(
      leg.rateCards,
      value.routeId ?? "",
      suiteTypeId,
      value.serviceDate,
    )
    const selected = selectRateCard(candidates, value.rateTypeId, leg.quoteRateTypeId, leg.baseRateTypeId, null)
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

  const legFields = (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{isHotel ? "Meal plan" : vocab.route}</Label>
        <div className="flex items-center gap-2">
          <Select
            value={value.routeId ?? ""}
            disabled={routeOptions.length === 0}
            onValueChange={(routeId) =>
              onChange({
                ...value,
                routeId,
                reversed: isRouteReversible(leg, routeId) ? value.reversed : false,
              })
            }
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
              onClick={() => onChange({ ...value, reversed: !value.reversed })}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {directedRouteLabel ? (
          <p className="text-xs text-muted-foreground">{directedRouteLabel}</p>
        ) : null}
        {pricesByTypeOnly && selectedRoute?.description ? (
          <p className="text-xs text-muted-foreground">{selectedRoute.description}</p>
        ) : null}
      </div>

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
    </div>
  )

  return (
    <div className="space-y-3 rounded-md border p-3">
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
        {isHotel ? null : (
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`service-date-${leg.id}`}>Service date</Label>
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
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs">Stay dates</Label>
                <div className="flex flex-wrap gap-1">
                  {ANCHOR_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={value.dateAnchor === option.value ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      aria-pressed={value.dateAnchor === option.value}
                      title={option.hint}
                      disabled={option.value !== "custom" && !anchorContext}
                      onClick={() => setAnchor(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

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
            </div>
          ) : null}

          {pricesByTypeOnly ? null : legFields}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {isHotel ? "Rooms" : "Suites"}
              {showPassengerSplit && expectedTotals ? (
                <span className={splitMatches ? "ml-2 font-normal" : "ml-2 font-normal text-destructive"}>
                  {splitSummed.adultCount}/{expectedTotals.adultCount} adults,{" "}
                  {splitSummed.childCount}/{expectedTotals.childCount} children,{" "}
                  {splitSummed.infantCount}/{expectedTotals.infantCount} infants
                </span>
              ) : null}
              {showPassengerSplit && expectedTotals && !splitMatches ? (
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  className="ml-2 h-auto p-0 text-xs"
                  onClick={spreadEvenly}
                  title="Re-split the booking's traveller totals evenly across these suites"
                >
                  Spread evenly
                </Button>
              ) : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange({ ...value, units: [...value.units, createDraftUnit()] })}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add {isHotel ? "room" : "suite"}
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
                <div className="space-y-1.5">
                  <Label>{vocab.suiteType}</Label>
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

                {bedroomTypeIds.length > 0 ? (
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
                      aria-label={`Remove ${isHotel ? "room" : "suite"} ${index + 1}`}
                      onClick={() =>
                        onChange({ ...value, units: value.units.filter((item) => item.id !== unit.id) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}

          {pricesByTypeOnly ? legFields : null}

          <div className="space-y-1.5">
            <Label>Special requests / allergies</Label>
            <Textarea
              value={value.notes ?? ""}
              onChange={(event) => onChange({ ...value, notes: event.target.value || null })}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
