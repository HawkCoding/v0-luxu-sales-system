"use client"

import { useState } from "react"
import { Info, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DateTimePicker } from "@/components/ui/date-time-picker"
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
import type { BookingTransportRequest, PackageLeg, RateType, SupplierRateCard } from "@/lib/types"
import {
  createDraftTransportRequest,
  type TransportLegState,
} from "@/lib/packages/apply-dialog-state"
import { dateOnly } from "@/lib/packages/trip-date-range"
import { getBillableRentalDays } from "@/lib/packages/rental-days"
import { findRateCardCandidates, selectRateCard } from "@/lib/rate-cards/resolve"
import { RateTypeSelect } from "@/components/rate-type-select"
import { CurrencySelect } from "@/components/currency-select"
import { formatMoney, BASE_CURRENCY } from "@/lib/money"
import { convertAmount, type FxRateMap } from "@/lib/pricing/convert-currency"
import { formatDisplayDate } from "@/lib/date-format"

const NONE_VALUE = "__none"

interface RequestPriceOverrideProps {
  request: BookingTransportRequest
  index: number
  isRental: boolean
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
}

/**
 * A transfer/rental charges what it charges for a given trip — after-hours pickups, an odd route,
 * a rate nobody has loaded yet. Rather than block on that, the consultant types the amount the
 * supplier quoted and it carries straight through to the quote, same posture as a hotel room's
 * price override.
 */
function RequestPriceOverride({
  request,
  index,
  isRental,
  baseRateCard,
  noCardMessage,
  fallbackCurrency,
  quoteCurrency,
  formatInQuoteCurrency,
  onChange,
}: RequestPriceOverrideProps) {
  const currency = baseRateCard?.currency ?? fallbackCurrency
  // 0 is a real price (a comped trip), so this is a null check, not a truthiness one.
  const overridden = request.priceOverride !== null && request.priceOverride !== undefined
  // Derived rather than synced: a leg loaded with a saved override opens expanded on first paint,
  // and reverting collapses it again, so the two can never drift apart.
  const [requested, setRequested] = useState(false)
  const expanded = requested || overridden

  const price = request.priceOverride ?? 0
  const billableDays = isRental
    ? getBillableRentalDays(request.pickupAt, request.rentalDetails?.returnAt ?? null)
    : 1
  const total = Math.round(price * billableDays * 100) / 100
  const convertedTotal = formatInQuoteCurrency(total, currency)
  const dayLabel = `${billableDays} ${billableDays === 1 ? "day" : "days"}`
  const tripNoun = isRental ? "vehicle" : "transfer"

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
              {isRental ? "per vehicle per day" : "per transfer"}
            </>
          ) : (
            noCardMessage
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
              The client sees only the amount. This price applies to this trip alone and is never
              saved as a rate.
              {request.priceOverrideSetAt ? ` Last set ${formatDisplayDate(request.priceOverrideSetAt)}.` : ""}
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
            aria-label={`Price override for ${tripNoun} ${index + 1}`}
            value={request.priceOverride ?? null}
            onValueChange={onChange}
          />
          {isRental ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText className="text-xs">/ day</InputGroupText>
            </InputGroupAddon>
          ) : null}
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
          {isRental ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(total, currency)} for {dayLabel}
              </span>
              {convertedTotal ? <span className="tabular-nums">≈ {convertedTotal}</span> : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {baseRateCard
              ? `Replaces the rate card's ${formatMoney(baseRateCard.pricePerPerson, baseRateCard.currency)} ${isRental ? "per day" : "per transfer"}.`
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
}

export function TransportLegEditor({
  leg,
  value,
  onChange,
  rateTypes = [],
  quoteCurrency = BASE_CURRENCY,
  fxRates = { [BASE_CURRENCY]: 1 },
  travelDate = null,
}: TransportLegEditorProps) {
  const isRental = leg.supplierKind === "vehicle_rental"

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
    <div className="space-y-2 rounded-md border p-3">
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
                onChange({ ...value, requests: [...value.requests, createDraftTransportRequest(leg, value.routeId)] })
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
          {value.requests.some((request) => request.priceOverride != null) ? (
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
        ? value.requests.map((request, index) => (
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
              <div className="space-y-1.5">
                <Label>Pickup date/time</Label>
                <DateTimePicker
                  value={request.pickupAt}
                  onChange={(pickupAt) => updateRequest(request.id, { pickupAt })}
                  aria-label="Pickup date"
                />
              </div>
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
                baseRateCard={resolveRequestRateCard(request)}
                noCardMessage={describeNoRateCard(request)}
                fallbackCurrency={value.priceCurrency}
                quoteCurrency={quoteCurrency}
                formatInQuoteCurrency={formatInQuoteCurrency}
                onChange={(next) => updateRequest(request.id, { priceOverride: next })}
              />
              <div className="space-y-1.5 md:col-span-2">
                <Label>Special requests / allergies</Label>
                <Textarea
                  value={request.notes ?? ""}
                  onChange={(event) => updateRequest(request.id, { notes: event.target.value || null })}
                />
              </div>
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
          ))
        : null}
    </div>
  )
}
