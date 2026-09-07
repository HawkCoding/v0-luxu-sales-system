import { SUPPLIER_VOCABULARY, type SupplierKind, type SupplierPrimaryProduct } from "@/lib/types"

/**
 * Lookups for the booking's primary product, shared by intake, auto-build, readiness and the
 * client-facing documents.
 *
 * These exist so that "what shape is this booking" is asked in one place. Every caller used to
 * answer it with its own `kind === "hotel_property"` branch, which is why a supplier ticked as a
 * main product under any other kind was asked for a check-in date and had its meal plan printed as
 * a journey.
 */

/**
 * The primary-product rules for a supplier kind, falling back to a rail journey when the kind is
 * not known yet.
 *
 * The fallback is load-bearing, not defensive: an enquiry draft carries an empty supplier kind
 * until the consultant resolves the supplier, and it has always validated as a journey (route plus
 * departure date). Anything else would start demanding a check-out date on a half-parsed draft.
 */
export function primaryProductOf(kind: SupplierKind | null | undefined): SupplierPrimaryProduct {
  if (!kind) return SUPPLIER_VOCABULARY.train_operator.primaryProduct
  return SUPPLIER_VOCABULARY[kind].primaryProduct
}

/**
 * Whether this kind's route names a real journey -- an origin and a destination -- rather than a
 * meal plan or an itinerary.
 *
 * This is the single predicate behind the booking's journey line: only a kind that answers true can
 * put a route on bookings.route_id or a direction in an email. An unknown kind answers false, so
 * callers that must keep an unclassified leg in play have to say so explicitly.
 */
export function isJourneyRouteKind(kind: SupplierKind | null | undefined): boolean {
  if (!kind) return false
  return SUPPLIER_VOCABULARY[kind].routeHasLocations
}

/**
 * The span in the unit the primary product's own vocabulary counts it in. What is stored (and what
 * a hotel's "Nights" field means) is always the night count between the two dates; a kind that
 * talks in days instead (a tour, a rental) counts both the first and the last day, so a 3-night
 * span is a 4-day one (F-P3-4: "20 -> 23 November" is a 4-Day Kruger Safari, not "3 days"). A kind
 * with no `durationUnit` (a journey, a flight) states no span at intake — nights is returned
 * unchanged for it, since there is no other word to render it in.
 */
export function primaryProductDurationCount(nights: number, unit: "nights" | "days" | null): number {
  return unit === "days" ? nights + 1 : nights
}

/** "3 nights" / "4 days" / "1 day" — primaryProductDurationCount with its noun, pluralised. */
export function formatPrimaryProductDuration(nights: number, unit: "nights" | "days" | null): string {
  const count = primaryProductDurationCount(nights, unit)
  const noun = unit === "days" ? "day" : "night"
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}
