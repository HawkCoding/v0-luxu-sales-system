import { transportPointsLabel, type InvoiceTransportPoints } from "@/lib/invoices/describe-invoice-line"
import { dateOnly } from "@/lib/packages/trip-date-range"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"

/** What the invoice reads from a captured trip to name a transfer/rental line by its places. */
export type InvoiceTransportRequest = Pick<
  Database["public"]["Tables"]["booking_transport_requests"]["Row"],
  "id" | "service_id" | "service_type" | "suite_type_id" | "pickup_point" | "dropoff_point" | "pickup_at"
>

export const INVOICE_TRANSPORT_REQUEST_COLUMNS =
  "id, service_id, service_type, suite_type_id, pickup_point, dropoff_point, pickup_at"

function isTransportLine(snapshot: PricingSnapshot | null | undefined): snapshot is PricingSnapshot {
  return snapshot?.serviceType === "transfer" || snapshot?.serviceType === "rental"
}

function pointsOf(request: InvoiceTransportRequest): InvoiceTransportPoints {
  return { pickup: request.pickup_point, dropoff: request.dropoff_point }
}

/** The one set of points every candidate agrees on, or null when they disagree or any is blank. */
function agreedPoints(candidates: readonly InvoiceTransportRequest[]): InvoiceTransportPoints | null {
  if (candidates.length === 0) return null
  const labels = new Set(candidates.map((request) => transportPointsLabel(pointsOf(request))?.toLowerCase() ?? null))
  if (labels.size !== 1 || labels.has(null)) return null
  return pointsOf(candidates[0])
}

/**
 * The pick-up/drop-off of the trip each priced transfer/rental line was for, index-aligned with
 * `snapshots` (null for every other line, and wherever the trip can't be told apart for certain —
 * the invoice then falls back to the route's name, as it always has).
 *
 * Read live at render time, never off the snapshot, so an invoice for a booking priced before this
 * existed still gets the full names without re-pricing. A line stamped with its
 * `transportRequestId` (every comped trip, and every trip priced since) names its trip outright.
 * An older line is matched the way build-from-package.ts found its trip: same booking service
 * (`legId` is a booking_services id, what a request's `service_id` points at) and same transport
 * type. When that leaves several trips with different points, the line's own vehicle category and
 * pricing date (the request's pick-up day) narrow it; anything still ambiguous prints no points
 * rather than a guessed pair.
 */
export function resolveTransportLinePoints(
  snapshots: ReadonlyArray<PricingSnapshot | null | undefined>,
  requests: readonly InvoiceTransportRequest[],
): Array<InvoiceTransportPoints | null> {
  const requestsById = new Map(requests.map((request) => [request.id, request]))
  // A trip some line names outright is that line's — never offered to an unstamped sibling.
  const claimed = new Set(
    snapshots
      .map((snapshot) => snapshot?.transportRequestId)
      .filter((id): id is string => Boolean(id) && requestsById.has(id ?? "")),
  )

  return snapshots.map((snapshot) => {
    if (!isTransportLine(snapshot)) return null

    if (snapshot.transportRequestId) {
      const request = requestsById.get(snapshot.transportRequestId)
      // A stamped trip that has since been deleted: the heuristic could only pick a different one.
      return request ? agreedPoints([request]) : null
    }

    if (!snapshot.legId) return null
    const legRequests = requests.filter(
      (request) =>
        request.service_id === snapshot.legId &&
        request.service_type === snapshot.serviceType &&
        !claimed.has(request.id),
    )
    const fromLeg = agreedPoints(legRequests)
    if (fromLeg) return fromLeg

    // Several trips on the service: keep the ones this line could have priced. A request with no
    // vehicle of its own priced on the leg's, and one with no pick-up time priced on the leg's date.
    const travelDate = snapshot.travelDate?.slice(0, 10) || null
    const narrowed = legRequests.filter((request) => {
      const vehicleMatches =
        !request.suite_type_id || !snapshot.suiteTypeId || request.suite_type_id === snapshot.suiteTypeId
      const pickupDate = dateOnly(request.pickup_at)
      const dateMatches = !pickupDate || !travelDate || pickupDate === travelDate
      return vehicleMatches && dateMatches
    })
    return agreedPoints(narrowed)
  })
}
