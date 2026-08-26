"use client"

import { useState } from "react"
import { ChevronDown, Gift, Info, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DateTimePicker } from "@/components/ui/date-time-picker"
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
import type { BookingTransportRequest, PackageLeg, RateType, ServiceDateAnchor, SupplierRateCard } from "@/lib/types"
import {
  createDraftTransportRequest,
  type TransferAnchorContext,
  type TransportLegState,
} from "@/lib/packages/apply-dialog-state"
import { resolveTransferPickupDate } from "@/lib/packages/transfer-dates"
import { AnchorDateSection } from "@/components/packages/anchor-date-section"
// TODO: Supplier admin hidden from quote builder — for the booking worksheet, revisit later.
// import { ServiceAdminDates } from "@/components/packages/service-admin-dates"
import { dateOnly } from "@/lib/packages/trip-date-range"
import { getBillableRentalDays } from "@/lib/packages/rental-days"
import { findRateCardCandidates, selectRateCard } from "@/lib/rate-cards/resolve"
import { RateTypeSelect } from "@/components/rate-type-select"
import { CurrencySelect } from "@/components/currency-select"
import { formatMoney, BASE_CURRENCY } from "@/lib/money"
import { convertAmount, type FxRateMap } from "@/lib/pricing/convert-currency"
import { formatDisplayDate } from "@/lib/date-format"
import { cn } from "@/lib/utils"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import { resolveTransferPax, resolveTransferPricingBasis, type TransferPricingBasis } from "@/lib/pricing/transfer-basis"

const NONE_VALUE = "__none"

const ANCHOR_OPTIONS: { value: ServiceDateAnchor; label: string; hint: string }[] = [
  { value: "pre", label: "Pre", hint: "The day the leg above starts" },
  { value: "post", label: "Post", hint: "The day the leg above ends" },
  { value: "custom", label: "Custom", hint: "Pick the pickup date manually" },
]

interface RequestPriceOverrideProps {
  request: BookingTransportRequest
  index: number
  isRental: boolean
  /** Per-vehicle: one flat price replaces the rate card. Per-person: up to three separate
   *  overrides, one per passenger kind, each falling back to its own rate-card fare. Always
   *  per_vehicle for a rental. */
  basis: TransferPricingBasis
  /** The card this request would otherwise price off, or null when none covers it. */
  baseRateCard: SupplierRateCard | null
  /** Shown in place of the price when baseRateCard is null — explains why (missing vehicle
   *  category, no route template, no pickup date, or a genuine pricing gap). */
  noCardMessage: string
  /** Used for the override's currency when no rate card covers the request. */
  fallbackCurrency: string
  quoteCurrency: string
  formatInQuoteCurrency: (amount: number, from: string) => string | null
  onChange: (next: number | null) => void
  /** Per-person mode only. */
  onChangeChild: (next: number | null) => void
  onChangeInfant: (next: number | null) => void
  /** Clears all applicable override fields in one update. A dedicated callback rather than three
   *  separate onChange/onChangeChild/onChangeInfant calls in a row: each of those individually
   *  round-trips through the parent's own state, so three fired synchronously in the same click
   *  handler would each compute their patch off the same pre-click snapshot and only the last
   *  one's field would end up actually cleared. */
  onRevert: () => void
  /** The adult/child/infant counts this request will actually be priced against (its own typed
   *  counts, or the booking's projected totals when none are typed) — used for the per-person
   *  preview total. */
  pax: PassengerTotals
  complimentary: boolean
  onComplimentaryChange: (next: boolean) => void
}

/**
 * A transfer/rental charges what it charges for a given trip — after-hours pickups, an odd route,
 * a rate nobody has loaded yet. Rather than block on that, the consultant types the amount the
 * supplier quoted and it carries straight through to the quote, same posture as a hotel room's
 * price override. In per-person mode, up to three amounts can be typed independently — a
 * discounted child fare doesn't require overriding the adult fare too.
 */
function RequestPriceOverride({
  request,
  index,
  isRental,
  basis,
  baseRateCard,
  noCardMessage,
  fallbackCurrency,
  quoteCurrency,
  formatInQuoteCurrency,
  onChange,
  onChangeChild,
  onChangeInfant,
  onRevert,
  pax,
  complimentary,
  onComplimentaryChange,
}: RequestPriceOverrideProps) {
  const isPerPerson = basis === "per_person"
  const currency = baseRateCard?.currency ?? fallbackCurrency
  // 0 is a real price (a comped trip), so these are null checks, not truthiness ones.
  const adultOverridden = request.priceOverride !== null && request.priceOverride !== undefined
  const childOverridden = request.priceOverrideChild !== null && request.priceOverrideChild !== undefined
  const infantOverridden = request.priceOverrideInfant !== null && request.priceOverrideInfant !== undefined
  const overridden = isPerPerson ? adultOverridden || childOverridden || infantOverridden : adultOverridden
  // Derived rather than synced: a leg loaded with a saved override opens expanded on first paint,
  // and reverting collapses it again, so the two can never drift apart.
  const [requested, setRequested] = useState(false)
  const expanded = requested || overridden

  const billableDays = isRental
    ? getBillableRentalDays(request.pickupAt, request.rentalDetails?.returnAt ?? null)
    : 1
  const adultPrice = request.priceOverride ?? baseRateCard?.pricePerPerson ?? 0
  const childPrice = request.priceOverrideChild ?? baseRateCard?.childPrice ?? adultPrice
  const infantPrice = request.priceOverrideInfant ?? baseRateCard?.infantPrice ?? 0
  const total = isPerPerson
    ? Math.round((adultPrice * pax.adultCount + childPrice * pax.childCount + infantPrice * pax.infantCount) * 100) /
      100
    : Math.round((request.priceOverride ?? 0) * billableDays * 100) / 100
  const convertedTotal = formatInQuoteCurrency(total, currency)
  const dayLabel = `${billableDays} ${billableDays === 1 ? "day" : "days"}`
  const tripNoun = isRental ? "vehicle" : "transfer"
  const basisLabel = isRental ? "per vehicle per day" : isPerPerson ? "per person" : "per transfer"

  const complimentaryToggle = (
    <Button
      type="button"
      size="sm"
      variant="link"
      className={`h-auto gap-1 p-0 text-xs ${
        complimentary ? "text-muted-foreground hover:text-foreground" : "text-emerald-600 hover:text-emerald-700"
      }`}
      aria-pressed={complimentary}
      onClick={() => onComplimentaryChange(!complimentary)}
    >
      <Gift className="h-3.5 w-3.5" />
      {complimentary ? `Charge for this ${tripNoun}` : "Mark complimentary"}
    </Button>
  )

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 md:col-span-2 xl:col-span-3">
        <span className="text-xs text-muted-foreground">
          {baseRateCard ? (
            isPerPerson ? (
              <>
                Rate card{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)}
                </span>
                {" / "}
                <span className="font-medium tabular-nums text-foreground">
                  {baseRateCard.childPrice !== null ? formatMoney(baseRateCard.childPrice, baseRateCard.currency) : "free"}
                </span>
                {" / "}
                <span className="font-medium tabular-nums text-foreground">
                  {baseRateCard.infantPrice !== null ? formatMoney(baseRateCard.infantPrice, baseRateCard.currency) : "free"}
                </span>{" "}
                per person (adult / child / infant)
              </>
            ) : (
              <>
                Rate card{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)}
                </span>{" "}
                {basisLabel}
              </>
            )
          ) : (
            noCardMessage
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
              The client sees only the amount. This price applies to this trip alone and is never
              saved as a rate.
              {request.priceOverrideSetAt ? ` Last set ${formatDisplayDate(request.priceOverrideSetAt)}.` : ""}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1.5">
          {complimentary ? (
            <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
              Complimentary
            </Badge>
          ) : overridden ? (
            <Badge variant="secondary" className="h-5 text-[10px]">
              Overridden
            </Badge>
          ) : null}
          {complimentaryToggle}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {(
          [
            { key: "adult", label: "Adult", value: request.priceOverride, onValueChange: onChange, cardPrice: baseRateCard?.pricePerPerson ?? null },
            ...(isPerPerson
              ? [
                  {
                    key: "child",
                    label: "Child",
                    value: request.priceOverrideChild,
                    onValueChange: onChangeChild,
                    cardPrice: baseRateCard?.childPrice ?? baseRateCard?.pricePerPerson ?? null,
                  },
                  {
                    key: "infant",
                    label: "Infant",
                    value: request.priceOverrideInfant,
                    onValueChange: onChangeInfant,
                    cardPrice: baseRateCard?.infantPrice ?? null,
                  },
                ]
              : []),
          ] as const
        ).map((field) => (
          <div key={field.key} className="flex flex-wrap items-center gap-2">
            {isPerPerson ? <span className="w-14 shrink-0 text-xs text-muted-foreground">{field.label}</span> : null}
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
                  field.cardPrice !== null
                    ? field.cardPrice.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "Rate card price"
                }
                aria-label={`${field.label} price override for ${tripNoun} ${index + 1}`}
                value={field.value ?? null}
                onValueChange={field.onValueChange}
              />
              {isRental ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupText className="text-xs">/ day</InputGroupText>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setRequested(false)
              onRevert()
            }}
          >
            Revert
          </Button>
        </div>
      </div>

      {overridden ? (
        <div className="space-y-1">
          {isRental || isPerPerson ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(total, currency)}{" "}
                {isRental ? `for ${dayLabel}` : `for ${pax.adultCount}A / ${pax.childCount}C / ${pax.infantCount}I`}
              </span>
              {convertedTotal ? <span className="tabular-nums">≈ {convertedTotal}</span> : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {baseRateCard
              ? `Replaces the rate card's ${isPerPerson ? "per-person" : ""} ${formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)} ${basisLabel} where typed.`
              : `No rate card covers this ${tripNoun}, so nothing is being replaced.`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Leave blank to keep pricing this {tripNoun} off the rate card.
        </p>
      )}
    </div>
  )
}

interface TransportLegEditorProps {
  leg: PackageLeg
  value: TransportLegState
  onChange: (next: TransportLegState) => void
  /** The leg directly above this one in the itinerary (skipping past other transport legs) — null
   *  when nothing dated precedes it. Transfer rows only; a rental has no single leg to anchor two
   *  dates (pickup, return) to. */
  anchorContext?: TransferAnchorContext | null
  /** Active (non-archived) rate types — shows the per-leg rate type selector when non-empty. */
  rateTypes?: RateType[]
  /** The quote's currency. Typed override prices in another currency are previewed converted into it. */
  quoteCurrency?: string
  /** Base-currency rates, used only for the live "≈ R x" preview under a typed override. The
   *  authoritative conversion happens server-side at pricing time. */
  fxRates?: FxRateMap
  /** The job's travel date — the same last-resort pricing date the server falls back to
   *  (build-from-package.ts's legPricingDate) when a request has no pickup time of its own yet. */
  travelDate?: string | null
  /** The booking's adult/child/infant totals, for a per-person transfer row's pax fallback and
   *  prefill (see lib/pricing/transfer-basis.ts resolveTransferPax) — the same prop SuiteLegEditor
   *  takes for the same purpose. */
  expectedTotals?: PassengerTotals | null
}

const ZERO_TOTALS: PassengerTotals = { adultCount: 0, childCount: 0, infantCount: 0 }

export function TransportLegEditor({
  leg,
  value,
  onChange,
  anchorContext = null,
  rateTypes = [],
  quoteCurrency = BASE_CURRENCY,
  fxRates = { [BASE_CURRENCY]: 1 },
  travelDate = null,
  expectedTotals = null,
}: TransportLegEditorProps) {
  const isRental = leg.supplierKind === "vehicle_rental"
  const fallbackTotals = expectedTotals ?? ZERO_TOTALS

  // Collapsed by default so a request's fields aren't drowned out by an empty textarea -- one
  // leg can hold several requests, so this tracks which were manually opened by id rather than a
  // single flag. A request loaded with a saved note opens expanded regardless (see notesOpen below).
  const [notesRequestedIds, setNotesRequestedIds] = useState<Set<string>>(new Set())
  function setNotesRequested(requestId: string, open: boolean) {
    setNotesRequestedIds((current) => {
      const next = new Set(current)
      if (open) next.add(requestId)
      else next.delete(requestId)
      return next
    })
  }

  function updateRequest(id: string, patch: Partial<BookingTransportRequest>) {
    onChange({
      ...value,
      requests: value.requests.map((request) => (request.id === id ? { ...request, ...patch } : request)),
    })
  }

  const tripNoun = isRental ? "vehicle" : "transfer"

  /** Falls back to the job's travel date, same as the server's legPricingDate, so a request
   *  without its own pickup time yet can still price off a rate card. */
  function requestPricingDate(request: BookingTransportRequest): string | null {
    return dateOnly(request.pickupAt) ?? dateOnly(travelDate)
  }

  /**
   * The card a request would price off today — shown next to a typed override so the consultant
   * can see what they are replacing, and read for the override's currency. Null when nothing
   * covers the request, which is a legitimate reason to type a price rather than a blocker.
   * Uses the leg's own route: a request's own routeId is quick-fill-template-only and is never
   * consulted for pricing (mirrors the server in lib/quotes/build-from-package.ts).
   */
  function resolveRequestRateCard(request: BookingTransportRequest): SupplierRateCard | null {
    const suiteTypeId = request.suiteTypeId
    const pricingDate = requestPricingDate(request)
    if (!suiteTypeId || !value.routeId || !pricingDate) return null
    const candidates = findRateCardCandidates(leg.rateCards, value.routeId, suiteTypeId, pricingDate)
    const selected = selectRateCard(candidates, value.rateTypeId, leg.quoteRateTypeId, leg.baseRateTypeId, null)
    return selected?.ok ? selected.card : null
  }

  /** Explains why resolveRequestRateCard came back null, instead of collapsing every reason into
   *  one generic "no rate card" message. */
  function describeNoRateCard(request: BookingTransportRequest): string {
    if (!request.suiteTypeId) return `Select a vehicle category to see the ${tripNoun} price`
    if (!value.routeId) return `Select a route template to see the ${tripNoun} price`
    if (!requestPricingDate(request)) return `Set a pickup date to see the ${tripNoun} price`
    return `No rate card price for this ${tripNoun} yet`
  }

  /** Same preview-only contract as the hotel editor's helper: no rate for the pair renders nothing. */
  function formatInQuoteCurrency(amount: number, from: string): string | null {
    if (from === quoteCurrency) return null
    try {
      return formatMoney(convertAmount(amount, from, quoteCurrency, fxRates).amount, quoteCurrency)
    } catch {
      return null
    }
  }

  /** Routes are quick-fill templates: picking one pre-fills empty pickup/drop-off fields but never
   * overwrites what the salesperson already typed. */
  function applyRouteTemplate(routeId: string) {
    const route = leg.routes.find((candidate) => candidate.id === routeId)
    onChange({
      ...value,
      routeId,
      requests: value.requests.map((request) => ({
        ...request,
        pickupPoint: request.pickupPoint.trim() ? request.pickupPoint : route?.pickupPoint ?? "",
        dropoffPoint: request.dropoffPoint.trim() ? request.dropoffPoint : route?.dropoffPoint ?? "",
      })),
    })
  }

  function updateRentalDetails(id: string, patch: Partial<NonNullable<BookingTransportRequest["rentalDetails"]>>) {
    onChange({
      ...value,
      requests: value.requests.map((request) =>
        request.id === id
          ? {
              ...request,
              rentalDetails: {
                transportRequestId: request.id,
                returnAt: null,
                returnCutoffTime: null,
                createdAt: request.createdAt,
                updatedAt: request.updatedAt,
                ...request.rentalDetails,
                ...patch,
              },
            }
          : request,
      ),
    })
  }

  return (
    // border-2 (vs. a request card's plain border below) so one supplier's whole leg reads as a
    // distinct block among several stacked legs -- matches SuiteLegEditor's leg root.
    <div className="space-y-2 rounded-md border-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
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
          <div className="text-xs text-muted-foreground">
            {leg.supplierName} — {isRental ? "Vehicle rental" : "Transfer"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={value.selected}
              onCheckedChange={(checked) => onChange({ ...value, selected: checked === true })}
            />
            Include in quote & voucher
          </label>
          {value.selected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...value,
                  requests: [
                    ...value.requests,
                    createDraftTransportRequest(leg, value.routeId, expectedTotals ?? undefined),
                  ],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add {isRental ? "vehicle" : "transfer"}
            </Button>
          ) : null}
        </div>
      </div>

      {value.selected && leg.routes.length > 0 ? (
        <div className="max-w-[280px] space-y-1.5">
          <Label>{isRental ? "Rental route template" : "Transfer route template"}</Label>
          <Select value={value.routeId ?? ""} onValueChange={applyRouteTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Quick-fill from a route" />
            </SelectTrigger>
            <SelectContent>
              {leg.routes.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pre-fills empty pickup/drop-off fields — documents always show what you type below.
          </p>
        </div>
      ) : null}

      {value.selected ? (
        <div className="flex flex-wrap items-end gap-3">
          <RateTypeSelect
            rateTypes={rateTypes}
            allowedRateTypeIds={leg.applicableRateTypeIds}
            value={value.rateTypeId}
            onChange={(rateTypeId) => onChange({ ...value, rateTypeId })}
            id={`rate-type-${leg.id}`}
            className="max-w-[280px] flex-1"
            inheritLabel={
              leg.inheritedRateTypeName
                ? `Supplier default (${leg.inheritedRateTypeName})`
                : "Supplier default"
            }
          />
          {/* Only a price override is typed by hand here — a request with none prices off the
              rate card and takes the card's currency instead. */}
          {value.requests.some(
            (request) =>
              request.priceOverride != null || request.priceOverrideChild != null || request.priceOverrideInfant != null,
          ) ? (
            <CurrencySelect
              id={`price-currency-${leg.id}`}
              label="Override currency"
              value={value.priceCurrency}
              onChange={(priceCurrency) => onChange({ ...value, priceCurrency })}
              className="w-40"
            />
          ) : null}
        </div>
      ) : null}

      {value.selected
        ? value.requests.map((request, index) => {
            const notesOpen = notesRequestedIds.has(request.id) || Boolean(request.notes?.trim())
            const basis = resolveTransferPricingBasis({
              serviceType: request.serviceType,
              rowBasis: request.pricingBasis,
              supplierBasis: leg.transferPricingBasis,
            })
            const isPerPerson = basis === "per_person"
            const pax = resolveTransferPax(
              { adultCount: request.adultCount, childCount: request.childCount, infantCount: request.infantCount },
              fallbackTotals,
            )
            const requestVehicleCapacity = leg.suiteTypes.find((st) => st.id === request.suiteTypeId)
              ?.passengerCapacity
            const paxTotal = pax.adultCount + pax.childCount + pax.infantCount
            const overCapacity =
              isPerPerson && requestVehicleCapacity != null && paxTotal > requestVehicleCapacity
            return (
            <div key={request.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{isRental ? "Pickup point" : "Pickup"}</Label>
                <Input
                  value={request.pickupPoint}
                  onChange={(event) => updateRequest(request.id, { pickupPoint: event.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isRental ? "Return point" : "Drop-off"}</Label>
                <Input
                  value={request.dropoffPoint}
                  onChange={(event) => updateRequest(request.id, { dropoffPoint: event.target.value })}
                  placeholder=""
                />
              </div>
              {isRental ? (
                <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                  <Label>Pickup date/time</Label>
                  <DateTimePicker
                    value={request.pickupAt}
                    onChange={(pickupAt) => updateRequest(request.id, { pickupAt })}
                    aria-label="Pickup date"
                  />
                </div>
              ) : (
                <div className="md:col-span-2 xl:col-span-3">
                  <AnchorDateSection
                    label="Pickup date/time"
                    options={ANCHOR_OPTIONS}
                    value={request.dateAnchor}
                    onChange={(next) => updateRequest(request.id, { dateAnchor: next })}
                    disabledValues={anchorContext ? [] : ["pre", "post"]}
                  >
                    <DateTimePicker
                      value={request.pickupAt}
                      onChange={(pickupAt) => updateRequest(request.id, { pickupAt })}
                      dateDisabled={request.dateAnchor === "pre" || request.dateAnchor === "post"}
                      className="w-64"
                      aria-label="Pickup date"
                    />
                    {anchorContext && (request.dateAnchor === "pre" || request.dateAnchor === "post") ? (
                      <p
                        className={cn(
                          "text-xs",
                          resolveTransferPickupDate(request.dateAnchor, {
                            start: anchorContext.startDate,
                            end: anchorContext.endDate,
                          })
                            ? "text-muted-foreground"
                            : "text-destructive",
                        )}
                      >
                        {(() => {
                          const resolved = resolveTransferPickupDate(request.dateAnchor, {
                            start: anchorContext.startDate,
                            end: anchorContext.endDate,
                          })
                          if (!resolved) return `Set ${anchorContext.legLabel}'s date to work out this pickup.`
                          return (
                            <>
                              Pickup <span className="font-medium text-foreground">{formatDisplayDate(resolved)}</span>
                              {` (${request.dateAnchor === "pre" ? "start" : "end"} of ${anchorContext.legLabel})`}
                            </>
                          )
                        })()}
                      </p>
                    ) : null}
                    {!anchorContext ? (
                      <p className="text-xs text-muted-foreground">
                        Nothing above this transfer has a date to anchor to — pick the pickup date manually.
                      </p>
                    ) : null}
                    {request.dateAnchor === "post" && anchorContext?.endDateAssumed ? (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        {anchorContext.legLabel} has no journey length set, so the pickup falls on its start day. Set
                        the route&apos;s duration in Suppliers, or pick a custom date.
                      </p>
                    ) : null}
                  </AnchorDateSection>
                </div>
              )}
              {isRental ? (
                <div className="space-y-1.5">
                  <Label>Return date/time</Label>
                  <DateTimePicker
                    value={request.rentalDetails?.returnAt}
                    onChange={(returnAt) => updateRentalDetails(request.id, { returnAt })}
                    aria-label="Return date"
                  />
                </div>
              ) : null}
              {leg.suiteTypes.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Vehicle category</Label>
                  <Select
                    value={request.suiteTypeId ?? NONE_VALUE}
                    onValueChange={(next) =>
                      updateRequest(request.id, { suiteTypeId: next === NONE_VALUE ? null : next })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                      {leg.suiteTypes.map((suiteType) => (
                        <SelectItem key={suiteType.id} value={suiteType.id}>
                          {suiteType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Vehicle category</Label>
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    No vehicle categories configured for {leg.supplierName} — add one under Suppliers before booking it.
                  </p>
                </div>
              )}
              {isPerPerson ? (
                <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                  <Label>Passengers</Label>
                  <div className="flex items-center gap-2">
                    {(
                      [
                        { key: "adultCount", label: "Adults", fallback: fallbackTotals.adultCount },
                        { key: "childCount", label: "Children", fallback: fallbackTotals.childCount },
                        { key: "infantCount", label: "Infants", fallback: fallbackTotals.infantCount },
                      ] as const
                    ).map((field) => (
                      <div key={field.key} className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {field.label}
                        </span>
                        <NumericInput
                          min="0"
                          step="1"
                          nullable
                          placeholder={String(field.fallback)}
                          value={request[field.key]}
                          onValueChange={(next) => updateRequest(request.id, { [field.key]: next })}
                          aria-label={`${field.label} for transfer ${index + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Blank uses the booking's totals ({fallbackTotals.adultCount} adults,{" "}
                    {fallbackTotals.childCount} children, {fallbackTotals.infantCount} infants). Priced total:{" "}
                    {paxTotal}.
                  </p>
                  {overCapacity ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {paxTotal} passengers exceeds this vehicle's capacity of {requestVehicleCapacity}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Passengers</Label>
                  <NumericInput
                    min="0"
                    step="1"
                    nullable
                    value={request.passengerCount}
                    onValueChange={(next) => updateRequest(request.id, { passengerCount: next })}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Luggage</Label>
                <NumericInput
                  min="0"
                  step="1"
                  nullable
                  value={request.luggageCount}
                  onValueChange={(next) => updateRequest(request.id, { luggageCount: next })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Flight number</Label>
                <Input
                  value={request.flightNumber ?? ""}
                  onChange={(event) => updateRequest(request.id, { flightNumber: event.target.value || null })}
                />
              </div>
              <RequestPriceOverride
                request={request}
                index={index}
                isRental={isRental}
                basis={basis}
                baseRateCard={resolveRequestRateCard(request)}
                noCardMessage={describeNoRateCard(request)}
                fallbackCurrency={value.priceCurrency}
                quoteCurrency={quoteCurrency}
                formatInQuoteCurrency={formatInQuoteCurrency}
                onChange={(next) => updateRequest(request.id, { priceOverride: next })}
                onChangeChild={(next) => updateRequest(request.id, { priceOverrideChild: next })}
                onChangeInfant={(next) => updateRequest(request.id, { priceOverrideInfant: next })}
                onRevert={() =>
                  updateRequest(request.id, { priceOverride: null, priceOverrideChild: null, priceOverrideInfant: null })
                }
                pax={pax}
                complimentary={request.complimentary}
                onComplimentaryChange={(next) => updateRequest(request.id, { complimentary: next })}
              />
              <Collapsible
                className="md:col-span-2"
                open={notesOpen}
                onOpenChange={(open) => setNotesRequested(request.id, open)}
              >
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
                    value={request.notes ?? ""}
                    onChange={(event) => updateRequest(request.id, { notes: event.target.value || null })}
                  />
                </CollapsibleContent>
              </Collapsible>
              {value.requests.length > 1 ? (
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Remove ${isRental ? "vehicle" : "transfer"} ${index + 1}`}
                    onClick={() =>
                      onChange({ ...value, requests: value.requests.filter((item) => item.id !== request.id) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
            )
          })
        : null}

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
    </div>
  )
}
