import type { PricingSnapshot } from "@/lib/types"

/** A quote_line_items row, or the subset this module needs. */
export interface PerPersonLine {
  total: number | null
  pricing_snapshot: unknown
}

export interface PerPersonInput {
  /** The quote's priced lines, commission line included. */
  lines: readonly PerPersonLine[]
  adults: number
  /** Paying children. Infants are never counted here, so a free infant never dilutes the split. */
  children: number
  /** The figure the document prints as its total ("Total incl. VAT") — what the rows must add up to. */
  total: number
}

/** null hides the row: no adults or no total (perAdult), or no children (perChild). */
export interface PerPersonTotals {
  perAdult: number | null
  perChild: number | null
}

const NONE: PerPersonTotals = { perAdult: null, perChild: null }

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** "per person", "per person sharing", "per person per night" — a fare charged per traveller. */
function isPerTravellerUnit(unit: string | null | undefined): boolean {
  return (unit ?? "").trim().toLowerCase().startsWith("per person")
}

/** The adult or child fare a line charges, or null when the line is a shared cost: per room, per
 *  vehicle, per day, a fixed-package total (no leg), a manual or overridden tour price, commission,
 *  an infant's charge, or a line with no pricing snapshot to say whose cost it is. */
function fareKind(snapshot: PricingSnapshot | null): "adult" | "child" | null {
  if (
    !snapshot ||
    snapshot.commission ||
    !snapshot.legId ||
    snapshot.pricingMode !== "rate_card" ||
    snapshot.manualTourPrice != null ||
    !isPerTravellerUnit(snapshot.unit)
  ) {
    return null
  }
  if (snapshot.passengerKind === "child") return "child"
  if (snapshot.passengerKind === "adult" || snapshot.passengerKind === "single_supplement") return "adult"
  return null
}

/** Splits `total` into a rounded per-adult figure and a per-child figure taken from what the adults
 *  leave, so perAdult × adults + perChild × children misses `total` by at most half a cent per child. */
function splitRounded(total: number, adults: number, children: number, rawPerAdult: number): PerPersonTotals {
  const perAdult = round2(rawPerAdult)
  return { perAdult, perChild: round2((total - perAdult * adults) / children) }
}

/**
 * The "Total per Adult" / "Total per Child" rows on the quote and the invoice. Always printed when
 * there are adults and a total; the child row only when there are paying children.
 *
 * Adults only: total ÷ adults.
 *
 * With children: each person's own fare (per-person lines tagged adult or child, summed over every
 * leg) is exact. Everything else — per-room hotels, per-vehicle transfers, per-day rentals, a
 * fixed-package total, manual/overridden tour prices, commission of any kind, Agent Commission and
 * Discount — is a shared cost, spread over the party in proportion to each person's own fare, so a
 * child on a lower fare carries a smaller share. That is the same as scaling both fares by
 * total ÷ (adult fares + child fares).
 *
 * Children whose child fares exist but are all R0 (free on every fare) carry nothing: Total per
 * Child R0,00, adults total ÷ adults — and the same the other way round. When one side has no
 * per-person fare line at all (an adult per-person fare with per-suite or per-room costs the
 * children share), there is no fare to weigh that side by: each side keeps its own fares and the
 * shared costs are split equally per paying guest, so the children still carry their share of them.
 * A net deduction (shared costs below zero — a discount larger than everything shared) is taken off
 * the fares pro rata instead, so no row can go negative. An all-shared booking — no per-person fare
 * anywhere — is the equal split per paying guest.
 *
 * Invariant: perAdult × adults + perChild × children == total, to the cent. The per-adult figure is
 * rounded to cents and the per-child figure takes the remainder, so any residual is at most half a
 * cent per child (and at most half a cent per adult on an adults-only booking, or when the children
 * carry R0, where nothing else can absorb it).
 */
export function derivePerPersonTotals({ lines, adults, children, total }: PerPersonInput): PerPersonTotals {
  if (!(adults > 0) || !(total > 0)) return NONE
  if (!(children > 0)) return { perAdult: round2(total / adults), perChild: null }

  let adultFares = 0
  let childFares = 0
  let hasAdultFareLine = false
  let hasChildFareLine = false
  for (const line of lines) {
    const kind = fareKind((line.pricing_snapshot as PricingSnapshot | null) ?? null)
    const lineTotal = Number(line.total ?? 0)
    if (kind === "adult") {
      adultFares += lineTotal
      hasAdultFareLine = true
    } else if (kind === "child") {
      childFares += lineTotal
      hasChildFareLine = true
    }
  }

  const fares = adultFares + childFares
  if (adultFares > 0 && childFares > 0) {
    return splitRounded(total, adults, children, (adultFares / adults) * (total / fares))
  }
  // Free on every fare of their own: that side carries nothing.
  if (adultFares > 0 && hasChildFareLine) return { perAdult: round2(total / adults), perChild: 0 }
  if (childFares > 0 && hasAdultFareLine) return { perAdult: 0, perChild: round2(total / children) }

  // One side (or both) has no fare line to weigh by: own fares stay with their side, shared costs
  // split equally per paying guest.
  const shared = total - fares
  if (shared < 0) return splitRounded(total, adults, children, (adultFares / adults) * (total / fares))
  return splitRounded(total, adults, children, adultFares / adults + shared / (adults + children))
}
