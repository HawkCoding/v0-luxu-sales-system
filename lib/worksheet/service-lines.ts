import { addDays, trainArrivalDate } from "@/lib/packages/hotel-dates"
import { firstRecord } from "@/lib/utils"
import {
  mapSupplierKindToServiceType,
  resolveVoucherRouteName,
  type RouteNameJoin,
} from "@/lib/voucher/build-service-blocks"
import type { WorksheetServiceLine } from "@/lib/worksheet/pdf/worksheet-document"

type Join<T> = T | T[] | null | undefined

/** The route fields the worksheet loads: `duration_days` for its own end-date math, plus
 * everything `resolveVoucherRouteName` needs to name the leg the way client documents do. */
type WorksheetRouteJoin = RouteNameJoin & { duration_days: number | null }

/** A booked room/suite's type name — the only unit field the worksheet's description needs. */
type WorksheetSuiteJoin = Join<{ name: string | null }>

/** The `booking_services` shape the worksheet loads — the booking's real itinerary. */
export interface WorksheetServiceRow {
  id: string
  supplier_id: string | null
  sort_order: number
  service_date: string | null
  nights: number | null
  arrival_date: string | null
  supplier_reference: string | null
  notes: string | null
  route_reversed?: boolean | null
  /** The supplier-booking record for this leg — when it was placed, confirmed and paid with the
   * supplier. Internal only; feeds this grid's admin-date columns. */
  booking_date: string | null
  confirmation_date: string | null
  payment_made_date: string | null
  paid_with: string | null
  suppliers: Join<{ name: string; kind: string }>
  routes: Join<WorksheetRouteJoin>
  /** Legacy pre-cutover hotel rows with no per-room units — see resolveRoomNames. */
  suite_types?: WorksheetSuiteJoin
  /** Hotel legs only: one row per booked room, carrying whether its first night was gifted and
   * which room type was chosen. */
  units?: Join<{ complimentary_first_night: boolean; suite_types?: WorksheetSuiteJoin }>
}

/** A captured transfer/rental/flight trip. `service_id` links it back to its service row, whose
 * admin dates it inherits — a trip has no supplier-booking record of its own. */
export interface WorksheetTransportRow {
  service_id: string | null
  supplier_id: string | null
  sort_order: number
  pickup_at: string | null
  notes: string | null
  supplier_reference: string | null
  complimentary: boolean
  suppliers: Join<{ name: string }>
}

export interface BuildWorksheetServiceLinesInput {
  services: readonly WorksheetServiceRow[]
  transportRequests: readonly WorksheetTransportRow[]
}

/**
 * End date of a service. Every kind derives it differently and none of them store it directly
 * (except a flight, whose overnight arrival no offset could know) — the rules mirror
 * `buildVoucherServiceBlocks` so the worksheet and the voucher never disagree about a date.
 */
function resolveToDate(
  serviceType: string,
  serviceDate: string | null,
  nights: number | null,
  arrivalDate: string | null,
  durationDays: number | null,
): string | null {
  if (serviceType === "airline") return arrivalDate
  if (!serviceDate) return null
  if (serviceType === "hotel") return nights && nights > 0 ? addDays(serviceDate, nights) : null
  // An unconfigured route duration leaves this blank rather than silently claiming a same-day
  // arrival on a multi-day train.
  if (durationDays && durationDays > 0) return trainArrivalDate(serviceDate, durationDays)
  return null
}

/**
 * Prefixes a hotel line's notes with the nights the hotel gifted, so whoever confirms the booking
 * with the property sees the deal that was quoted rather than only the stay length. Counted per
 * room, matching how the gift is captured (see suite-leg-editor.tsx).
 */
function complimentaryNote(
  service: WorksheetServiceRow,
  serviceType: string,
  notes: string | null,
): string | null {
  if (serviceType !== "hotel") return notes
  const units = service.units ? (Array.isArray(service.units) ? service.units : [service.units]) : []
  const gifted = units.filter((unit) => unit.complimentary_first_night).length
  if (gifted === 0) return notes

  const note =
    gifted === 1
      ? "First night complimentary"
      : `First night complimentary on ${gifted} rooms`
  return notes?.trim() ? `${note} — ${notes.trim()}` : note
}

/** Prefixes a transfer trip's notes with "Complimentary" when the trip was marked comped — same
 * reasoning as complimentaryNote for hotels, just per-request rather than per-room. */
function complimentaryTransportNote(request: WorksheetTransportRow, notes: string | null): string | null {
  if (!request.complimentary) return notes
  return notes?.trim() ? `Complimentary — ${notes.trim()}` : "Complimentary"
}

/** Room type name(s) booked on a hotel leg, deduped — per-room `units` when present, falling back
 * to the leg's own `suite_type_id` for legacy pre-cutover rows with no unit children (mirrors the
 * fallback in `resolveLegSuiteNames`, minus the bed/bathroom composition the worksheet doesn't need). */
function resolveRoomNames(service: WorksheetServiceRow): string[] {
  const units = service.units ? (Array.isArray(service.units) ? service.units : [service.units]) : []
  const unitNames = units
    .map((unit) => firstRecord(unit.suite_types)?.name)
    .filter((name): name is string => Boolean(name))
  if (unitNames.length > 0) return Array.from(new Set(unitNames))

  const legacyName = firstRecord(service.suite_types)?.name
  return legacyName ? [legacyName] : []
}

/** "Rovos Rail — Pretoria → Cape Town" for a train leg, "Grand Hotel — Deluxe Suite" for a hotel
 * leg (multiple distinct rooms join with a comma), or just the supplier name for everything else —
 * the worksheet's Service Description column. */
function resolveServiceDescription(service: WorksheetServiceRow, serviceType: string, supplierName: string): string {
  if (serviceType === "train") {
    const routeName = resolveVoucherRouteName(firstRecord(service.routes), service.route_reversed ?? false)
    return routeName ? `${supplierName} — ${routeName}` : supplierName
  }
  if (serviceType === "hotel") {
    const roomNames = resolveRoomNames(service)
    return roomNames.length > 0 ? `${supplierName} — ${roomNames.join(", ")}` : supplierName
  }
  return supplierName
}

/**
 * Flattens a booking's services and captured trips into the worksheet's service-line grid.
 *
 * The worksheet is an internal hand-finished document: the description is the supplier name, plus
 * the route booked (trains) or room booked (hotels) — everything financial is left blank for pen.
 * The admin dates come from the service row itself; a captured trip inherits its parent leg's.
 */
export function buildWorksheetServiceLines({
  services,
  transportRequests,
}: BuildWorksheetServiceLinesInput): WorksheetServiceLine[] {
  const serviceById = new Map(services.map((service) => [service.id, service]))

  const adminDatesOf = (service: WorksheetServiceRow | undefined) => ({
    bookingDate: service?.booking_date ?? null,
    confirmationDate: service?.confirmation_date ?? null,
    paymentMadeDate: service?.payment_made_date ?? null,
    paidWith: service?.paid_with ?? null,
  })

  const transportLine = (request: WorksheetTransportRow): WorksheetServiceLine => ({
    fromDate: request.pickup_at ? request.pickup_at.slice(0, 10) : null,
    toDate: null,
    description: firstRecord(request.suppliers)?.name ?? "",
    reservationReference: request.supplier_reference,
    notes: complimentaryTransportNote(request, request.notes),
    // An orphan trip (no service_id, or one outside this booking) gets no admin dates — nobody
    // recorded a supplier booking for it. It does not fall back to any other leg's.
    ...adminDatesOf(request.service_id ? serviceById.get(request.service_id) : undefined),
  })

  const orderedServices = [...services].sort((a, b) => a.sort_order - b.sort_order)
  const orderedRequests = [...transportRequests].sort((a, b) => a.sort_order - b.sort_order)

  const lines: WorksheetServiceLine[] = orderedServices.flatMap((service) => {
    const supplier = firstRecord(service.suppliers)
    const serviceType = mapSupplierKindToServiceType(supplier?.kind ?? null)

    // A transfer leg is only a container: the trips captured against it are the real lines, so
    // emitting both would double-count every transfer (mirrors buildVoucherServiceBlocks).
    if (serviceType === "transfer") {
      const legRequests = orderedRequests.filter((request) => request.service_id === service.id)
      if (legRequests.length > 0) return legRequests.map(transportLine)
    }

    return [
      {
        fromDate: service.service_date,
        toDate: resolveToDate(
          serviceType,
          service.service_date,
          service.nights,
          service.arrival_date,
          firstRecord(service.routes)?.duration_days ?? null,
        ),
        description: resolveServiceDescription(service, serviceType, supplier?.name ?? ""),
        reservationReference: service.supplier_reference,
        notes: complimentaryNote(service, serviceType, service.notes),
        ...adminDatesOf(service),
      },
    ]
  })

  // Trips typed straight onto the booking never hang off a service row, so nothing above emits
  // them — they are lines in their own right.
  const serviceIds = new Set(orderedServices.map((service) => service.id))
  for (const request of orderedRequests) {
    if (!request.service_id || !serviceIds.has(request.service_id)) {
      lines.push(transportLine(request))
    }
  }

  return lines.sort((a, b) => {
    if (!a.fromDate) return 1
    if (!b.fromDate) return -1
    return a.fromDate.localeCompare(b.fromDate)
  })
}
