import type { BookingTransportRequest, PackageDetail, PackageLeg, SupplierKind, UnitRateSplit } from "@/lib/types"
import { isTypePricedSupplier, SUPPLIER_VOCABULARY } from "@/lib/types"
import {
  createDraftUnit,
  formatHeadcountDifference,
  headcountLegNoun,
  PASSENGER_WARN_SUPPLIER_KINDS,
  sumUnitHeadcount,
  type ApplyLegState,
  type HeadcountWarning,
  type SuiteLegState,
  type SuiteUnitState,
  type TransportLegState,
} from "@/lib/packages/apply-dialog-state"
import {
  findGroupPaxMismatches,
  groupsOnLeg,
  paxForGroups,
  primaryStateOf,
  unitServesGroup,
  type PaxGroupDraft,
} from "@/lib/packages/pax-groups"
import { autoPaxGroupLabel, type PaxGroupNameLookup } from "@/lib/pax-groups/labels"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import { hasAnyRateCardFor, hasAnyRateCardForRateType } from "@/lib/rate-cards/resolve"

/**
 * Pure helpers behind Build Booking's pax-group UI (the group bar, the "All suites" overview, the
 * per-suite view and step 3) -- see the pax groups UX spec. The state model itself (syncPaxGroups,
 * syncGroupPax) lives in lib/packages/pax-groups.ts; everything here reads or edits leg states one
 * user action at a time and leaves the re-sync to the dialog.
 *
 * `noun` is always the primary product's capitalised unit noun ("Suite", "Room", "Cabin" -- see
 * paxGroupNoun in lib/quotes/pax-group-pricing.ts).
 */

const EMPTY_PAX: PassengerTotals = { adultCount: 0, childCount: 0, infantCount: 0 }

/** Kinds whose units are private to a suite: ticking a suite onto one adds that suite its own room
 *  or cabin. Every other kind (transfers, rentals, flights, tours) is shared where it can be. */
const OWN_UNIT_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>(["hotel_property", "cruise_line"])

function plural(noun: string): string {
  return `${noun}s`
}

/** "1, 2 & 4"; pass " and " as `last` for prose whose items may hold an "&" themselves. */
export function joinAnd(parts: readonly (string | number)[], last = " & "): string {
  if (parts.length <= 1) return parts.join("")
  return `${parts.slice(0, -1).join(", ")}${last}${parts[parts.length - 1]}`
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** A leg's name as the dialog shows it. */
export function legName(leg: Pick<PackageLeg, "label" | "supplierName">): string {
  return leg.label ?? leg.supplierName
}

/**
 * "All suites" for [], "Suite 2", "Suites 2 & 3", "Suites 1, 2 & 4", a consecutive run of three or
 * more as "Suites 1–5", or "5 suites" for five or more that aren't one run -- always by position
 * (index + 1 in `groups`). Ids not in `groups` are ignored; a list naming none of them reads as
 * "All suites".
 */
export function describeGroupList(
  ids: readonly string[],
  groups: readonly Pick<PaxGroupDraft, "id">[],
  noun = "Suite",
): string {
  const positions = groups.flatMap((group, index) => (ids.includes(group.id) ? [index + 1] : []))
  if (positions.length === 0) return `All ${plural(noun).toLowerCase()}`
  if (positions.length === 1) return `${noun} ${positions[0]}`
  const first = positions[0]
  const last = positions[positions.length - 1]
  if (positions.length >= 3 && last - first === positions.length - 1) return `${plural(noun)} ${first}–${last}`
  if (positions.length >= 5) return `${positions.length} ${plural(noun).toLowerCase()}`
  return `${plural(noun)} ${joinAnd(positions)}`
}

/** True when describeGroupList reads as more than one group ("Suites 2 & 3", "5 suites"). */
export function isGroupListPlural(ids: readonly string[], groups: readonly Pick<PaxGroupDraft, "id">[]): boolean {
  return groups.filter((group) => ids.includes(group.id)).length !== 1
}

/** "2 adults", "1 adult, 1 child", "2 adults, 1 infant"; "No guests" when everyone is 0. */
export function describeGroupPax(pax: PassengerTotals): string {
  const parts = [
    pax.adultCount > 0 ? count(pax.adultCount, "adult", "adults") : null,
    pax.childCount > 0 ? count(pax.childCount, "child", "children") : null,
    pax.infantCount > 0 ? count(pax.infantCount, "infant", "infants") : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(", ") : "No guests"
}

function paxTotal(pax: PassengerTotals): number {
  return pax.adultCount + pax.childCount + pax.infantCount
}

function unitPax(unit: Pick<SuiteUnitState, "adultCount" | "childCount" | "infantCount">): PassengerTotals {
  return { adultCount: unit.adultCount, childCount: unit.childCount, infantCount: unit.infantCount }
}

/** One pax group as the UI shows it, resolved from the dialog's drafts and the primary leg. */
export interface PaxGroupView {
  id: string
  /** 1..N in the dialog's order. */
  position: number
  /** The consultant's typed name, trimmed, or null. */
  typedLabel: string | null
  /** The automatic name: "Twin Deluxe Suite 2". */
  autoLabel: string
  /** What documents print: the typed name, else the automatic one. */
  label: string
  /** The name without its trailing position ("Twin Deluxe Suite"); a typed name as typed; "Not set"
   *  for a suite with no type yet. */
  shortLabel: string
  /** The primary unit's headcount. */
  pax: PassengerTotals
  /** The primary unit naming this group, if any. */
  primaryUnit: SuiteUnitState | null
}

export function buildPaxGroupViews(
  groups: readonly PaxGroupDraft[],
  primary: Pick<SuiteLegState, "units"> | null | undefined,
  names: PaxGroupNameLookup,
): PaxGroupView[] {
  return groups.map((group, index) => {
    const position = index + 1
    const primaryUnit = primary?.units.find((unit) => unit.paxGroupIds[0] === group.id) ?? null
    const typedLabel = group.label?.trim() || null
    const autoLabel = autoPaxGroupLabel(position, primaryUnit, names)
    const typeName = primaryUnit?.suiteTypeId ? names.suiteTypeName(primaryUnit.suiteTypeId)?.trim() || null : null
    const suffix = ` ${position}`
    const autoShort = autoLabel.endsWith(suffix) ? autoLabel.slice(0, -suffix.length) : autoLabel
    return {
      id: group.id,
      position,
      typedLabel,
      autoLabel,
      label: typedLabel ?? autoLabel,
      shortLabel: typedLabel ?? (typeName ? autoShort : "Not set"),
      pax: primaryUnit ? unitPax(primaryUnit) : EMPTY_PAX,
      primaryUnit,
    }
  })
}

export interface PaxGroupProblem {
  /** Blocking: the suite holds nobody (Next refuses). Warning: worth a look, never blocks. */
  level: "blocking" | "warning"
  /** Lower-case reasons, for the screen-reader text: "no guests in this suite". */
  reasons: string[]
}

/**
 * What needs attention on one suite, for the tab's marker and the overview column: no guests
 * (blocking), and no type, more guests than the type takes, or a rate with no card (warnings).
 * Null when nothing does.
 */
export function groupProblems(
  view: Pick<PaxGroupView, "pax" | "primaryUnit">,
  leg: Pick<PackageLeg, "supplierKind" | "pricingMode" | "suiteTypes" | "rateCards">,
  legState: Pick<SuiteLegState, "routeId">,
  noun = "Suite",
): PaxGroupProblem | null {
  const reasons: string[] = []
  const blocking = paxTotal(view.pax) === 0
  const lower = noun.toLowerCase()
  if (blocking) reasons.push(`no guests in this ${lower}`)

  const unit = view.primaryUnit
  if (!unit?.suiteTypeId) {
    reasons.push(`no ${lower} type`)
  } else {
    const suiteType = leg.suiteTypes.find((candidate) => candidate.id === unit.suiteTypeId)
    const capacity = suiteType?.passengerCapacity
    if (capacity != null && unit.adultCount + unit.childCount > capacity) {
      reasons.push(`more guests than a ${suiteType?.name ?? lower} takes`)
    }
    const routeKnown = isTypePricedSupplier(leg.supplierKind) || Boolean(legState.routeId)
    if (leg.pricingMode !== "manual" && routeKnown) {
      const routeId = legState.routeId ?? ""
      const rates = [unit.rateTypeId, ...unit.rateSplits.map((split) => split.rateTypeId)].filter(
        (rateTypeId): rateTypeId is string => Boolean(rateTypeId),
      )
      if (!hasAnyRateCardFor(leg.rateCards, routeId, unit.suiteTypeId)) {
        reasons.push("no rate card")
      } else if (rates.some((rateTypeId) => !hasAnyRateCardForRateType(leg.rateCards, routeId, unit.suiteTypeId as string, rateTypeId))) {
        reasons.push("a rate with no rate card")
      }
    }
  }

  if (reasons.length === 0) return null
  return { level: blocking ? "blocking" : "warning", reasons }
}

/** The units (suite legs) or trips (transport legs) of a leg, as group carriers. */
function legItems(state: ApplyLegState): readonly { paxGroupIds?: readonly string[] | null }[] {
  return state.kind === "suite" ? state.units : state.requests
}

function idsOf(item: { paxGroupIds?: readonly string[] | null }): readonly string[] {
  return item.paxGroupIds ?? []
}

/** True when some unit or trip on the leg serves the group (lists it, or is shared). */
export function legServesGroup(state: ApplyLegState, groupId: string): boolean {
  return legItems(state).some((item) => unitServesGroup({ paxGroupIds: idsOf(item) }, groupId))
}

/** The ids a unit or trip keeps once `groupId` is taken off it; null when it served only that group. */
function withoutGroup(ids: readonly string[], groupId: string, allGroupIds: readonly string[]): string[] | null | undefined {
  if (ids.length === 0) return allGroupIds.filter((id) => id !== groupId)
  if (!ids.includes(groupId)) return undefined
  const next = ids.filter((id) => id !== groupId)
  return next.length > 0 ? next : null
}

/**
 * Whether the group can be taken off the leg from the overview or the per-suite view: it is on
 * it, and something else stays (the table never empties a leg -- that's what unticking "Include in
 * quote & voucher" is for).
 */
export function canExcludeGroupFromLeg(
  state: ApplyLegState,
  groupId: string,
  allGroupIds: readonly string[],
): boolean {
  if (!legServesGroup(state, groupId)) return false
  return legItems(state).some((item) => withoutGroup(idsOf(item), groupId, allGroupIds) !== null)
}

/**
 * Takes a group off a leg: removed from every unit or trip that lists it, a shared ([]) one becomes
 * the explicit list of every other group, and one left serving nobody is deleted. Returns the state
 * unchanged when that would empty the leg (see canExcludeGroupFromLeg). Run syncGroupPax afterwards.
 */
export function excludeGroupFromLeg<T extends ApplyLegState>(
  state: T,
  groupId: string,
  allGroupIds: readonly string[],
): T {
  if (!canExcludeGroupFromLeg(state, groupId, allGroupIds)) return state
  if (state.kind === "suite") {
    const units = state.units.flatMap((unit) => {
      const next = withoutGroup(unit.paxGroupIds, groupId, allGroupIds)
      if (next === undefined) return [unit]
      return next === null ? [] : [{ ...unit, paxGroupIds: next }]
    })
    return { ...state, units } as T
  }
  const transport = state as TransportLegState
  const requests = transport.requests.flatMap((request) => {
    const next = withoutGroup(idsOf(request), groupId, allGroupIds)
    if (next === undefined) return [request]
    return next === null ? [] : [{ ...request, paxGroupIds: next }]
  })
  return { ...transport, requests } as T
}

export interface IncludeGroupResult<T extends ApplyLegState = ApplyLegState> {
  state: T
  /** "own": the group got its own unit or trip; "shared": it joined one already shared by 2+
   *  groups; "unchanged": it was already on the leg (or there was nothing to copy). */
  mode: "own" | "shared" | "unchanged"
  /** 1-based number of the unit or trip that now serves the group. */
  itemNumber: number | null
  /** The other groups on that unit or trip ("shared" only). */
  sharedWithIds: string[]
}

function inGroupOrder(ids: readonly string[], allGroupIds: readonly string[]): string[] {
  return allGroupIds.filter((id) => ids.includes(id))
}

/** A copy of a unit for one group: its type, fittings, rate and typed prices, with the group's
 *  headcount and no rate splits (those belong to the guests of the unit copied). */
function copyUnitFor(template: SuiteUnitState, groupId: string, pax: PassengerTotals): SuiteUnitState {
  return {
    ...template,
    id: createDraftUnit().id,
    ...pax,
    paxGroupIds: [groupId],
    rateSplits: [],
    manualRoomPriceSetAt: null,
    manualTourPriceSetAt: null,
    fareOverrideSetAt: null,
  }
}

function copyRequestFor(template: BookingTransportRequest, groupId: string, pax: PassengerTotals): BookingTransportRequest {
  const now = new Date().toISOString()
  const perPerson = template.pricingBasis === "per_person"
  return {
    ...template,
    id: crypto.randomUUID(),
    paxGroupIds: [groupId],
    adultCount: perPerson ? pax.adultCount : template.adultCount,
    childCount: perPerson ? pax.childCount : template.childCount,
    infantCount: perPerson ? pax.infantCount : template.infantCount,
    passengerCount: perPerson ? template.passengerCount : paxTotal(pax),
    priceOverrideSetAt: null,
    supplierReference: null,
    rentalDetails: template.rentalDetails ? { ...template.rentalDetails, transportRequestId: "" } : null,
    createdAt: now,
    updatedAt: now,
  }
}

/** The unit or trip a new own one copies: the leg's last single-group one, else its first. */
function templateIndex(items: readonly { paxGroupIds?: readonly string[] | null }[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (idsOf(items[index]).length === 1) return index
  }
  return items.length > 0 ? 0 : -1
}

/**
 * Puts a group back on a leg. Hotels and cruises (private rooms and cabins) give it its own unit,
 * copied from the leg's last single-suite unit. Every other kind adds it to the first unit or trip
 * already shared by 2+ groups, else gives it its own copy too. `groupPax` is the group's primary
 * headcount, used for an own unit's counts.
 */
export function includeGroupOnLeg<T extends ApplyLegState>(
  state: T,
  groupId: string,
  allGroupIds: readonly string[],
  groupPax: PassengerTotals,
): IncludeGroupResult<T> {
  if (legServesGroup(state, groupId)) {
    return { state, mode: "unchanged", itemNumber: null, sharedWithIds: [] }
  }
  const items = legItems(state)

  if (!OWN_UNIT_KINDS.has(state.supplierKind)) {
    const sharedIndex = items.findIndex((item) => idsOf(item).length >= 2)
    if (sharedIndex !== -1) {
      const others = inGroupOrder(idsOf(items[sharedIndex]), allGroupIds)
      const listed = inGroupOrder([...others, groupId], allGroupIds)
      // Every suite on it again reads as shared ([]), so Remove → Add back is a true undo (a
      // suite added later then joins it automatically).
      const ids = listed.length === allGroupIds.length ? [] : listed
      const next =
        state.kind === "suite"
          ? { ...state, units: state.units.map((unit, index) => (index === sharedIndex ? { ...unit, paxGroupIds: ids } : unit)) }
          : {
              ...state,
              requests: (state as TransportLegState).requests.map((request, index) =>
                index === sharedIndex ? { ...request, paxGroupIds: ids } : request,
              ),
            }
      return { state: next as T, mode: "shared", itemNumber: sharedIndex + 1, sharedWithIds: others }
    }
  }

  const template = templateIndex(items)
  if (state.kind === "suite") {
    const unit =
      template === -1
        ? { ...createDraftUnit(groupPax), paxGroupIds: [groupId] }
        : copyUnitFor(state.units[template], groupId, groupPax)
    const units = [...state.units, unit]
    return { state: { ...state, units } as T, mode: "own", itemNumber: units.length, sharedWithIds: [] }
  }
  const transport = state as TransportLegState
  if (template === -1) return { state, mode: "unchanged", itemNumber: null, sharedWithIds: [] }
  const requests = [...transport.requests, copyRequestFor(transport.requests[template], groupId, groupPax)]
  return { state: { ...transport, requests } as T, mode: "own", itemNumber: requests.length, sharedWithIds: [] }
}

export interface DuplicateGroupResult {
  states: ApplyLegState[]
  groups: PaxGroupDraft[]
  /** Legs where the source shares a unit or trip with other groups, so the copy is not on them --
   *  the duplicate never guesses whether it should join a shared room. With the groups sharing. */
  skipped: Array<{ legId: string; sharedWithIds: string[] }>
}

/**
 * Adds a copy of a group as the last suite: its primary unit (type, fittings, counts, rate, rate
 * splits, typed fares -- the label starts automatic) and every unit and trip that serves the
 * source alone. Shared ([]) ones already cover the copy. Null when the source isn't found.
 */
export function duplicateGroup(
  states: readonly ApplyLegState[],
  groups: readonly PaxGroupDraft[],
  primaryLegId: string | null | undefined,
  sourceGroupId: string,
  newGroupId: string,
): DuplicateGroupResult | null {
  const primary = primaryStateOf(states, primaryLegId)
  const source = primary?.units.find((unit) => unit.paxGroupIds[0] === sourceGroupId)
  if (!primary || !source) return null
  const allGroupIds = [...groups.map((group) => group.id), newGroupId]

  const skipped: DuplicateGroupResult["skipped"] = []
  const recordSkipped = (next: ApplyLegState, items: readonly { paxGroupIds?: readonly string[] | null }[]) => {
    if (!next.selected || legServesGroup(next, newGroupId) || !legServesGroup(next, sourceGroupId)) return
    const sharedWithIds = inGroupOrder(
      items.flatMap((item) => (idsOf(item).includes(sourceGroupId) ? idsOf(item).filter((id) => id !== sourceGroupId) : [])),
      allGroupIds,
    )
    skipped.push({ legId: next.legId, sharedWithIds })
  }
  const nextStates = states.map((state): ApplyLegState => {
    if (state === primary) {
      return {
        ...primary,
        units: [...primary.units, { ...source, id: createDraftUnit().id, paxGroupIds: [newGroupId] }],
      }
    }
    if (state.kind === "suite") {
      const copies = state.units
        .filter((unit) => unit.paxGroupIds.length === 1 && unit.paxGroupIds[0] === sourceGroupId)
        .map((unit) => ({ ...copyUnitFor(unit, newGroupId, unitPax(unit)), rateSplits: unit.rateSplits }))
      const next = copies.length > 0 ? { ...state, units: [...state.units, ...copies] } : state
      recordSkipped(next, state.units)
      return next
    }
    const copies = state.requests
      .filter((request) => idsOf(request).length === 1 && idsOf(request)[0] === sourceGroupId)
      .map((request) => ({
        ...copyRequestFor(request, newGroupId, {
          adultCount: request.adultCount ?? 0,
          childCount: request.childCount ?? 0,
          infantCount: request.infantCount ?? 0,
        }),
        adultCount: request.adultCount,
        childCount: request.childCount,
        infantCount: request.infantCount,
        passengerCount: request.passengerCount,
      }))
    const next = copies.length > 0 ? { ...state, requests: [...state.requests, ...copies] } : state
    recordSkipped(next, state.requests)
    return next
  })

  return { states: nextStates, groups: [...groups, { id: newGroupId, label: null }], skipped }
}

/** One unit or trip that goes with a removed group, named as its card is: "Room 4", "Transfer 2". */
export interface GroupRemovalItem {
  legId: string
  /** The card's capitalised noun: "Room", "Cabin", "Transfer", "Vehicle". */
  noun: string
  /** The card's 1-based index on its leg. */
  number: number
}

export interface GroupRemovalPreview {
  /** Legs where units or trips serving only this group are deleted with it. */
  ownLegIds: string[]
  /** Exactly the units and trips deleted with the group, in leg order. */
  ownItems: GroupRemovalItem[]
  /** Legs whose every unit or trip served only this group: the first stays, now shared by every
   *  remaining group (syncPaxGroups never empties a leg). */
  keptSharedLegIds: string[]
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The noun a leg's cards are headed with ("Room 4", "Transfer 2"). */
function itemNounOf(state: ApplyLegState): string {
  if (state.kind === "suite") return capitalise(SUPPLIER_VOCABULARY[state.supplierKind].unitNoun)
  return state.supplierKind === "vehicle_rental" ? "Vehicle" : "Transfer"
}

/** What removing a group takes with it -- the confirm dialog's "Also removed" list. */
export function previewGroupRemoval(
  states: readonly ApplyLegState[],
  primaryLegId: string | null | undefined,
  groupId: string,
): GroupRemovalPreview {
  const ownLegIds: string[] = []
  const ownItems: GroupRemovalItem[] = []
  const keptSharedLegIds: string[] = []
  for (const state of states) {
    if (state.legId === primaryLegId) continue
    const items = legItems(state)
    const ownIndexes = items.flatMap((item, index) => {
      const ids = idsOf(item)
      return ids.length > 0 && ids.every((id) => id === groupId) ? [index] : []
    })
    if (ownIndexes.length === 0) continue
    const keepsFirst = ownIndexes.length === items.length
    if (keepsFirst) keptSharedLegIds.push(state.legId)
    // A leg made only of this group's items keeps its first one, so only the rest go.
    const going = keepsFirst ? ownIndexes.slice(1) : ownIndexes
    if (going.length === 0) continue
    ownLegIds.push(state.legId)
    const noun = itemNounOf(state)
    for (const index of going) ownItems.push({ legId: state.legId, noun, number: index + 1 })
  }
  return { ownLegIds, ownItems, keptSharedLegIds }
}

/**
 * The headcount a non-primary leg is checked against. In group mode a leg some suites dropped is
 * compared with the suites still on it (their primary units summed), not the whole booking --
 * otherwise every such leg warns "different number of people". A leg every suite is on, the
 * primary leg itself and a booking without groups keep the booking's totals for the supplier.
 */
export function expectedTotalsForLeg(
  state: ApplyLegState,
  groups: readonly Pick<PaxGroupDraft, "id">[],
  primaryState: SuiteLegState | null | undefined,
  bookingTotals: PassengerTotals | null,
): PassengerTotals | null {
  if (!primaryState || groups.length < 2 || state.legId === primaryState.legId) return bookingTotals
  const onLeg = groupsOnLeg(state, groups)
  if (onLeg.length === 0 || onLeg.length === groups.length) return bookingTotals
  return paxForGroups([primaryState], primaryState.legId, onLeg)
}

/** A step-3 headcount warning, keyed for React (one leg can carry several). */
export interface GroupHeadcountWarning extends HeadcountWarning {
  key: string
}

function have(ids: readonly string[], groups: readonly Pick<PaxGroupDraft, "id">[]): string {
  return isGroupListPlural(ids, groups) ? "have" : "has"
}

function describeMix(pax: PassengerTotals): string {
  const text = describeGroupPax(pax)
  return text === "No guests" ? "nobody" : text
}

/**
 * Step 3's "priced for a different number of people" list in group mode. Each airline, hotel and
 * cruise leg is compared with the suites on it (expectedTotalsForLeg), and every grouped unit or
 * per-person trip whose counts differ from its suites' sum is listed on its own. Labels carry the
 * suites: "12 Apostles Hotel (Suites 2 & 3)".
 */
export function collectGroupHeadcountWarnings(
  detail: Pick<PackageDetail, "legs">,
  states: readonly ApplyLegState[],
  totalsBySupplierId: Record<string, PassengerTotals>,
  groups: readonly Pick<PaxGroupDraft, "id">[],
  primaryLegId: string | null | undefined,
  noun = "Suite",
): GroupHeadcountWarning[] {
  const primary = primaryStateOf(states, primaryLegId)
  const legById = new Map(detail.legs.map((leg) => [leg.id, leg]))
  const sorted = detail.legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const stateByLegId = new Map(states.map((state) => [state.legId, state]))
  const mismatches = findGroupPaxMismatches(states, groups, primaryLegId).filter(
    (mismatch) => stateByLegId.get(mismatch.legId)?.selected,
  )
  const legsWithUnitMismatch = new Set(mismatches.map((mismatch) => mismatch.legId))
  const warnings: GroupHeadcountWarning[] = []

  for (const leg of sorted) {
    const state = stateByLegId.get(leg.id)
    if (state?.kind !== "suite" || !state.selected || state.legId === primaryLegId) continue
    if (!PASSENGER_WARN_SUPPLIER_KINDS.has(leg.supplierKind) || legsWithUnitMismatch.has(leg.id)) continue
    const bookingTotals = totalsBySupplierId[leg.supplierId] ?? null
    const expected = expectedTotalsForLeg(state, groups, primary, bookingTotals)
    if (!expected) continue
    const onLeg = groupsOnLeg(state, groups)
    const summed = sumUnitHeadcount(state.units)
    const bySuites = expected !== bookingTotals
    let message: string | null
    if (bySuites) {
      const list = describeGroupList(onLeg, groups, noun)
      const legNoun = headcountLegNoun(leg.supplierKind)
      const onTotal = paxTotal(summed)
      const expectedTotal = paxTotal(expected)
      message =
        summed.adultCount === expected.adultCount &&
        summed.childCount === expected.childCount &&
        summed.infantCount === expected.infantCount
          ? null
          : onTotal === expectedTotal
            ? `${describeMix(summed)} on this ${legNoun} · ${list} ${have(onLeg, groups)} ${describeMix(expected)}`
            : `${onTotal} on this ${legNoun} · ${list} ${have(onLeg, groups)} ${expectedTotal}`
    } else {
      message = formatHeadcountDifference(summed, expected, headcountLegNoun(leg.supplierKind))
    }
    if (!message) continue
    warnings.push({
      key: leg.id,
      legId: leg.id,
      legLabel: `${legName(leg)} (${describeGroupList(onLeg.length === groups.length ? [] : onLeg, groups, noun)})`,
      supplierKind: leg.supplierKind,
      summed,
      totals: expected,
      message,
    })
  }

  for (const mismatch of mismatches) {
    const leg = legById.get(mismatch.legId)
    const state = stateByLegId.get(mismatch.legId)
    if (!leg || !state) continue
    const items = legItems(state)
    const itemIndex =
      state.kind === "suite"
        ? state.units.findIndex((unit) => unit.id === mismatch.unitId)
        : state.requests.findIndex((request) => request.id === mismatch.requestId)
    const item = items[itemIndex]
    const ids = item ? idsOf(item) : []
    const itemNoun = state.kind === "suite" ? SUPPLIER_VOCABULARY[leg.supplierKind].unitNoun : leg.supplierKind === "vehicle_rental" ? "vehicle" : "transfer"
    const list = describeGroupList(ids, groups, noun)
    warnings.push({
      key: `${mismatch.legId}:${mismatch.unitId ?? mismatch.requestId ?? itemIndex}`,
      legId: mismatch.legId,
      legLabel: `${legName(leg)} (${list})`,
      supplierKind: leg.supplierKind,
      summed: mismatch.actual,
      totals: mismatch.expected,
      message: `${itemNoun} ${itemIndex + 1} holds ${count(paxTotal(mismatch.actual), "guest", "guests")}; ${list} ${have(ids, groups)} ${paxTotal(mismatch.expected)}.`,
    })
  }

  return warnings
}

/**
 * Step 3's unpriced-service message with the suites the leg serves after its name:
 * "12 Apostles Hotel (Suite 3): select a meal plan". "All suites" when every suite is on it.
 */
export function withGroupScope(
  message: string,
  label: string,
  state: ApplyLegState | undefined,
  groups: readonly Pick<PaxGroupDraft, "id">[],
  noun = "Suite",
): string {
  if (!state || groups.length < 2) return message
  const onLeg = groupsOnLeg(state, groups)
  const scope = `(${describeGroupList(onLeg.length === groups.length ? [] : onLeg, groups, noun)})`
  return message.startsWith(label) ? `${label} ${scope}${message.slice(label.length)}` : `${scope} ${message}`
}

/** Per passenger kind, trims split guests from the end until the splits fit the unit's counts --
 *  a unit whose headcount dropped below its splits would otherwise be refused on save. */
export function trimRateSplitsToCounts(unit: SuiteUnitState): SuiteUnitState {
  if (unit.rateSplits.length === 0) return unit
  const left = { adultCount: unit.adultCount, childCount: unit.childCount, infantCount: unit.infantCount }
  let changed = false
  const splits = unit.rateSplits.map((split): UnitRateSplit => {
    const fit = (key: keyof PassengerTotals) => {
      const kept = Math.min(split[key], Math.max(0, left[key]))
      left[key] -= kept
      if (kept !== split[key]) changed = true
      return kept
    }
    return { rateTypeId: split.rateTypeId, adultCount: fit("adultCount"), childCount: fit("childCount"), infantCount: fit("infantCount") }
  })
  if (!changed) return unit
  return { ...unit, rateSplits: splits.filter((split) => split.adultCount + split.childCount + split.infantCount > 0) }
}

/** Every unit whose rate splits outgrew its counts, trimmed (trimRateSplitsToCounts). Unchanged
 *  states keep their identity. */
export function trimAllRateSplits(states: readonly ApplyLegState[]): ApplyLegState[] {
  return states.map((state) => {
    if (state.kind !== "suite") return state
    let changed = false
    const units = state.units.map((unit) => {
      const next = trimRateSplitsToCounts(unit)
      if (next !== unit) changed = true
      return next
    })
    return changed ? { ...state, units } : state
  })
}

/** "Twin · Shower"-style fittings of a unit: type, bed and bath names, blanks dropped; "Not set"
 *  without a type. */
export function describeUnitFittings(
  unit: Pick<SuiteUnitState, "suiteTypeId" | "bedroomTypeId" | "bathroomTypeId">,
  leg: Pick<PackageLeg, "suiteTypes">,
): string {
  const suiteType = leg.suiteTypes.find((candidate) => candidate.id === unit.suiteTypeId)
  if (!suiteType) return "Not set"
  const nameAt = (ids: string[] | undefined, names: string[] | undefined, id: string | null) => {
    if (!id) return null
    const index = (ids ?? []).indexOf(id)
    return index === -1 ? null : names?.[index]?.trim() || null
  }
  return [
    suiteType.name,
    nameAt(suiteType.bedroomTypeIds, suiteType.bedroomTypes, unit.bedroomTypeId),
    nameAt(suiteType.bathroomTypeIds, suiteType.bathroomTypes, unit.bathroomTypeId),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ")
}

/** One cell of the "All suites" overview: whether the suite is on the leg and how. */
export interface OverviewCell {
  /** Primary leg: text only. */
  kind: "primary" | "unit"
  checked: boolean
  line1: string
  line2: string | null
  /** Why the checkbox can't be changed, or null when it can. */
  disabledReason: string | null
  /** True when the box is locked because this is the last suite on the leg. */
  lastOnLeg: boolean
}

const NOT_IN_QUOTE_REASON = "Tick 'Include in quote & voucher' on this service first."
const LAST_SUITE_REASON = "Untick 'Include in quote & voucher' on this service to drop it for everyone."

export function describeOverviewCell(
  state: ApplyLegState,
  leg: Pick<PackageLeg, "supplierKind" | "suiteTypes">,
  groupId: string,
  groups: readonly Pick<PaxGroupDraft, "id">[],
  primaryLegId: string | null | undefined,
  noun = "Suite",
): OverviewCell {
  if (state.legId === primaryLegId && state.kind === "suite") {
    const unit = state.units.find((candidate) => candidate.paxGroupIds[0] === groupId)
    return {
      kind: "primary",
      checked: true,
      line1: unit ? describeUnitFittings(unit, leg) : "Not set",
      line2: null,
      disabledReason: null,
      lastOnLeg: false,
    }
  }
  const allIds = groups.map((group) => group.id)
  const items = legItems(state).filter((item) => unitServesGroup({ paxGroupIds: idsOf(item) }, groupId))
  const typeName = (item: unknown) => {
    const suiteTypeId = (item as { suiteTypeId?: string | null }).suiteTypeId
    return leg.suiteTypes.find((candidate) => candidate.id === suiteTypeId)?.name ?? "Not set"
  }
  const lastOnLeg = state.selected && items.length > 0 && !canExcludeGroupFromLeg(state, groupId, allIds)
  const disabledReason = !state.selected ? NOT_IN_QUOTE_REASON : lastOnLeg ? LAST_SUITE_REASON : null

  if (items.length === 0) {
    return { kind: "unit", checked: false, line1: "Not included", line2: null, disabledReason, lastOnLeg }
  }
  if (items.length > 1) {
    const vocab = SUPPLIER_VOCABULARY[leg.supplierKind]
    const itemNounPlural = state.kind === "suite" ? vocab.unitNounPlural : leg.supplierKind === "vehicle_rental" ? "vehicles" : "transfers"
    return {
      kind: "unit",
      checked: true,
      line1: `${items.length} ${itemNounPlural}`,
      line2: [...new Set(items.map(typeName))].join(", "),
      disabledReason,
      lastOnLeg,
    }
  }
  const ids = idsOf(items[0])
  const others = ids.filter((id) => id !== groupId)
  return {
    kind: "unit",
    checked: true,
    line1: typeName(items[0]),
    line2: ids.length === 0 ? `All ${plural(noun).toLowerCase()}` : others.length > 0 ? describeGroupList(ids, groups, noun) : null,
    disabledReason,
    lastOnLeg,
  }
}

/**
 * The "Shared" note on a unit in the per-suite view, or null when the unit serves only the active
 * suite: "Shared with Suite 3 — changes apply to both."
 */
export function describeSharedNote(
  ids: readonly string[],
  activeGroupId: string,
  groups: readonly Pick<PaxGroupDraft, "id">[],
  noun = "Suite",
  hotel = false,
): string | null {
  const suffix = hotel ? ` Its price is split per guest across these ${plural(noun).toLowerCase()} on the quote.` : ""
  if (ids.length === 0) return `Shared by every ${noun.toLowerCase()} — changes apply to all.${suffix}`
  const others = ids.filter((id) => id !== activeGroupId && groups.some((group) => group.id === id))
  if (!ids.includes(activeGroupId) || others.length === 0) return null
  const list = describeGroupList(others, groups, noun)
  return others.length === 1
    ? `Shared with ${list} — changes apply to both.${suffix}`
    : `Shared with ${list} — changes apply to all of them.${suffix}`
}
