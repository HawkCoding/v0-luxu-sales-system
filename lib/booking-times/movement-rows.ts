import type { SupabaseClient } from "@supabase/supabase-js"
import { formatDateISO, formatTimeHHMM } from "@/lib/date-format"
import { toHoursMinutes } from "@/lib/routes/route-schedule"
import type { Database } from "@/lib/supabase/types"
import { firstRecord } from "@/lib/utils"

/**
 * Every timed movement on a booking, in one flat list the Transfer Times tab edits.
 *
 * Two tables back it, because a flight and a transfer are stored differently: a flight is a priced
 * `booking_services` leg carrying its own wall-clock schedule, a transfer/rental is a
 * `booking_transport_requests` row carrying `pickup_at` as a real instant. The row shape here
 * hides that split so the tab renders one list and PATCHes one contract.
 *
 * Trains are deliberately absent: their schedule belongs to the route on the supplier record and is
 * shared by every booking on it, so re-timing one here would silently re-time the others. Courier
 * is absent because nothing models it yet. Both slot in as new `MovementType` values without
 * changing this shape.
 */

export type MovementRowKind = "service" | "transport_request"

/** What kind of movement a row is — the label, the editable fields and the icon all key off it. */
export type MovementType = "flight" | "transfer" | "rental"

export interface MovementTimeRow {
  /** Stable across a reload; `${kind}:${id}`. */
  key: string
  kind: MovementRowKind
  movementType: MovementType
  /** The booking_services id for a "service" row, the request's own id for "transport_request". */
  id: string
  label: string
  supplierName: string | null
  /** YYYY-MM-DD. Departure for a flight, pickup day for a transfer/rental. */
  departureDate: string | null
  /** HH:MM. */
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  flightNumber: string | null
  departureAirportCode: string | null
  arrivalAirportCode: string | null
  /** Whether this movement has an arrival half at all — false for a one-way transfer, which has a
   * pickup and nothing to return to. */
  hasArrival: boolean
  /** Flights carry a flight number and airport codes; transfers and rentals do not. */
  hasFlightIdentity: boolean
  updatedAt: string | null
}

interface ServiceRow {
  id: string
  label: string | null
  sort_order: number
  service_date: string | null
  departure_time: string | null
  arrival_date: string | null
  arrival_time: string | null
  flight_number: string | null
  departure_airport_code: string | null
  arrival_airport_code: string | null
  updated_at: string | null
  suppliers: { name: string | null; kind: string | null } | { name: string | null; kind: string | null }[] | null
  routes:
    | { name: string | null } | { name: string | null }[]
    | null
}

interface TransportRow {
  id: string
  service_id: string | null
  service_type: string
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  flight_number: string | null
  sort_order: number
  updated_at: string | null
  suppliers: { name: string | null } | { name: string | null }[] | null
  rental_details: { return_at: string | null } | { return_at: string | null }[] | null
}

function flightLabel(row: ServiceRow, supplierName: string | null): string {
  const route = firstRecord(row.routes)?.name?.trim() || null
  const named = row.label?.trim() || supplierName || "Flight"
  return route ? `${named} — ${route}` : named
}

function transportLabel(request: TransportRow): string {
  const verb = request.service_type === "rental" ? "Vehicle rental" : "Transfer"
  const pickup = request.pickup_point.trim()
  const dropoff = request.dropoff_point.trim()
  return pickup && dropoff ? `${verb}: ${pickup} → ${dropoff}` : verb
}

export interface LoadMovementTimeRowsOptions {
  /** Restricts service rows to the legs an accepted quote priced, and drops transport requests
   * tied to no leg — same convention as `loadLegReferenceRows` and `buildVoucherServiceBlocks`.
   * Omit (or pass an empty set) to list everything on the booking. */
  legIds?: Set<string>
}

export async function loadMovementTimeRows(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  options: LoadMovementTimeRowsOptions = {},
): Promise<MovementTimeRow[]> {
  const { legIds } = options
  const inScope = legIds && legIds.size > 0 ? (legId: string) => legIds.has(legId) : () => true

  const [
    { data: serviceRows, error: servicesError },
    { data: transportRows, error: transportError },
  ] = await Promise.all([
    supabase
      .from("booking_services")
      .select(
        "id, label, sort_order, service_date, departure_time, arrival_date, arrival_time, flight_number, departure_airport_code, arrival_airport_code, updated_at, suppliers(name, kind), routes(name)",
      )
      .eq("booking_id", bookingId)
      .eq("selected", true),
    supabase
      .from("booking_transport_requests")
      .select(
        "id, service_id, service_type, pickup_point, dropoff_point, pickup_at, flight_number, sort_order, updated_at, suppliers(name), rental_details:booking_vehicle_rental_details(return_at)",
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true }),
  ])

  if (servicesError) throw servicesError
  if (transportError) throw transportError

  const services = (serviceRows ?? []) as unknown as ServiceRow[]
  const transportRequests = (transportRows ?? []) as unknown as TransportRow[]

  const flightRows = services
    .filter((row) => inScope(row.id) && firstRecord(row.suppliers)?.kind === "airline")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => {
      const supplierName = firstRecord(row.suppliers)?.name ?? null
      return {
        key: `service:${row.id}`,
        kind: "service" as const,
        movementType: "flight" as const,
        id: row.id,
        label: flightLabel(row, supplierName),
        supplierName,
        departureDate: row.service_date,
        // Postgres returns a `time` as "HH:MM:SS"; the editor and the API both speak HH:MM.
        departureTime: toHoursMinutes(row.departure_time),
        arrivalDate: row.arrival_date,
        arrivalTime: toHoursMinutes(row.arrival_time),
        flightNumber: row.flight_number,
        departureAirportCode: row.departure_airport_code,
        arrivalAirportCode: row.arrival_airport_code,
        hasArrival: true,
        hasFlightIdentity: true,
        updatedAt: row.updated_at,
      }
    })

  const transportRowsOut = transportRequests
    .filter((request) => {
      const legId = request.service_id
      if (!legId) return !legIds || legIds.size === 0
      return inScope(legId)
    })
    .map((request) => {
      const rental = firstRecord(request.rental_details)
      const isRental = request.service_type === "rental"
      // A legacy service_type='flight' request predates flight legs carrying their own schedule.
      // It is listed rather than hidden, so a booking captured that way is still re-timeable.
      const isLegacyFlight = request.service_type === "flight"
      return {
        key: `transport_request:${request.id}`,
        kind: "transport_request" as const,
        movementType: (isRental ? "rental" : isLegacyFlight ? "flight" : "transfer") as MovementType,
        id: request.id,
        label: isLegacyFlight ? `Flight: ${request.pickup_point} → ${request.dropoff_point}` : transportLabel(request),
        supplierName: firstRecord(request.suppliers)?.name ?? null,
        // pickup_at is a real instant, so it is split in APP_TIME_ZONE — reading the calendar date
        // straight off the ISO string would print the wrong day near local midnight.
        departureDate: formatDateISO(request.pickup_at),
        departureTime: formatTimeHHMM(request.pickup_at),
        arrivalDate: isRental ? formatDateISO(rental?.return_at) : null,
        arrivalTime: isRental ? formatTimeHHMM(rental?.return_at) : null,
        flightNumber: request.flight_number,
        departureAirportCode: null,
        arrivalAirportCode: null,
        hasArrival: isRental,
        hasFlightIdentity: false,
        updatedAt: request.updated_at,
      }
    })

  return [...flightRows, ...transportRowsOut]
}
