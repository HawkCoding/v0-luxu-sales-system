import { displayRouteName } from "@/lib/routes/route-name"
import type { PricingSnapshot } from "@/lib/types"

/**
 * The typed pick-up and drop-off of the captured trip a transfer/rental line priced
 * (booking_transport_requests.pickup_point / dropoff_point) — see resolveTransportLinePoints.
 */
export interface InvoiceTransportPoints {
  pickup: string
  dropoff: string
}

/**
 * "Sandton Hotel to Pretoria Station" — the places a guest recognises, never the route record's
 * short code ("PTY - PHTL STA"). A trip that starts and ends at the same place (a rental collected
 * and returned at one depot) names it once. Null when either end is blank.
 */
export function transportPointsLabel(points: InvoiceTransportPoints | null | undefined): string | null {
  const pickup = points?.pickup.trim()
  const dropoff = points?.dropoff.trim()
  if (!pickup || !dropoff) return null
  return pickup.toLowerCase() === dropoff.toLowerCase() ? pickup : `${pickup} to ${dropoff}`
}

/**
 * The invoice's "Travel Package Description" column reads better as
 * "Supplier — Route direction" than the verbose line description the pricing
 * engine stores on the quote (which carries suite type, variant vocabulary
 * and "- Adult"/"- Child" suffixes for the quote's own presentation). Derived
 * at render time from the line's pricing snapshot; the stored quote line
 * description is never rewritten.
 *
 * A comp is never spelled out here, matching the quote: the gifted night is already missing from
 * the line's qty and a comped trip already totals R0. The voucher (which goes to the supplier)
 * keeps its COMPLIMENTARY callouts.
 */
export function describeInvoiceLine(
  storedDescription: string,
  snapshot: PricingSnapshot | null | undefined,
  transportPoints?: InvoiceTransportPoints | null,
): string {
  // Transfer/car-rental supplier identity is never shown to the client — always generic.
  const isGenericService = snapshot?.serviceType === "transfer" || snapshot?.serviceType === "rental"
  const supplier = isGenericService ? null : snapshot?.supplierName?.trim() || snapshot?.legLabel?.trim() || null

  // A tour operator sells the tour type, not the itinerary that describes it — routeName on a
  // tour line is descriptive copy shared by every tour on the leg, so two different tours would
  // otherwise render identically. Falls back to routeName only for snapshots stamped before the
  // tour type was captured here.
  // displayRouteName also guards the fallback: snapshots stamped between the itinerary-name
  // retirement and this fix carry the itinerary's id as routeName, which must never render.
  const isTour = snapshot?.supplierKind === "tour_operator"
  const isHotel = snapshot?.supplierKind === "hotel_property"
  const detail = (isTour ? snapshot?.suiteTypeName?.trim() : null) || displayRouteName(snapshot?.routeName)
  // A hotel names the room category ahead of the meal plan its route field carries (client
  // request 2026-10-07: "Deluxe Room, Bed & Breakfast"), and counts the stay in the brackets.
  const hotelDetail = isHotel ? [snapshot?.suiteTypeName?.trim(), detail].filter(Boolean).join(", ") : null
  const nights = isHotel ? hotelStayNights(snapshot) : null

  let base: string
  if (supplier) {
    const shown = hotelDetail || detail
    base = shown ? `${supplier} — ${shown}` : supplier
  } else if (isGenericService) {
    // Category word only, never the supplier — "Transfer <pick-up> to <drop-off>". The route's own
    // name is an internal short code, so it is only the fallback for a trip with no typed points.
    const categoryLabel = snapshot?.serviceType === "rental" ? "Rental" : "Transfer"
    const where = transportPointsLabel(transportPoints) ?? detail
    base = where ? `${categoryLabel} ${where}` : categoryLabel
  } else {
    return storedDescription
  }

  const notes = [
    nights ? `${nights} ${nights === 1 ? "night" : "nights"}` : null,
    snapshot?.passengerKind === "child" ? "Child" : snapshot?.passengerKind === "infant" ? "Infant" : null,
  ].filter(Boolean)

  return notes.length > 0 ? `${base} (${notes.join(", ")})` : base
}

/**
 * The room's whole stay, gifted night included — the client is told how long they stay, not how
 * many nights were charged. Older snapshots without stayNights rebuild it from the per-person
 * line's charged nights; a line carrying neither prints no count rather than a guess.
 */
function hotelStayNights(snapshot: PricingSnapshot | null | undefined): number | null {
  const stay = snapshot?.stayNights
  if (typeof stay === "number" && stay > 0) return stay
  const charged = snapshot?.chargedNights
  if (typeof charged !== "number" || charged <= 0) return null
  const gifted = snapshot?.complimentaryNights
  return charged + (typeof gifted === "number" && gifted > 0 ? gifted : 0)
}
