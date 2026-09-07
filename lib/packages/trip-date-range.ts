import { legStatesOwnSpan, type PackageDetail, type PackageLeg } from "@/lib/types"
import type { ApplyLegState } from "@/lib/packages/apply-dialog-state"
import { addDays, trainArrivalDate } from "@/lib/packages/hotel-dates"
import { formatDateISO } from "@/lib/date-format"

/**
 * Trip start/end dates derived from the dated services on a booking.
 *
 * Rather than asking the salesperson to pick trip dates upfront (before they know them), the
 * range is pure math over the services they configure:
 *
 *   train        → departure … arrival (departure + route durationDays, counting departure day)
 *   hotel        → check-in … check-out (check-in + nights, floored at 1 night)
 *   airline      → departure date … captured arrival date (same day when uncaptured)
 *   tour         → service date … service date + nights (single day when nights is unset/0 --
 *                  see legStatesOwnSpan: a tour states its own length the same way a hotel does,
 *                  not off a route duration, since a tour's route carries none)
 *   transfer     → pickup date
 *   rental       → pickup date … return date
 *
 * Trip start = earliest span start, trip end = latest span end. Services without a date simply
 * don't contribute. The same function runs client-side (live summary in the build/apply dialogs)
 * and server-side (persisting bookings.trip_start_date / trip_end_date).
 */

export interface ServiceDateSpan {
  /** YYYY-MM-DD */
  start: string
  /** YYYY-MM-DD, >= start */
  end: string
}

export interface TripDateRange {
  start: string | null
  end: string | null
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value)
}

/** Calendar date of a stored timestamp, read in APP_TIME_ZONE ("2026-11-17T22:00:00Z" is a 00:00
 *  SAST pickup, so it is 2026-11-18, not the UTC-slice 2026-11-17 — see F-P3-5). A bare date-only
 *  string ("2026-08-20") passes through unchanged; it has no instant to convert. */
export function dateOnly(value: string | null | undefined): string | null {
  return formatDateISO(value)
}

/** Min start / max end over the spans; null/null when nothing is dated. */
export function deriveTripDateRange(spans: ServiceDateSpan[]): TripDateRange {
  let start: string | null = null
  let end: string | null = null
  for (const span of spans) {
    if (!isIsoDate(span.start)) continue
    const spanEnd = isIsoDate(span.end) && span.end >= span.start ? span.end : span.start
    if (start === null || span.start < start) start = span.start
    if (end === null || spanEnd > end) end = spanEnd
  }
  return { start, end }
}

/** Whole nights between two ISO dates; null when either is missing or the range is inverted. */
export function nightsBetween(start: string | null, end: string | null): number | null {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return null
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

interface SpanInput {
  supplierKind: string
  serviceDate: string | null
  /** Hotel legs: stay length. */
  nights: number | null
  /** Selected route's durationDays (train/tour legs). */
  routeDurationDays: number | null
  /** Airline legs: the captured arrival date. An overnight flight ends on a day no route duration
   * models, so when it is set it defines the span end outright. */
  arrivalDate?: string | null
}

/** The span a single dated service covers, or null when it has no usable date. */
export function serviceDateSpan(input: SpanInput): ServiceDateSpan | null {
  if (!isIsoDate(input.serviceDate)) return null
  const start = input.serviceDate

  if (legStatesOwnSpan(input.supplierKind)) {
    // A stay always covers at least one night; a tour that starts and ends the same day
    // legitimately spans zero, so only the hotel floors at 1.
    const floor = input.supplierKind === "hotel_property" ? 1 : 0
    const nights = Math.max(floor, Math.floor(input.nights ?? floor))
    return { start, end: nights > 0 ? addDays(start, nights) : start }
  }

  // A captured flight arrival is a fact, not a derivation — it beats the route duration below,
  // which for an airline route is never configured anyway.
  if (isIsoDate(input.arrivalDate) && input.arrivalDate >= start) {
    return { start, end: input.arrivalDate }
  }

  // trainArrivalDate treats a missing/zero duration as a single-day service (end = start).
  return { start, end: trainArrivalDate(start, input.routeDurationDays) }
}

/** The durationDays of a leg's chosen route (or its only route, when there's just the one) — the
 *  same fallback `serviceDateSpan` callers use, exported for the transfer date anchor (see
 *  lib/packages/transfer-dates.ts), which reads it for the leg a transfer anchors to. */
export function selectedRouteDurationDays(leg: PackageLeg | undefined, routeId: string | null): number | null {
  if (!leg) return null
  const route = leg.routes.find((candidate) => candidate.id === routeId) ?? (leg.routes.length === 1 ? leg.routes[0] : undefined)
  return route?.durationDays ?? null
}

/**
 * Spans for the dialog's leg states — selected legs only (a deselected service must not stretch
 * the trip). Transport legs contribute each request's pickup/return dates.
 */
export function legStateDateSpans(detail: PackageDetail, states: ApplyLegState[]): ServiceDateSpan[] {
  const legById = new Map(detail.legs.map((leg) => [leg.id, leg]))
  const spans: ServiceDateSpan[] = []

  for (const state of states) {
    if (!state.selected) continue

    if (state.kind === "suite") {
      const span = serviceDateSpan({
        supplierKind: state.supplierKind,
        serviceDate: state.serviceDate,
        nights: state.nights,
        routeDurationDays: selectedRouteDurationDays(legById.get(state.legId), state.routeId),
        arrivalDate: state.arrivalDate,
      })
      if (span) spans.push(span)
      continue
    }

    for (const request of state.requests) {
      const pickup = dateOnly(request.pickupAt)
      const returnDate = dateOnly(request.rentalDetails?.returnAt)
      const start = pickup ?? returnDate
      if (!start) continue
      const end = returnDate && returnDate >= start ? returnDate : start
      spans.push({ start, end })
    }
  }

  return spans
}

/** Live dialog summary: derived range for the configure step. */
export function deriveTripDateRangeFromStates(
  detail: PackageDetail,
  states: ApplyLegState[],
): TripDateRange {
  return deriveTripDateRange(legStateDateSpans(detail, states))
}
