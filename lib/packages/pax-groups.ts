import type {
  BookingPaxGroup,
  BookingTransportRequest,
  PackageLeg,
  PaxGroupMeta,
  SupplierKind,
  UnitRateSplit,
} from "@/lib/types"
import { isCoreBookingLeg } from "@/lib/types"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import type { ApplyLegState, SuiteLegState, SuiteUnitState } from "@/lib/packages/apply-dialog-state"
import { paxGroupLabel, resolvePaxGroupMetas, type PaxGroupNameLookup } from "@/lib/pax-groups/labels"

/**
 * Pure state helpers for pax groups in Build Booking's configure step (see the pax groups design,
 * section 1, and supabase/migrations/20261028100000_pax_groups.sql).
 *
 * - The booking's primary leg (isCoreBookingLeg) is in group mode when it has 2 or more units.
 *   Each of its units IS a group: its paxGroupIds is exactly [groupId], and the groups' positions
 *   (1..N) follow the primary units' order.
 * - Every other unit and every transport request lists the groups it serves: [] = every group,
 *   [a, b] = only those. A group with no unit on a leg (and no [] unit) is not on that leg.
 * - With 0 or 1 primary units there are no groups and every paxGroupIds is [].
 *
 * Nothing here touches React, fetch or the database, so the dialog can run these on every change.
 */

/** A pax group as the Build Booking dialog holds it, in position order (position = index + 1).
 *  The id is minted by the dialog and survives every save; label null = the automatic name. */
export interface PaxGroupDraft {
  id: string
  label: string | null
}

/** Kinds whose units may carry rate splits (some guests on another rate type): the rate-card legs
 *  that price per person off a card -- trains, tours and cruises. Hotels price per room or per
 *  night off the room type and airlines are typed by hand, so a split there would mean nothing. */
export const RATE_SPLIT_SUPPLIER_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>([
  "train_operator",
  "tour_operator",
  "cruise_line",
])

/** True when a unit on this kind of leg may carry rate splits. A manual-pricing leg never may: its
 *  fares are typed, so there is no other rate card to move a guest onto. */
export function supportsRateSplits(
  kind: SupplierKind | string | null | undefined,
  pricingMode?: "rate_card" | "manual" | null,
): boolean {
  return RATE_SPLIT_SUPPLIER_KINDS.has(kind as SupplierKind) && pricingMode !== "manual"
}

/** Kinds seeded 1:1 (unit i serves group i) the first time a booking enters group mode -- one
 *  hotel room or cabin per suite is by far the common case. */
const FIRST_ACTIVATION_SEEDED_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>([
  "hotel_property",
  "cruise_line",
])

const EMPTY_PAX: PassengerTotals = { adultCount: 0, childCount: 0, infantCount: 0 }

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function samePax(a: PassengerTotals | undefined, b: PassengerTotals | undefined): boolean {
  return (
    (a?.adultCount ?? 0) === (b?.adultCount ?? 0) &&
    (a?.childCount ?? 0) === (b?.childCount ?? 0) &&
    (a?.infantCount ?? 0) === (b?.infantCount ?? 0)
  )
}

function addPax(a: PassengerTotals, b: PassengerTotals): PassengerTotals {
  return {
    adultCount: a.adultCount + b.adultCount,
    childCount: a.childCount + b.childCount,
    infantCount: a.infantCount + b.infantCount,
  }
}

function unitPax(unit: Pick<SuiteUnitState, "adultCount" | "childCount" | "infantCount">): PassengerTotals {
  return { adultCount: unit.adultCount, childCount: unit.childCount, infantCount: unit.infantCount }
}

/**
 * The booking's primary leg: the core leg (isCoreBookingLeg -- the primary supplier's leg, else the
 * train) that sorts first. The same supplier can sit on two legs (a group's own nights at the same
 * property); only the first anchors the groups, ties keeping list order. The one rule for the whole
 * feature: the pricer's findPrimaryLegId (lib/quotes/build-from-package.ts), the services PATCH and
 * the Reservation tab's group list all resolve the primary leg through this.
 */
export function primaryLegIdOf(
  legs: readonly Pick<PackageLeg, "id" | "supplierId" | "supplierKind" | "sortOrder">[],
  primarySupplierId: string | null | undefined,
): string | null {
  let primary: (typeof legs)[number] | null = null
  for (const leg of legs) {
    if (!isCoreBookingLeg({ supplierId: leg.supplierId ?? null, supplierKind: leg.supplierKind }, primarySupplierId ?? null)) {
      continue
    }
    if (primary === null || (leg.sortOrder ?? 0) < (primary.sortOrder ?? 0)) primary = leg
  }
  return primary?.id ?? null
}

/** The primary leg's state, when it is a suite leg (it always is: transfers are never primary). */
export function primaryStateOf(
  states: readonly ApplyLegState[],
  primaryLegId: string | null | undefined,
): SuiteLegState | null {
  if (!primaryLegId) return null
  const state = states.find((candidate) => candidate.legId === primaryLegId)
  return state?.kind === "suite" ? state : null
}

/** Group mode: the primary leg has 2 or more units. */
export function isPaxGroupMode(states: readonly ApplyLegState[], primaryLegId: string | null | undefined): boolean {
  return (primaryStateOf(states, primaryLegId)?.units.length ?? 0) >= 2
}

/** True when the unit (or transport request) serves the group: it lists it, or lists none (shared). */
export function unitServesGroup(unit: { paxGroupIds: readonly string[] }, groupId: string): boolean {
  return unit.paxGroupIds.length === 0 || unit.paxGroupIds.includes(groupId)
}

/**
 * The ids of the groups on a leg, in group order: every group served by one of its units (suite
 * legs) or requests (transport legs). A leg with a shared ([]) unit carries every group; a leg with
 * no units or requests carries none. Ids not in `groups` are ignored.
 */
export function groupsOnLeg(state: ApplyLegState, groups: readonly Pick<PaxGroupDraft, "id">[]): string[] {
  const items: readonly { paxGroupIds: readonly string[] }[] =
    state.kind === "suite" ? state.units : state.requests
  return groups
    .map((group) => group.id)
    .filter((groupId) => items.some((item) => unitServesGroup(item, groupId)))
}

/** Adults, children and infants of the given groups, summed from their primary units. Ids that
 *  aren't a primary unit's group count as nobody. */
export function paxForGroups(
  states: readonly ApplyLegState[],
  primaryLegId: string | null | undefined,
  groupIds: readonly string[],
): PassengerTotals {
  const byGroup = primaryPaxByGroupId(primaryStateOf(states, primaryLegId))
  return groupIds.reduce((total, groupId) => addPax(total, byGroup.get(groupId) ?? EMPTY_PAX), EMPTY_PAX)
}

function primaryPaxByGroupId(primary: SuiteLegState | null): Map<string, PassengerTotals> {
  const byGroup = new Map<string, PassengerTotals>()
  for (const unit of primary?.units ?? []) {
    const groupId = unit.paxGroupIds[0]
    if (groupId) byGroup.set(groupId, addPax(byGroup.get(groupId) ?? EMPTY_PAX, unitPax(unit)))
  }
  return byGroup
}

export interface PaxGroupSyncResult {
  states: ApplyLegState[]
  groups: PaxGroupDraft[]
}

export interface SyncPaxGroupsOptions {
  /** Mints a new group's id. Defaults to crypto.randomUUID(); injectable for tests. */
  newId?: () => string
}

/**
 * Brings the groups in line with the primary leg's units, after any change to the leg states:
 *
 * - Fewer than 2 primary units: no groups. Every unit's and transport request's paxGroupIds is
 *   cleared (rate splits are untouched -- they don't depend on groups).
 * - Otherwise one group per primary unit, in unit order. A unit keeps the group it already names
 *   (unless an earlier unit claimed it first, e.g. a duplicated suite), else gets a freshly minted
 *   id. Labels carry over by id; a new group starts with the automatic name (null).
 * - Groups whose primary unit is gone are dropped, and their ids are stripped from every other
 *   unit and request. A unit or request that served only removed groups went with them: it is
 *   deleted, unless it is its leg's last one -- then it stays, shared by every group ([]), so the
 *   leg is never emptied. The same holds when the booking drops out of group mode.
 * - The first time the booking enters group mode (`groups` was empty), each hotel and cruise leg
 *   with exactly one unit per group, all still shared, is seeded 1:1 by order: unit i serves
 *   group i. Everything else stays shared ([]).
 *
 * Returns the same state, unit, request and groups objects wherever nothing changed, so a caller
 * can compare by reference. Run {@link syncGroupPax} afterwards to re-sync the headcounts.
 */
export function syncPaxGroups(
  states: readonly ApplyLegState[],
  groups: readonly PaxGroupDraft[],
  primaryLegId: string | null | undefined,
  options: SyncPaxGroupsOptions = {},
): PaxGroupSyncResult {
  const newId = options.newId ?? (() => crypto.randomUUID())
  const primary = primaryStateOf(states, primaryLegId)

  if (!primary || primary.units.length < 2) {
    // The suite still on the primary leg stops being a group but isn't removed: only units and
    // trips that served nothing but the suites that went are deleted with them.
    const live = new Set((primary?.units ?? []).flatMap((unit) => unit.paxGroupIds.slice(0, 1)))
    const removed = primary ? new Set(groups.map((group) => group.id).filter((id) => !live.has(id))) : new Set<string>()
    return {
      groups: groups.length === 0 ? (groups as PaxGroupDraft[]) : [],
      states: mapGroupIds(withoutOrphans(states, primary, removed, live), () => []),
    }
  }

  const labelById = new Map(groups.map((group) => [group.id, group.label]))
  const claimed = new Set<string>()
  const nextGroups: PaxGroupDraft[] = []
  const primaryUnits = primary.units.map((unit) => {
    const candidate = unit.paxGroupIds[0]
    const groupId = candidate && !claimed.has(candidate) ? candidate : newId()
    claimed.add(groupId)
    nextGroups.push({ id: groupId, label: labelById.get(groupId) ?? null })
    return sameIds(unit.paxGroupIds, [groupId]) ? unit : { ...unit, paxGroupIds: [groupId] }
  })

  const validIds = new Set(nextGroups.map((group) => group.id))
  const keepValid = (ids: readonly string[]): string[] => ids.filter((id) => validIds.has(id))
  const firstActivation = groups.length === 0
  const removedIds = new Set(groups.map((group) => group.id).filter((id) => !validIds.has(id)))

  const nextStates = withoutOrphans(states, primary, removedIds, validIds).map((state): ApplyLegState => {
    if (state === primary) {
      return primaryUnits.every((unit, index) => unit === primary.units[index])
        ? primary
        : { ...primary, units: primaryUnits }
    }
    if (state.kind === "transport") {
      return withRequestGroupIds(state, (request) => keepValid(request.paxGroupIds))
    }
    const kept = state.units.map((unit) => keepValid(unit.paxGroupIds))
    const seed =
      firstActivation &&
      FIRST_ACTIVATION_SEEDED_KINDS.has(state.supplierKind) &&
      state.units.length === nextGroups.length &&
      kept.every((ids) => ids.length === 0)
    return withUnitGroupIds(state, (_unit, index) => (seed ? [nextGroups[index].id] : kept[index]))
  })

  const groupsUnchanged =
    nextGroups.length === groups.length &&
    nextGroups.every((group, index) => group.id === groups[index].id && group.label === groups[index].label)

  return { states: nextStates, groups: groupsUnchanged ? (groups as PaxGroupDraft[]) : nextGroups }
}

/** True when every group the unit or trip named is gone (`removed`) and none of them lives on. A
 *  shared ([]) item never is: it serves whoever remains. */
function servesOnlyRemoved(
  item: { paxGroupIds?: readonly string[] | null },
  removed: ReadonlySet<string>,
  live: ReadonlySet<string>,
): boolean {
  const ids = item.paxGroupIds ?? []
  return ids.length > 0 && ids.some((id) => removed.has(id)) && !ids.some((id) => live.has(id))
}

/** The items left once those serving only removed groups are deleted -- or, when that would empty
 *  the leg, the first of them alone (the caller then clears its ids, so it is shared). */
function dropOrphanedItems<T extends { paxGroupIds?: readonly string[] | null }>(
  items: T[],
  removed: ReadonlySet<string>,
  live: ReadonlySet<string>,
): T[] {
  if (removed.size === 0) return items
  const kept = items.filter((item) => !servesOnlyRemoved(item, removed, live))
  if (kept.length === items.length) return items
  return kept.length > 0 ? kept : items.slice(0, 1)
}

/** Every leg but the primary, with the units and trips of removed groups deleted (dropOrphanedItems).
 *  Unchanged legs keep their identity. */
function withoutOrphans(
  states: readonly ApplyLegState[],
  primary: SuiteLegState | null,
  removed: ReadonlySet<string>,
  live: ReadonlySet<string>,
): ApplyLegState[] {
  if (removed.size === 0) return states as ApplyLegState[]
  return states.map((state): ApplyLegState => {
    if (state === primary) return state
    if (state.kind === "transport") {
      const requests = dropOrphanedItems(state.requests, removed, live)
      return requests === state.requests ? state : { ...state, requests }
    }
    const units = dropOrphanedItems(state.units, removed, live)
    return units === state.units ? state : { ...state, units }
  })
}

function mapGroupIds(
  states: readonly ApplyLegState[],
  next: (item: { paxGroupIds: readonly string[] }) => string[],
): ApplyLegState[] {
  return states.map((state) =>
    state.kind === "transport" ? withRequestGroupIds(state, next) : withUnitGroupIds(state, next),
  )
}

function withUnitGroupIds(
  state: SuiteLegState,
  next: (unit: SuiteUnitState, index: number) => string[],
): SuiteLegState {
  let changed = false
  const units = state.units.map((unit, index) => {
    const ids = next(unit, index)
    if (sameIds(ids, unit.paxGroupIds)) return unit
    changed = true
    return { ...unit, paxGroupIds: ids }
  })
  return changed ? { ...state, units } : state
}

function withRequestGroupIds<T extends { requests: BookingTransportRequest[] }>(
  state: T,
  next: (request: BookingTransportRequest) => string[],
): T {
  let changed = false
  const requests = state.requests.map((request) => {
    // A row read before the column existed has no paxGroupIds at all; treat it as shared.
    const current = request.paxGroupIds ?? []
    const ids = next(request.paxGroupIds ? request : { ...request, paxGroupIds: current })
    if (sameIds(ids, current)) return request
    changed = true
    return { ...request, paxGroupIds: ids }
  })
  return changed ? { ...state, requests } : state
}

/**
 * The pax sync: every non-primary unit, and every per-person transport request, that names
 * explicit groups gets its adult, child and infant counts set to the sum of those groups' primary
 * units. Shared ([]) units and per-vehicle requests keep their counts. A no-op outside group mode.
 *
 * Pass `previous` (the states before this change) to leave hand-edited counts alone: a unit or
 * request is then only re-synced when it is new, its groups changed, or one of its groups' primary
 * headcount changed. Without it every grouped unit and request is re-synced.
 */
export function syncGroupPax(
  states: readonly ApplyLegState[],
  groups: readonly Pick<PaxGroupDraft, "id">[],
  primaryLegId: string | null | undefined,
  previous?: readonly ApplyLegState[],
): ApplyLegState[] {
  const primary = primaryStateOf(states, primaryLegId)
  if (!primary || groups.length < 2) return states as ApplyLegState[]

  const validIds = new Set(groups.map((group) => group.id))
  const paxByGroup = primaryPaxByGroupId(primary)
  const previousPaxByGroup = previous ? primaryPaxByGroupId(primaryStateOf(previous, primaryLegId)) : null
  const previousIdsByItem = new Map<string, readonly string[]>()
  for (const state of previous ?? []) {
    if (state.legId === primaryLegId) continue
    if (state.kind === "suite") {
      for (const unit of state.units) previousIdsByItem.set(`unit:${unit.id}`, unit.paxGroupIds)
    } else {
      for (const request of state.requests) {
        previousIdsByItem.set(`request:${request.id}`, request.paxGroupIds ?? [])
      }
    }
  }

  const targetFor = (key: string, ids: readonly string[]): PassengerTotals | null => {
    const groupIds = ids.filter((id) => validIds.has(id))
    if (groupIds.length === 0) return null
    if (previous) {
      const previousIds = previousIdsByItem.get(key)
      const unchanged =
        previousIds !== undefined &&
        sameIds(previousIds, ids) &&
        groupIds.every((id) => samePax(paxByGroup.get(id), previousPaxByGroup?.get(id)))
      if (unchanged) return null
    }
    return groupIds.reduce((total, id) => addPax(total, paxByGroup.get(id) ?? EMPTY_PAX), EMPTY_PAX)
  }

  return states.map((state): ApplyLegState => {
    if (state === primary) return state
    if (state.kind === "suite") {
      let changed = false
      const units = state.units.map((unit) => {
        const target = targetFor(`unit:${unit.id}`, unit.paxGroupIds)
        if (!target || samePax(target, unitPax(unit))) return unit
        changed = true
        return { ...unit, ...target }
      })
      return changed ? { ...state, units } : state
    }
    let changed = false
    const requests = state.requests.map((request) => {
      if (request.pricingBasis !== "per_person") return request
      const target = targetFor(`request:${request.id}`, request.paxGroupIds ?? [])
      if (
        !target ||
        (request.adultCount === target.adultCount &&
          request.childCount === target.childCount &&
          request.infantCount === target.infantCount)
      ) {
        return request
      }
      changed = true
      return { ...request, ...target }
    })
    return changed ? { ...state, requests } : state
  })
}

/** A grouped unit or per-person request whose headcount differs from its groups' -- warned about,
 *  never blocking (the consultant may have typed it on purpose). */
export interface GroupPaxMismatch {
  legId: string
  /** Set for a unit... */
  unitId?: string
  /** ...or for a transport request. */
  requestId?: string
  expected: PassengerTotals
  actual: PassengerTotals
}

/** Every grouped unit and per-person transport request whose counts don't match the sum of its
 *  groups' primary units. Empty outside group mode. */
export function findGroupPaxMismatches(
  states: readonly ApplyLegState[],
  groups: readonly Pick<PaxGroupDraft, "id">[],
  primaryLegId: string | null | undefined,
): GroupPaxMismatch[] {
  const primary = primaryStateOf(states, primaryLegId)
  if (!primary || groups.length < 2) return []

  const validIds = new Set(groups.map((group) => group.id))
  const paxByGroup = primaryPaxByGroupId(primary)
  const expectedFor = (ids: readonly string[]): PassengerTotals | null => {
    const groupIds = ids.filter((id) => validIds.has(id))
    if (groupIds.length === 0) return null
    return groupIds.reduce((total, id) => addPax(total, paxByGroup.get(id) ?? EMPTY_PAX), EMPTY_PAX)
  }

  const mismatches: GroupPaxMismatch[] = []
  for (const state of states) {
    if (state === primary) continue
    if (state.kind === "suite") {
      for (const unit of state.units) {
        const expected = expectedFor(unit.paxGroupIds)
        if (expected && !samePax(expected, unitPax(unit))) {
          mismatches.push({ legId: state.legId, unitId: unit.id, expected, actual: unitPax(unit) })
        }
      }
      continue
    }
    for (const request of state.requests) {
      if (request.pricingBasis !== "per_person") continue
      const expected = expectedFor(request.paxGroupIds ?? [])
      if (!expected) continue
      // Null counts fall back to the whole booking's totals, which a trip for some suites only
      // never matches -- so they are reported too.
      const actual: PassengerTotals = {
        adultCount: request.adultCount ?? -1,
        childCount: request.childCount ?? -1,
        infantCount: request.infantCount ?? -1,
      }
      if (!samePax(expected, actual)) {
        mismatches.push({
          legId: state.legId,
          requestId: request.id,
          expected,
          actual: {
            adultCount: request.adultCount ?? 0,
            childCount: request.childCount ?? 0,
            infantCount: request.infantCount ?? 0,
          },
        })
      }
    }
  }
  return mismatches
}

/**
 * The name documents print for a group: its typed label, else the automatic "<bedroom type>
 * <suite type> <position>" ("Twin Deluxe Suite 2"). Delegates to the shared lib/pax-groups/labels.ts
 * so the dialog, the pricer and the documents can never name a group differently. Build `names`
 * with paxGroupNamesFromSuiteTypes(leg.suiteTypes) for the primary leg.
 */
export function groupLabel(
  group: Pick<BookingPaxGroup, "label" | "position">,
  primaryUnit: Pick<SuiteUnitState, "suiteTypeId" | "bedroomTypeId"> | null | undefined,
  names: PaxGroupNameLookup,
): string {
  return paxGroupLabel(group, primaryUnit, names)
}

/** The dialog's groups with their resolved labels, as POST /services/apply takes them (`paxGroups`).
 *  Each group's primary unit is the one naming it; positions are index + 1. */
export function toPaxGroupMetas(
  groups: readonly PaxGroupDraft[],
  primary: Pick<SuiteLegState, "units"> | null | undefined,
  names: PaxGroupNameLookup,
): PaxGroupMeta[] {
  return resolvePaxGroupMetas(toBookingPaxGroups(groups), primary?.units ?? [], names)
}

/** The dialog's groups as stored rows (positions = index + 1). */
export function toBookingPaxGroups(groups: readonly PaxGroupDraft[]): BookingPaxGroup[] {
  return groups.map((group, index) => ({ id: group.id, position: index + 1, label: group.label }))
}

/** Saved groups (GET /api/jobs/[id]/services `paxGroups`) as the dialog holds them, in position
 *  order. Absent = none. */
export function fromSavedPaxGroups(saved: readonly BookingPaxGroup[] | null | undefined): PaxGroupDraft[] {
  return (saved ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((group) => ({ id: group.id, label: group.label?.trim() || null }))
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

/** booking_service_units.rate_splits as read from the database (jsonb): malformed entries dropped. */
export function parseUnitRateSplits(value: unknown): UnitRateSplit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): UnitRateSplit[] => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const rateTypeId = typeof record.rateTypeId === "string" ? record.rateTypeId.trim() : ""
    const adultCount = nonNegativeInt(record.adultCount ?? 0)
    const childCount = nonNegativeInt(record.childCount ?? 0)
    const infantCount = nonNegativeInt(record.infantCount ?? 0)
    if (!rateTypeId || adultCount === null || childCount === null || infantCount === null) return []
    return [{ rateTypeId, adultCount, childCount, infantCount }]
  })
}

/**
 * Tidies a unit's rate splits: splits on the same rate type merge, splits holding nobody and
 * splits on the unit's own effective rate (`unitRateTypeId`, when known) are dropped -- those
 * guests already price at that rate. Order follows each rate's first appearance.
 */
export function normaliseRateSplits(
  splits: readonly UnitRateSplit[],
  unitRateTypeId: string | null | undefined,
): UnitRateSplit[] {
  const byRate = new Map<string, UnitRateSplit>()
  for (const split of splits) {
    if (unitRateTypeId && split.rateTypeId === unitRateTypeId) continue
    const existing = byRate.get(split.rateTypeId)
    byRate.set(
      split.rateTypeId,
      existing
        ? {
            rateTypeId: split.rateTypeId,
            adultCount: existing.adultCount + split.adultCount,
            childCount: existing.childCount + split.childCount,
            infantCount: existing.infantCount + split.infantCount,
          }
        : { ...split },
    )
  }
  return [...byRate.values()].filter((split) => split.adultCount + split.childCount + split.infantCount > 0)
}

/** The first passenger kind whose split guests outnumber the unit's own, or null when every split
 *  fits (per kind, the splits' counts sum to at most the unit's count). */
export function rateSplitOverflow(
  unit: Pick<SuiteUnitState, "adultCount" | "childCount" | "infantCount">,
  splits: readonly UnitRateSplit[],
): "adult" | "child" | "infant" | null {
  const total = splits.reduce(
    (sum, split) => ({
      adultCount: sum.adultCount + split.adultCount,
      childCount: sum.childCount + split.childCount,
      infantCount: sum.infantCount + split.infantCount,
    }),
    EMPTY_PAX,
  )
  if (total.adultCount > unit.adultCount) return "adult"
  if (total.childCount > unit.childCount) return "child"
  if (total.infantCount > unit.infantCount) return "infant"
  return null
}

/** One guest of a unit and the rate they price at; null = the unit's own rate. */
export interface GuestRate {
  kind: "adult" | "child" | "infant"
  rateTypeId: string | null
}

/**
 * The per-guest rate rows of a unit ("Adult 1 [rate]", "Adult 2 [rate]"...): per kind, the guests
 * on the unit's own rate first (null), then each split's guests in split order. Splits beyond the
 * unit's count are cut off.
 */
export function guestRatesOf(
  unit: Pick<SuiteUnitState, "adultCount" | "childCount" | "infantCount" | "rateSplits">,
): GuestRate[] {
  const kinds = [
    { kind: "adult" as const, count: unit.adultCount, splitCount: (split: UnitRateSplit) => split.adultCount },
    { kind: "child" as const, count: unit.childCount, splitCount: (split: UnitRateSplit) => split.childCount },
    { kind: "infant" as const, count: unit.infantCount, splitCount: (split: UnitRateSplit) => split.infantCount },
  ]
  return kinds.flatMap(({ kind, count, splitCount }) => {
    const splitRates = unit.rateSplits.flatMap((split) =>
      Array.from({ length: splitCount(split) }, () => split.rateTypeId),
    )
    const own = Math.max(0, count - splitRates.length)
    return [
      ...Array.from({ length: own }, (): GuestRate => ({ kind, rateTypeId: null })),
      ...splitRates.slice(0, count).map((rateTypeId): GuestRate => ({ kind, rateTypeId })),
    ]
  })
}

/** Collapses per-guest rate rows back into rate splits (the inverse of {@link guestRatesOf}).
 *  Guests on null or on the unit's own rate stay on the unit's rate. */
export function rateSplitsFromGuestRates(
  guests: readonly GuestRate[],
  unitRateTypeId: string | null | undefined,
): UnitRateSplit[] {
  return normaliseRateSplits(
    guests.flatMap((guest): UnitRateSplit[] =>
      guest.rateTypeId
        ? [
            {
              rateTypeId: guest.rateTypeId,
              adultCount: guest.kind === "adult" ? 1 : 0,
              childCount: guest.kind === "child" ? 1 : 0,
              infantCount: guest.kind === "infant" ? 1 : 0,
            },
          ]
        : [],
    ),
    unitRateTypeId,
  )
}
