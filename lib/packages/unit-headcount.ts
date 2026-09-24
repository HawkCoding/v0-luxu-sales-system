import type { SupplierKind } from "@/lib/types"
import { SUPPLIER_VOCABULARY } from "@/lib/types"

/** Kinds whose per-unit counts MAY differ from the booking's traveller totals -- an extra ticket on
 * one flight, a hotel room for a guest joining only that stay, a cabin for part of the party. They
 * price off their own counts; a difference is surfaced as an amber, non-blocking warning (see
 * collectHeadcountWarnings in lib/packages/apply-dialog-state.ts) so it is a deliberate choice rather
 * than a typo nobody noticed. A tour operator is excluded: its units are independent activities the
 * same travellers can all join, so there is no single headcount to compare against. */
export const PASSENGER_WARN_SUPPLIER_KINDS = new Set<SupplierKind>([
  "airline",
  "hotel_property",
  "cruise_line",
])

interface UnitHeadcount {
  adultCount?: number | null
  childCount?: number | null
  infantCount?: number | null
}

/**
 * 0-based indexes of the units that hold nobody at all, on the kinds whose headcount may otherwise
 * differ from the booking's. More or fewer people only warns, but an empty room, seat or cabin is a
 * mistake -- a room cleared by accident, a cabin added and never filled in -- that would price at R0
 * per person, or bill a room nobody sleeps in, so it blocks: in Build Booking, in PATCH
 * /api/jobs/[id]/services and in the pricing engine. Decided 2026-09-24.
 */
export function findEmptyUnitIndexes(kind: SupplierKind, units: readonly UnitHeadcount[]): number[] {
  if (!PASSENGER_WARN_SUPPLIER_KINDS.has(kind)) return []
  return units.flatMap((unit, index) =>
    (unit.adultCount ?? 0) + (unit.childCount ?? 0) + (unit.infantCount ?? 0) > 0 ? [] : [index],
  )
}

/** "room 2 has nobody in it — add guests or remove the room", in the kind's own unit noun. Lower
 *  case so it reads after a "Leg name: " prefix; see describeEmptyUnitSentence to stand alone. */
export function describeEmptyUnit(kind: SupplierKind, index: number): string {
  const noun = SUPPLIER_VOCABULARY[kind].unitNoun
  return `${noun} ${index + 1} has nobody in it — add guests or remove the ${noun}`
}

/** describeEmptyUnit as a standalone sentence: "Room 2 has nobody in it — add guests or remove the room." */
export function describeEmptyUnitSentence(kind: SupplierKind, index: number): string {
  const message = describeEmptyUnit(kind, index)
  return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`
}
