import type { SupabaseClient } from "@supabase/supabase-js"
import { formatDisplayDateLong } from "@/lib/date-format"
import { paxGroupLabel, type PaxGroupNameLookup } from "@/lib/pax-groups/labels"
import { pluralUnitLabel } from "@/lib/quotes/quote-presentation"
import { formatSuitePhrase } from "@/lib/templates/suite-description"
import type { Database } from "@/lib/supabase/types"
import type { PaxGroupMeta, SupplierKind } from "@/lib/types"
import { firstRecord } from "@/lib/utils"

/** One unit of the booking's primary service — one pax group — with its type names. */
export interface PaxGroupPrimaryUnitView {
  groupId: string
  suiteTypeName: string | null
  bedroomTypeName: string | null
  bathroomTypeName: string | null
  adults: number
  children: number
  infants: number
}

/** A room or cabin on another leg that only some groups stay in (its pax_group_ids). */
export interface PaxGroupRoomView {
  groupIds: string[]
  typeName: string | null
}

/**
 * A booking's pax groups as the documents read them: the groups (named), the primary-service unit
 * behind each, the rooms other legs assign to some of them, and the primary leg's route and date.
 */
export interface BookingPaxGroupsView {
  /** In position order, each named by its typed label or its primary unit ("Twin Deluxe Suite 2"). */
  groups: PaxGroupMeta[]
  /** One per group, in position order (a group whose unit can't be found has none). */
  primaryUnits: PaxGroupPrimaryUnitView[]
  /** Accommodation units (hotel rooms, cruise cabins) of other legs that name their groups, in leg
   *  then unit order. Units shared by every group (pax_group_ids = []) are left out. */
  rooms: PaxGroupRoomView[]
  primarySupplierKind: SupplierKind | null
  /** The primary leg's route in prose, in the booked direction: "Pretoria to Cape Town". */
  routeName: string | null
  /** The primary leg's own date (booking_services.service_date). */
  departureDate: string | null
}

/** A booking_service_units row as loadBookingPaxGroups selects it. */
export interface PaxGroupUnitRow {
  sort_order: number | null
  pax_group_ids: string[] | null
  adult_count: number | null
  child_count: number | null
  infant_count: number | null
  suite_type_id: string | null
  bedroom_type_id: string | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  bedroom_types: { name: string | null } | { name: string | null }[] | null
  bathroom_types: { name: string | null } | { name: string | null }[] | null
}

interface NamedJoin {
  name: string | null
}

/** A selected booking_services row (with its units) as loadBookingPaxGroups selects it. */
export interface PaxGroupServiceRow {
  id: string
  supplier_id: string | null
  sort_order: number | null
  service_date: string | null
  route_reversed: boolean | null
  suppliers: { kind: string | null } | { kind: string | null }[] | null
  routes:
    | { name: string | null; origin: NamedJoin | NamedJoin[] | null; destination: NamedJoin | NamedJoin[] | null }
    | { name: string | null; origin: NamedJoin | NamedJoin[] | null; destination: NamedJoin | NamedJoin[] | null }[]
    | null
  units: PaxGroupUnitRow[] | null
}

type ServiceRow = PaxGroupServiceRow
type UnitRow = PaxGroupUnitRow

const ACCOMMODATION_KINDS: ReadonlySet<string> = new Set(["hotel_property", "cruise_line"])

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed ? trimmed : null
}

function count(value: number | null | undefined): number {
  const n = Math.floor(Number(value ?? 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** "Pretoria → Cape Town" style route name or its endpoints, as prose in the booked direction. */
function proseRoute(route: ServiceRow["routes"], reversed: boolean): string | null {
  const row = firstRecord(route)
  if (!row) return null
  const origin = clean(firstRecord(row.origin)?.name)
  const destination = clean(firstRecord(row.destination)?.name)
  if (origin && destination) return reversed ? `${destination} to ${origin}` : `${origin} to ${destination}`
  const name = clean(row.name)
  return name ? name.replace(/\s*[→↔>]\s*/g, " to ") : null
}

/**
 * The booking's pax groups with everything the guest block, the availability sentence, the voucher
 * and the worksheet need. Null when the booking has fewer than two groups (no group mode) — and when
 * anything fails to load: every caller then prints what it printed before groups existed.
 */
export async function loadBookingPaxGroups(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<BookingPaxGroupsView | null> {
  try {
    const { data: groupRows, error: groupsError } = await supabase
      .from("booking_pax_groups")
      .select("id, position, label")
      .eq("booking_id", bookingId)
      .order("position", { ascending: true })
    if (groupsError || !groupRows || groupRows.length < 2) return null

    const [{ data: booking }, { data: serviceData, error: servicesError }] = await Promise.all([
      supabase.from("bookings").select("primary_supplier_id").eq("id", bookingId).maybeSingle(),
      supabase
        .from("booking_services")
        .select(
          `id, supplier_id, sort_order, service_date, route_reversed,
           suppliers(kind),
           routes(name, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name)),
           units:booking_service_units(sort_order, pax_group_ids, adult_count, child_count, infant_count, suite_type_id, bedroom_type_id, suite_types(name), bedroom_types(name), bathroom_types(name))`,
        )
        .eq("booking_id", bookingId)
        .eq("selected", true)
        .order("sort_order", { ascending: true }),
    ])
    if (servicesError) return null
    return buildBookingPaxGroupsView(
      groupRows,
      (serviceData ?? []) as unknown as ServiceRow[],
      booking?.primary_supplier_id ?? null,
    )
  } catch {
    return null
  }
}

/** The pure half of loadBookingPaxGroups, over rows already read. Exported for tests. */
export function buildBookingPaxGroupsView(
  groupRows: readonly { id: string; position: number; label: string | null }[],
  services: readonly ServiceRow[],
  primarySupplierId: string | null,
): BookingPaxGroupsView | null {
  if (groupRows.length < 2) return null
  const known = new Set(groupRows.map((group) => group.id))
  const sortedUnits = (row: ServiceRow) =>
    [...(row.units ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const kindOf = (row: ServiceRow) => firstRecord(row.suppliers)?.kind ?? null
  // The primary leg's units each anchor exactly one group. A hotel leg seeded one room per suite
  // looks the same, so the primary supplier's own leg wins.
  const anchors = (row: ServiceRow) => {
    const units = row.units ?? []
    return units.length >= 2 && units.every((unit) => (unit.pax_group_ids ?? []).length === 1 && known.has(unit.pax_group_ids?.[0] ?? ""))
  }
  const isPrimarySupplier = (row: ServiceRow) =>
    primarySupplierId ? row.supplier_id === primarySupplierId : kindOf(row) === "train_operator"
  const primaryLeg = services.find((row) => isPrimarySupplier(row) && anchors(row)) ?? services.find(anchors) ?? null

  const unitByGroup = new Map<string, UnitRow>()
  for (const unit of primaryLeg ? sortedUnits(primaryLeg) : []) {
    const groupId = unit.pax_group_ids?.[0]
    if (groupId && !unitByGroup.has(groupId)) unitByGroup.set(groupId, unit)
  }

  const suiteNames = new Map<string, string>()
  const bedroomNames = new Map<string, string>()
  for (const unit of unitByGroup.values()) {
    const suite = clean(firstRecord(unit.suite_types)?.name)
    const bedroom = clean(firstRecord(unit.bedroom_types)?.name)
    if (unit.suite_type_id && suite) suiteNames.set(unit.suite_type_id, suite)
    if (unit.bedroom_type_id && bedroom) bedroomNames.set(unit.bedroom_type_id, bedroom)
  }
  const names: PaxGroupNameLookup = {
    suiteTypeName: (id) => suiteNames.get(id) ?? null,
    bedroomTypeName: (id) => bedroomNames.get(id) ?? null,
  }

  const sortedGroups = [...groupRows].sort((a, b) => a.position - b.position)
  const groups: PaxGroupMeta[] = sortedGroups.map((group) => {
    const unit = unitByGroup.get(group.id)
    return {
      id: group.id,
      position: group.position,
      label: paxGroupLabel(
        group,
        unit ? { suiteTypeId: unit.suite_type_id, bedroomTypeId: unit.bedroom_type_id } : null,
        names,
      ),
    }
  })

  const primaryUnits: PaxGroupPrimaryUnitView[] = sortedGroups.flatMap((group) => {
    const unit = unitByGroup.get(group.id)
    if (!unit) return []
    return [
      {
        groupId: group.id,
        suiteTypeName: clean(firstRecord(unit.suite_types)?.name),
        bedroomTypeName: clean(firstRecord(unit.bedroom_types)?.name),
        bathroomTypeName: clean(firstRecord(unit.bathroom_types)?.name),
        adults: count(unit.adult_count),
        children: count(unit.child_count),
        infants: count(unit.infant_count),
      },
    ]
  })

  const rooms: PaxGroupRoomView[] = services
    .filter((row) => row !== primaryLeg && ACCOMMODATION_KINDS.has(kindOf(row) ?? ""))
    .flatMap((row) =>
      sortedUnits(row).flatMap((unit) => {
        const groupIds = [...new Set((unit.pax_group_ids ?? []).filter((id) => known.has(id)))]
        return groupIds.length > 0 ? [{ groupIds, typeName: clean(firstRecord(unit.suite_types)?.name) }] : []
      }),
    )

  return {
    groups,
    primaryUnits,
    rooms,
    primarySupplierKind: primaryLeg ? ((kindOf(primaryLeg) as SupplierKind | null) ?? null) : null,
    routeName: primaryLeg ? proseRoute(primaryLeg.routes, primaryLeg.route_reversed ?? false) : null,
    departureDate: primaryLeg?.service_date ?? null,
  }
}

/** "Twin Deluxe Suite" — a primary unit's bedroom and suite type, as its automatic name starts. */
function primaryUnitName(unit: PaxGroupPrimaryUnitView | undefined): string | null {
  if (!unit?.suiteTypeName) return null
  return [unit.bedroomTypeName, unit.suiteTypeName].filter(Boolean).join(" ")
}

function joinWithAmpersand(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`
}

/** One heading of the {{guestInfo}} block: the group listed under it. */
export interface GuestHeading {
  groupId: string
  heading: string
}

/**
 * The {{guestInfo}} headings, one per group: the automatic name without its bedroom type ("Deluxe
 * Suite 2", client markup), or the consultant's typed name as it stands.
 */
export function buildGuestHeadings(view: Pick<BookingPaxGroupsView, "groups" | "primaryUnits">): GuestHeading[] {
  const unitByGroup = new Map(view.primaryUnits.map((unit) => [unit.groupId, unit]))
  return view.groups.map((group) => {
    const unit = unitByGroup.get(group.id)
    const isAutomatic = group.label === `${primaryUnitName(unit)} ${group.position}`
    return {
      groupId: group.id,
      heading: isAutomatic && unit?.suiteTypeName ? `${unit.suiteTypeName} ${group.position}` : group.label,
    }
  })
}

type AvailabilityView = Pick<BookingPaxGroupsView, "primaryUnits" | "routeName" | "departureDate"> &
  Partial<Pick<BookingPaxGroupsView, "primarySupplierKind">>

/** The sentence's three facts, each null when unknown: the route, the date and the counted units. */
function availabilityParts(view: AvailabilityView): { route: string | null; date: string | null; units: string } | null {
  const counts = new Map<string, number>()
  for (const unit of view.primaryUnits) {
    if (!unit.suiteTypeName) continue
    // The {{suiteDescription}} grammar: "Twin bedded Deluxe Suite with a shower".
    const phrase = formatSuitePhrase({
      suiteTypeName: unit.suiteTypeName,
      bedroomType: unit.bedroomTypeName,
      bathroomType: unit.bathroomTypeName,
      supplierKind: view.primarySupplierKind ?? null,
    })
    if (phrase) counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const units = joinWithAmpersand(
    [...counts.entries()].map(([label, n]) => `${n} x ${n > 1 ? pluralUnitLabel(label) : label}`),
  )
  const date = view.departureDate ? formatDisplayDateLong(view.departureDate) || null : null
  const route = view.routeName?.trim() || null
  return { route, date, units }
}

function renderAvailability(
  { route, date, units }: { route: string | null; date: string | null; units: string },
  emphasise: (text: string) => string,
): string {
  const opening =
    route && date
      ? `On the ${emphasise(route)} departure, ${emphasise(date)} we`
      : route
        ? `On the ${emphasise(route)} departure we`
        : date
          ? `On the ${emphasise(date)} departure we`
          : "We"
  return `${opening} can still assist you with ${emphasise(units)}.`
}

/**
 * The {{availability}} sentence: "On the Pretoria to Cape Town departure, 11 August 2025 we can
 * still assist you with 5 x Twin bedded Deluxe Suites with a shower & 1 x Double bedded Deluxe Suite
 * with a shower." — the primary units counted by bedroom, suite and bathroom type, in the
 * {{suiteDescription}} grammar. Empty when no unit names a type. Plain text (a subject line, the
 * plain-text part); the body uses buildAvailabilityHtml.
 */
export function buildAvailabilitySentence(view: AvailabilityView): string {
  const parts = availabilityParts(view)
  return parts ? renderAvailability(parts, (text) => text) : ""
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/** buildAvailabilitySentence for an email body, the route, date and suites in bold as Carmen types
 *  them. Every value is escaped; the only markup is the <strong>s. */
export function buildAvailabilityHtml(view: AvailabilityView): string {
  const parts = availabilityParts(view)
  if (!parts) return ""
  return renderAvailability(
    { route: parts.route && escapeHtml(parts.route), date: parts.date && escapeHtml(parts.date), units: escapeHtml(parts.units) },
    (text) => `<strong>${text}</strong>`,
  )
}

/** A traveller placed by the guest lists: its "2.1" number, or null when it isn't in a known group. */
export interface NumberedTraveller<T> {
  traveller: T
  groupId: string | null
  /** "2.1" — the group's position, then the traveller's place in it. Null when unplaced. */
  number: string | null
}

/**
 * The travellers in pax-group order — group position, then traveller order — numbered "2.1", "2.2",
 * with the unplaced ones (no group, or a group that no longer exists) last and unnumbered. Null when
 * the booking has fewer than two groups or no traveller is placed, so callers keep today's lists.
 * Travellers are expected in their roster (sort_order) order.
 */
export function numberTravellersByPaxGroup<T extends { pax_group_id?: string | null }>(
  travellers: readonly T[],
  groups: readonly { id: string; position: number }[],
): NumberedTraveller<T>[] | null {
  if (groups.length < 2) return null
  const known = new Set(groups.map((group) => group.id))
  if (!travellers.some((traveller) => traveller.pax_group_id && known.has(traveller.pax_group_id))) return null
  const placed = [...groups]
    .sort((a, b) => a.position - b.position)
    .flatMap((group) =>
      travellers
        .filter((traveller) => traveller.pax_group_id === group.id)
        .map((traveller, index) => ({ traveller, groupId: group.id, number: `${group.position}.${index + 1}` })),
    )
  const unplaced = travellers
    .filter((traveller) => !traveller.pax_group_id || !known.has(traveller.pax_group_id))
    .map((traveller) => ({ traveller, groupId: null, number: null }))
  return [...placed, ...unplaced]
}
