import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { BookingPaxGroup, SupplierKind } from "@/lib/types"
import { autoPaxGroupLabel, type PaxGroupNameLookup } from "@/lib/pax-groups/labels"
import { primaryLegIdOf } from "@/lib/packages/pax-groups"

/**
 * A booking's pax groups resolved for display outside Build Booking -- what the Reservation tab's
 * per-guest "Suite" select lists (GET /api/jobs/[id]/travellers `paxGroups`). Each group is one
 * unit of the booking's primary service; see lib/packages/pax-groups.ts.
 */
export interface PaxGroupSummary {
  id: string
  /** 1..N across the booking. */
  position: number
  /** The consultant's typed name, or null for the automatic one. */
  label: string | null
  /** The automatic name, from the primary unit's bedroom and suite type: "Twin Deluxe Suite 2". */
  autoLabel: string
  /** The primary unit's headcount. */
  adults: number
  children: number
  infants: number
}

/** A booking_services row as {@link summarisePaxGroups} reads it, with its units' type names. */
export interface PaxGroupServiceRow {
  id: string
  supplierId: string
  sortOrder: number
  supplierKind: SupplierKind | null
  units: Array<{
    paxGroupIds: readonly string[]
    suiteTypeId: string | null
    bedroomTypeId: string | null
    suiteTypeName: string | null
    bedroomTypeName: string | null
    adultCount: number
    childCount: number
    infantCount: number
  }>
}

/**
 * Pure half of {@link loadPaxGroupSummaries}: names and counts each group off the unit of the
 * primary leg (primaryLegIdOf -- the pricer's rule) that carries its id.
 * A group whose unit can't be found reads "Suite <n>" with no guests. Ordered by position.
 */
export function summarisePaxGroups(
  groups: readonly BookingPaxGroup[],
  services: readonly PaxGroupServiceRow[],
  primarySupplierId: string | null,
): PaxGroupSummary[] {
  const primaryLegId = primaryLegIdOf(
    services.flatMap((service) =>
      service.supplierKind ? [{ ...service, supplierKind: service.supplierKind }] : [],
    ),
    primarySupplierId,
  )
  const units = services.find((service) => service.id === primaryLegId)?.units ?? []

  const suiteTypeNames = new Map<string, string>()
  const bedroomTypeNames = new Map<string, string>()
  for (const unit of units) {
    if (unit.suiteTypeId && unit.suiteTypeName) suiteTypeNames.set(unit.suiteTypeId, unit.suiteTypeName)
    if (unit.bedroomTypeId && unit.bedroomTypeName) bedroomTypeNames.set(unit.bedroomTypeId, unit.bedroomTypeName)
  }
  const names: PaxGroupNameLookup = {
    suiteTypeName: (id) => suiteTypeNames.get(id) ?? null,
    bedroomTypeName: (id) => bedroomTypeNames.get(id) ?? null,
  }

  return groups
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((group) => {
      const unit = units.find((candidate) => candidate.paxGroupIds.includes(group.id))
      return {
        id: group.id,
        position: group.position,
        label: group.label?.trim() || null,
        autoLabel: autoPaxGroupLabel(group.position, unit, names),
        adults: unit?.adultCount ?? 0,
        children: unit?.childCount ?? 0,
        infants: unit?.infantCount ?? 0,
      }
    })
}

interface ServiceQueryRow {
  id: string
  supplier_id: string
  sort_order: number
  suppliers: { kind: string } | { kind: string }[] | null
  units:
    | Array<{
        pax_group_ids: string[] | null
        suite_type_id: string | null
        bedroom_type_id: string | null
        adult_count: number
        child_count: number
        infant_count: number
        suite_types: { name: string } | { name: string }[] | null
        bedroom_types: { name: string } | { name: string }[] | null
      }>
    | null
}

/** PostgREST returns an embedded to-one relation as an object, but has shipped it as a
 *  single-element array in the past -- normalise rather than trust one shape. */
function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

/**
 * The booking's pax groups with their automatic names and headcounts, in position order. Empty
 * (after one read) on a booking that isn't split into suites.
 */
export async function loadPaxGroupSummaries(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{ groups: PaxGroupSummary[]; error: unknown }> {
  const { data: groupRows, error: groupsError } = await supabase
    .from("booking_pax_groups")
    .select("id, position, label")
    .eq("booking_id", bookingId)
    .order("position", { ascending: true })
  if (groupsError) return { groups: [], error: groupsError }
  if (!groupRows || groupRows.length === 0) return { groups: [], error: null }

  const [{ data: booking, error: bookingError }, { data: serviceRows, error: servicesError }] = await Promise.all([
    supabase.from("bookings").select("primary_supplier_id").eq("id", bookingId).maybeSingle(),
    supabase
      .from("booking_services")
      .select(
        "id, supplier_id, sort_order, suppliers(kind), units:booking_service_units(pax_group_ids, suite_type_id, bedroom_type_id, adult_count, child_count, infant_count, suite_types(name), bedroom_types(name))",
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true }),
  ])
  if (bookingError) return { groups: [], error: bookingError }
  if (servicesError) return { groups: [], error: servicesError }

  const services: PaxGroupServiceRow[] = ((serviceRows ?? []) as unknown as ServiceQueryRow[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    sortOrder: row.sort_order,
    supplierKind: (firstRecord(row.suppliers)?.kind as SupplierKind | undefined) ?? null,
    units: (row.units ?? []).map((unit) => ({
      paxGroupIds: unit.pax_group_ids ?? [],
      suiteTypeId: unit.suite_type_id,
      bedroomTypeId: unit.bedroom_type_id,
      suiteTypeName: firstRecord(unit.suite_types)?.name ?? null,
      bedroomTypeName: firstRecord(unit.bedroom_types)?.name ?? null,
      adultCount: unit.adult_count,
      childCount: unit.child_count,
      infantCount: unit.infant_count,
    })),
  }))

  return {
    groups: summarisePaxGroups(
      groupRows.map((row) => ({ id: row.id, position: row.position, label: row.label ?? null })),
      services,
      booking?.primary_supplier_id ?? null,
    ),
    error: null,
  }
}
