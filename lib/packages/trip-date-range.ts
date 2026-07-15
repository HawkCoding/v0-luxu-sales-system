import type { PackageDetail, PackageLeg } from "@/lib/types"
import type { ApplyLegState } from "@/lib/packages/apply-dialog-state"
import { addDays, trainArrivalDate } from "@/lib/packages/hotel-dates"

/**
 * Trip start/end dates derived from the dated services on a booking.
 *
 * Rather than asking the salesperson to pick trip dates upfront (before they know them), the
 * range is pure math over the services they configure:
 *
 *   train        → departure … arrival (departure + route durationDays, counting departure day)
 *   hotel        → check-in … check-out (check-in + nights)
 *   tour/airline → service date … service date + route durationDays (single day when unset)
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

/** Date part of a stored timestamp ("2026-08-20T14:00:00+00:00" → "2026-08-20"). */
export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const candidate = value.slice(0, 10)
  return isIsoDate(candidate) ? candidate : null
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
}

/** The span a single dated service covers, or null when it has no usable date. */
export function serviceDateSpan(input: SpanInput): ServiceDateSpan | null {
  if (!isIsoDate(input.serviceDate)) return null
  const start = input.serviceDate

  if (input.supplierKind === "hotel_property") {
    const nights = Math.max(1, Math.floor(input.nights ?? 1))
    return { start, end: addDays(start, nights) }
  }

  // trainArrivalDate treats a missing/zero duration as a single-day service (end = start).
  return { start, end: trainArrivalDate(start, input.routeDurationDays) }
}

function selectedRouteDurationDays(leg: PackageLeg | undefined, routeId: string | null): number | null {
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
