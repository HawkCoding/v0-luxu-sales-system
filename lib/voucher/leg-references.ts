import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { firstRecord } from "@/lib/utils"

/** Legs of these supplier kinds have no reference of their own — the transport-request
 * rows they seed are the actual bookings a supplier confirmation belongs to. */
const TRANSPORT_SUPPLIER_KINDS = new Set(["transfers", "vehicle_rental"])

export type LegReferenceKind = "service" | "transport_request"

export interface LegReferenceRow {
  key: string
  kind: LegReferenceKind
  /** The booking_services id for a "service" row, the transport request's own id for
   * "transport_request". */
  id: string
  label: string
  supplierName: string | null
  supplierReference: string | null
  /** Named contact next to the reference, e.g. "Carla" — falls back to the supplier's own
   * default_contact_name when the leg hasn't set its own. */
  supplierContactName: string | null
  /** One-off operational caveat, e.g. "Check in IRENE COUNTRY LODGE 2h prior to departure". */
  voucherFootnote: string | null
  /** Only meaningful for "service" rows on a train leg — excursions are otherwise always []. */
  excursions: string[]
}

interface BookingServiceRow {
  id: string
  label: string | null
  sort_order: number
  selected: boolean
  supplier_reference: string | null
  supplier_contact_name: string | null
  voucher_footnote: string | null
  excursions: string[] | null
  suppliers:
    | { name: string | null; kind: string | null; default_contact_name: string | null }
    | { name: string | null; kind: string | null; default_contact_name: string | null }[]
    | null
}

interface TransportRequestRow {
  id: string
  /** The booking_services row this trip belongs to, or null for a manually-added trip. */
  service_id: string | null
  service_type: string
  pickup_point: string
  dropoff_point: string
  sort_order: number
  supplier_reference: string | null
  supplier_contact_name: string | null
  voucher_footnote: string | null
  suppliers:
    | { name: string | null; default_contact_name: string | null }
    | { name: string | null; default_contact_name: string | null }[]
    | null
}

function transportLabel(request: TransportRequestRow): string {
  const verb =
    request.service_type === "rental" ? "Vehicle rental" : request.service_type === "flight" ? "Flight" : "Transfer"
  const pickup = request.pickup_point.trim()
  const dropoff = request.dropoff_point.trim()
  return pickup && dropoff ? `${verb}: ${pickup} → ${dropoff}` : verb
}

export interface LoadLegReferenceOptions {
  /** Restricts the rows to legs priced into the accepted quote, so the readiness gate never
   * demands a supplier reference for a service the customer did not buy. Leg-linked transport
   * requests follow their leg; unlinked ones are dropped entirely, since they can never have
   * been priced. Omit (or pass an empty set) to list everything on the booking. */
  legIds?: Set<string>
}

/** Every leg/trip that will render as its own block on the voucher, in one flat list: selected
 * package legs (hotel/train/tour/airline) plus every transfer/rental trip (leg-tied or manual). */
export async function loadLegReferenceRows(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  options: LoadLegReferenceOptions = {},
): Promise<LegReferenceRow[]> {
  const { legIds } = options
  // An empty set means "this quote priced no legs" (manual quote), which stays unfiltered —
  // same convention as `buildVoucherServiceBlocks`.
  const inScope = legIds && legIds.size > 0 ? (legId: string) => legIds.has(legId) : () => true
  const [
    { data: serviceRows, error: servicesError },
    { data: transportRows, error: transportError },
  ] = await Promise.all([
    supabase
      .from("booking_services")
      .select(
        "id, label, sort_order, selected, supplier_reference, supplier_contact_name, voucher_footnote, excursions, suppliers(name, kind, default_contact_name)",
      )
      .eq("booking_id", bookingId)
      .eq("selected", true),
    supabase
      .from("booking_transport_requests")
      .select(
        "id, service_id, service_type, pickup_point, dropoff_point, sort_order, supplier_reference, supplier_contact_name, voucher_footnote, suppliers(name, default_contact_name)",
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true }),
  ])

  if (servicesError) throw servicesError
  if (transportError) throw transportError

  const services = (serviceRows ?? []) as unknown as BookingServiceRow[]
  const transportRequests = (transportRows ?? []) as unknown as TransportRequestRow[]

  const serviceRowsOut = services
    .filter((row) => {
      // A Build Booking service row is its own leg, so its id is what a quote snapshot records.
      if (!inScope(row.id)) return false
      const kind = firstRecord(row.suppliers)?.kind ?? null
      return !kind || !TRANSPORT_SUPPLIER_KINDS.has(kind)
    })
    .map((row) => {
      const supplier = firstRecord(row.suppliers)
      return {
        row: {
          key: `service:${row.id}`,
          kind: "service" as const,
          id: row.id,
          label: row.label?.trim() || supplier?.name || "Leg",
          supplierName: supplier?.name ?? null,
          supplierReference: row.supplier_reference,
          supplierContactName: row.supplier_contact_name ?? supplier?.default_contact_name ?? null,
          voucherFootnote: row.voucher_footnote ?? null,
          excursions: row.excursions ?? [],
        },
        sortOrder: row.sort_order,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.row)

  const transportRowsOut = transportRequests
    .filter((request) => {
      const legId = request.service_id
      // Unlinked requests were never priced into any quote, so a scoped caller drops them
      // (mirrors `includeUnlinkedTransportRequests` in buildVoucherServiceBlocks).
      if (!legId) return !legIds || legIds.size === 0
      return inScope(legId)
    })
    .map((request) => {
      const supplier = firstRecord(request.suppliers)
      return {
        key: `transport_request:${request.id}`,
        kind: "transport_request" as const,
        id: request.id,
        label: transportLabel(request),
        supplierName: supplier?.name ?? null,
        supplierReference: request.supplier_reference,
        supplierContactName: request.supplier_contact_name ?? supplier?.default_contact_name ?? null,
        voucherFootnote: request.voucher_footnote ?? null,
        excursions: [],
      }
    })

  return [...serviceRowsOut, ...transportRowsOut]
}

export function missingLegReferenceLabels(rows: LegReferenceRow[]): string[] {
  return rows.filter((row) => !row.supplierReference?.trim()).map((row) => row.label)
}
