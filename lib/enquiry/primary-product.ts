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
