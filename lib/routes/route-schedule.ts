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
