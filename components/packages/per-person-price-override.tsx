"use client"

import { useEffect, useRef, useState, type Ref } from "react"
import { Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatMoney } from "@/lib/money"
import { formatDisplayDate } from "@/lib/date-format"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import { overriddenFares, rateCardFares, type FareRateCard } from "@/lib/pricing/passenger-fares"

/** The three per-person override amounts, one per passenger kind. Null = not overridden. */
export interface PerPersonOverrideValues {
  adult: number | null
  child: number | null
  infant: number | null
}

export interface PriceOverrideField {
  key: "adult" | "child" | "infant"
  label: string
  value: number | null | undefined
  onValueChange: (next: number | null) => void
  /** Shown as the input's placeholder ("Card: 8 775,00") so the consultant sees what they are
   *  replacing. */
  cardPrice: number | null
  /** Replaces the card-price placeholder when a blank field falls back to something other than
   *  the card's own fare for this kind (e.g. a child priced as the overridden adult). */
  placeholder?: string
}

/** An amount as a placeholder shows it: the en-ZA grouping the rate card is read in. */
export function formatOverridePlaceholderAmount(amount: number): string {
  return amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function cardPricePlaceholder(cardPrice: number | null): string {
  return cardPrice !== null ? `Card: ${formatOverridePlaceholderAmount(cardPrice)}` : "Rate card price"
}

interface PriceOverrideFieldsProps {
  fields: readonly PriceOverrideField[]
  /** The currency the typed amounts are in (the card's own, else the leg's). */
  currency: string
  /** Label each row with its passenger kind. Off for a single flat-price field. */
  showKindLabels: boolean
  /** Names the thing being overridden in each input's accessible label, e.g. "transfer 2". */
  subject: string
  /** Optional unit after the input, e.g. "/ day" on a rental. */
  inlineEndSuffix?: string | null
  /** Clears every field in one update — see RequestPriceOverride's onRevert for why a single
   *  callback rather than one onValueChange(null) per field. */
  onRevert: () => void
  disabled?: boolean
  /** Attached to the first input, so a caller can move focus there when the panel opens. */
  firstInputRef?: Ref<HTMLInputElement>
}

/**
 * The input rows of a price override (one per passenger kind, or a single flat one) plus the
 * Revert button. Presentational only: the caller owns the values, the collapse state and whatever
 * surrounds the fields. Shared by transfer/rental overrides and train suite fare overrides.
 */
export function PriceOverrideFields({
  fields,
  currency,
  showKindLabels,
  subject,
  inlineEndSuffix,
  onRevert,
  disabled = false,
  firstInputRef,
}: PriceOverrideFieldsProps) {
  return (
    <div className="flex flex-col gap-2">
      {fields.map((field, index) => (
        <div key={field.key} className="flex flex-wrap items-center gap-2">
          {showKindLabels ? <span className="w-14 shrink-0 text-xs text-muted-foreground">{field.label}</span> : null}
          <InputGroup className="w-full sm:w-64">
            <InputGroupAddon align="inline-start">
              <InputGroupText className="text-xs font-medium">{currency}</InputGroupText>
            </InputGroupAddon>
            <NumericInput
              min="0"
              step="0.01"
              nullable
              disabled={disabled}
              ref={index === 0 ? firstInputRef : undefined}
              data-slot="input-group-control"
              // The placeholder is the fallback, not a value: kept visibly lighter than typed text
              // and prefixed, so a card fare is never mistaken for one already entered.
              className="flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 dark:bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder={field.placeholder ?? cardPricePlaceholder(field.cardPrice)}
              // A single flat field (a per-vehicle transfer, a rental) has no passenger kind, so
              // it isn't announced as the adult price.
              aria-label={
                showKindLabels
                  ? `${field.label} price override for ${subject}`
                  : `Price override for ${subject}`
              }
              value={field.value ?? null}
              onValueChange={field.onValueChange}
            />
            {inlineEndSuffix ? (
              <InputGroupAddon align="inline-end">
                <InputGroupText className="text-xs">{inlineEndSuffix}</InputGroupText>
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
          disabled={disabled}
          onClick={onRevert}
        >
          Revert
        </Button>
      </div>
    </div>
  )
}

/**
 * What a per-person override charges for the given headcount: each kind at its typed fare, else
 * its card fare — the same fallback chain the pricing engine applies (overriddenFares), so the
 * live preview and the quote line never disagree. Excludes any single supplement.
 */
export function perPersonOverrideTotal(
  card: FareRateCard | null,
  overrides: PerPersonOverrideValues,
  pax: PassengerTotals,
): number {
  const total = overriddenFares(card, overrides).reduce(
    (sum, fare) => sum + fare.unitPrice * pax[fare.key],
    0,
  )
  return Math.round(total * 100) / 100
}

export function hasPerPersonOverride(values: PerPersonOverrideValues): boolean {
  // 0 is a real price (a comped fare), so these are null checks, not truthiness ones.
  return values.adult !== null || values.child !== null || values.infant !== null
}

interface PerPersonPriceOverrideProps {
  values: PerPersonOverrideValues
  onChange: (patch: Partial<PerPersonOverrideValues>) => void
  /** Clears all three in one update. */
  onRevert: () => void
  /** The card this unit would otherwise price off, or null when none covers it. */
  card: (FareRateCard & { currency: string }) | null
  /** Shown in place of the card price when `card` is null. */
  noCardMessage: string
  /** The override's currency when no card covers the unit. */
  fallbackCurrency: string
  /** Formats an amount in the quote's currency, or null when it is already in it / no rate. */
  formatInQuoteCurrency: (amount: number, from: string) => string | null
  /** The headcount this unit prices against — drives the live total. */
  pax: PassengerTotals
  /** Names the unit in accessible labels, e.g. "suite 1". */
  subject: string
  /** Extra sentence for the info tooltip (e.g. how the single supplement treats a typed fare). */
  note?: string
  /** Read-only provenance: when the override was last set. */
  setAt?: string | null
  disabled?: boolean
}

/**
 * A collapsed "Override price" link that expands into adult / child / infant per-person fares,
 * each independently replacing its rate-card fare (a blank kind stays on the card), with a live
 * total for the unit's own headcount. Same look and posture as a transfer's per-person override:
 * the client sees only the resulting amount, and the figure is never saved back as a rate.
 */
export function PerPersonPriceOverride({
  values,
  onChange,
  onRevert,
  card,
  noCardMessage,
  fallbackCurrency,
  formatInQuoteCurrency,
  pax,
  subject,
  note,
  setAt,
  disabled = false,
}: PerPersonPriceOverrideProps) {
  const currency = card?.currency ?? fallbackCurrency
  const overridden = hasPerPersonOverride(values)
  // Derived rather than synced: a unit loaded with a saved override opens expanded on first paint,
  // and reverting collapses it again, so the two can never drift apart.
  const [requested, setRequested] = useState(false)
  const expanded = requested || overridden

  // Opening the panel from the link (click or Enter) lands the keyboard in the first fare, rather
  // than leaving focus on a button that has just unmounted. A saved override that opens expanded
  // on first paint doesn't steal focus -- only an explicit request does.
  const firstInputRef = useRef<HTMLInputElement>(null)
  const focusOnExpand = useRef(false)
  useEffect(() => {
    if (!expanded || !focusOnExpand.current) return
    focusOnExpand.current = false
    firstInputRef.current?.focus()
  }, [expanded])

  const cardFares = card ? rateCardFares(card) : null
  const cardFareFor = (key: "adultCount" | "childCount" | "infantCount"): number | null =>
    cardFares?.find((fare) => fare.key === key)?.unitPrice ?? null

  // A blank child with no child price on the card isn't priced off the card's child fare -- it
  // follows the adult fare actually in force, typed or carded (overriddenFares). Say so, live, so
  // typing an adult fare visibly moves what a blank child will cost.
  const childFollowsAdult = card?.childPrice === null || card?.childPrice === undefined
  const resolvedAdultFare = values.adult ?? card?.pricePerPerson ?? null
  const childPlaceholder = childFollowsAdult
    ? resolvedAdultFare !== null
      ? `Same as adult: ${formatOverridePlaceholderAmount(resolvedAdultFare)}`
      : "Same as adult"
    : undefined

  const total = perPersonOverrideTotal(card, values, pax)
  const convertedTotal = formatInQuoteCurrency(total, currency)

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 md:col-span-2 xl:col-span-3">
        <span className="text-xs text-muted-foreground">
          {card && cardFares ? (
            <>
              Rate card{" "}
              {cardFares.map((fare, index) => (
                <span key={fare.key}>
                  {index > 0 ? " / " : null}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(fare.unitPrice, card.currency)}
                  </span>
                </span>
              ))}{" "}
              per person (adult / child / infant)
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
          disabled={disabled}
          aria-label={`Override price for ${subject}`}
          onClick={() => {
            focusOnExpand.current = true
            setRequested(true)
          }}
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
              The client sees only the amount. These fares apply to this booking alone and are never
              saved as a rate.
              {note ? ` ${note}` : ""}
              {setAt ? ` Last set ${formatDisplayDate(setAt)}.` : ""}
            </TooltipContent>
          </Tooltip>
        </div>
        {overridden ? (
          <Badge variant="secondary" className="h-5 text-[10px]">
            Overridden
          </Badge>
        ) : null}
      </div>

      <PriceOverrideFields
        fields={[
          {
            key: "adult",
            label: "Adult",
            value: values.adult,
            onValueChange: (next) => onChange({ adult: next }),
            cardPrice: cardFareFor("adultCount"),
          },
          {
            key: "child",
            label: "Child",
            value: values.child,
            onValueChange: (next) => onChange({ child: next }),
            cardPrice: cardFareFor("childCount"),
            placeholder: childPlaceholder,
          },
          {
            key: "infant",
            label: "Infant",
            value: values.infant,
            onValueChange: (next) => onChange({ infant: next }),
            cardPrice: cardFareFor("infantCount"),
          },
        ]}
        currency={currency}
        showKindLabels
        subject={subject}
        disabled={disabled}
        firstInputRef={firstInputRef}
        onRevert={() => {
          setRequested(false)
          onRevert()
        }}
      />

      {overridden ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground" data-testid="per-person-override-total">
              {formatMoney(total, currency)} for {pax.adultCount}A / {pax.childCount}C / {pax.infantCount}I
            </span>
            {convertedTotal ? <span className="tabular-nums">≈ {convertedTotal}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {card && cardFares
              ? `Replaces the rate card's ${cardFares.map((fare) => formatMoney(fare.unitPrice, card.currency)).join(" / ")} per person (adult / child / infant) where typed. Blank fares stay on the card.`
              : "No rate card covers this, so nothing is being replaced."}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Leave blank to keep pricing off the rate card.</p>
      )}
    </div>
  )
}
