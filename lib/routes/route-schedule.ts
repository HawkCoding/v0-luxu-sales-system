import type { RouteDirectionMode } from "@/lib/types"

/** The four `time` columns on `routes`, as Postgres returns them ("HH:MM:SS"). */
export interface RouteScheduleColumns {
  departure_time: string | null
  arrival_time: string | null
  return_departure_time: string | null
  return_arrival_time: string | null
}

export interface RouteSchedule {
  startTime: string | null
  endTime: string | null
}

/** Postgres `time` comes back as "HH:MM:SS"; every client-facing surface prints "HH:MM". */
export function toHoursMinutes(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 5)
}

/**
 * The times a booking actually travels on.
 *
 * A two-way route is a single row (A <-> B) and `route_reversed` records the booked direction, so a
 * reversed leg must print the return pair — the outbound departure says nothing about when the
 * return leaves. The return pair falls back to the outbound one when it was never captured, which
 * is better than printing nothing on a document that has a real, if unconfirmed, schedule.
 */
export function resolveRouteSchedule(
  route: Partial<RouteScheduleColumns> | null | undefined,
  reversed: boolean,
): RouteSchedule {
  if (!route) return { startTime: null, endTime: null }

  const outbound: RouteSchedule = {
    startTime: toHoursMinutes(route.departure_time),
    endTime: toHoursMinutes(route.arrival_time),
  }
  if (!reversed) return outbound

  return {
    startTime: toHoursMinutes(route.return_departure_time) ?? outbound.startTime,
    endTime: toHoursMinutes(route.return_arrival_time) ?? outbound.endTime,
  }
}

/** Whether a route's return-leg times are meaningful at all. One-way routes never travel back. */
export function routeHasReturnLeg(directionMode: RouteDirectionMode | null | undefined): boolean {
  return directionMode === "round_trip"
}

/** A train operator's times for the leg a booking travels with them. */
export interface SupplierRouteSchedule {
  supplierId: string
  departureTime: string | null
  arrivalTime: string | null
}

export interface TrainLegRow {
  supplier_id: string | null
  route_reversed: boolean | null
  supplierKind: string | null
  route: Partial<RouteScheduleColumns> | null
}

/**
 * One schedule per train operator on a booking, each resolved for the direction *that leg* travels.
 *
 * The leg's own `route_reversed` is the only trustworthy source at enquiry stage:
 * `bookings.route_reversed` is not written until a quote exists (lib/quotes/resolve-primary-route.ts),
 * so reading the booking would prefill the outbound times onto a reversed journey.
 *
 * Legs arrive in sort order and the first leg per operator wins; the times are a starting point a
 * consultant can overwrite, so guessing between two legs of the same operator is not worth it.
 */
export function buildSupplierRouteSchedules(legs: TrainLegRow[]): SupplierRouteSchedule[] {
  const schedules: SupplierRouteSchedule[] = []
  for (const leg of legs) {
    if (leg.supplierKind !== "train_operator" || !leg.supplier_id) continue
    if (schedules.some((entry) => entry.supplierId === leg.supplier_id)) continue
    const { startTime, endTime } = resolveRouteSchedule(leg.route, leg.route_reversed ?? false)
    if (!startTime && !endTime) continue
    schedules.push({ supplierId: leg.supplier_id, departureTime: startTime, arrivalTime: endTime })
  }
  return schedules
}
