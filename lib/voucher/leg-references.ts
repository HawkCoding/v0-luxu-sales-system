import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { firstRecord } from "@/lib/utils"

/** Package legs of these supplier kinds have no reference of their own — the transport-request
 * rows they seed are the actual bookings a supplier confirmation belongs to. */
const TRANSPORT_SUPPLIER_KINDS = new Set(["transfers", "vehicle_rental"])

export type LegReferenceKind = "selection" | "service" | "transport_request"

export interface LegReferenceRow {
  key: string
  kind: LegReferenceKind
  /** package_leg_id for a "selection" row, the transport request's own id for "transport_request". */
  id: string
  label: string
  supplierName: string | null
  supplierReference: string | null
}

interface SelectionRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_reference: string | null
  package_legs: { label: string | null; sort_order: number } | { label: string | null; sort_order: number }[] | null
  suppliers: { name: string | null; kind: string | null } | { name: string | null; kind: string | null }[] | null
}

interface BookingServiceRow {
  id: string
  label: string | null
  sort_order: number
  selected: boolean
  supplier_reference: string | null
  suppliers: { name: string | null; kind: string | null } | { name: string | null; kind: string | null }[] | null
}

interface TransportRequestRow {
  id: string
  package_leg_id: string | null
  service_type: string
  pickup_point: string
  dropoff_point: string
  sort_order: number
  supplier_reference: string | null
  suppliers: { name: string | null } | { name: string | null }[] | null
}

function transportLabel(request: TransportRequestRow): string {
  const verb = request.service_type === "rental" ? "Vehicle rental" : "Transfer"
  const pickup = request.pickup_point.trim()
  const dropoff = request.dropoff_point.trim()
  return pickup && dropoff ? `${verb}: ${pickup} → ${dropoff}` : verb
}

/** Every leg/trip that will render as its own block on the voucher, in one flat list: selected
 * package legs (hotel/train/tour/airline) plus every transfer/rental trip (leg-tied or manual). */
export async function loadLegReferenceRows(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<LegReferenceRow[]> {
  const [
    { data: selectionRows, error: selectionsError },
    { data: serviceRows, error: servicesError },
    { data: transportRows, error: transportError },
  ] = await Promise.all([
    supabase
      .from("booking_package_selections")
      .select(
        "id, package_leg_id, selected, supplier_reference, package_legs(label, sort_order), suppliers(name, kind)",
      )
      .eq("booking_id", bookingId)
      .eq("selected", true),
    // Build Booking's per-booking equivalent of the above -- a booking uses one or the other,
    // never both, so merging is safe and lets this reader stay agnostic of which was used.
    supabase
      .from("booking_services")
      .select("id, label, sort_order, selected, supplier_reference, suppliers(name, kind)")
      .eq("booking_id", bookingId)
      .eq("selected", true),
    supabase
      .from("booking_transport_requests")
      .select(
        "id, package_leg_id, service_type, pickup_point, dropoff_point, sort_order, supplier_reference, suppliers(name)",
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true }),
  ])

  if (selectionsError) throw selectionsError
  if (servicesError) throw servicesError
  if (transportError) throw transportError

  const selections = (selectionRows ?? []) as unknown as SelectionRow[]
  const services = (serviceRows ?? []) as unknown as BookingServiceRow[]
  const transportRequests = (transportRows ?? []) as unknown as TransportRequestRow[]

  const selectionRowsOut = selections
    .filter((row) => {
      const kind = firstRecord(row.suppliers)?.kind ?? null
      return !kind || !TRANSPORT_SUPPLIER_KINDS.has(kind)
    })
    .map((row) => {
      const leg = firstRecord(row.package_legs)
      const supplier = firstRecord(row.suppliers)
      return {
        row: {
          key: `selection:${row.id}`,
          kind: "selection" as const,
          id: row.package_leg_id,
          label: leg?.label?.trim() || supplier?.name || "Leg",
          supplierName: supplier?.name ?? null,
          supplierReference: row.supplier_reference,
        },
        sortOrder: leg?.sort_order ?? 0,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.row)

  const serviceRowsOut = services
    .filter((row) => {
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
        },
        sortOrder: row.sort_order,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.row)

  const transportRowsOut = transportRequests.map((request) => {
    const supplier = firstRecord(request.suppliers)
    return {
      key: `transport_request:${request.id}`,
      kind: "transport_request" as const,
      id: request.id,
      label: transportLabel(request),
      supplierName: supplier?.name ?? null,
      supplierReference: request.supplier_reference,
    }
  })

  return [...selectionRowsOut, ...serviceRowsOut, ...transportRowsOut]
}

export function missingLegReferenceLabels(rows: LegReferenceRow[]): string[] {
  return rows.filter((row) => !row.supplierReference?.trim()).map((row) => row.label)
}
