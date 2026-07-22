// Loads the suite + configuration a booking actually selected, for the
// accommodation email tokens. Used by send paths that only have a booking id
// (voucher, itinerary); quote emails read the version-locked pricing snapshots
// via suiteSelectionsFromSnapshots instead.

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"
import type { SuiteSelection } from "@/lib/templates/suite-description"

const SELECT =
  "id, units:booking_package_selection_units(sort_order, " +
  "suite_type:suite_types(name), bedroom_type:bedroom_types(name), " +
  "bedroom_layout:bedroom_layouts(name), bathroom_type:bathroom_types(name))"

type NamedRow = { name: string | null } | { name: string | null }[] | null

interface UnitJoinRow {
  sort_order: number | null
  suite_type: NamedRow
  bedroom_type: NamedRow
  bedroom_layout: NamedRow
  bathroom_type: NamedRow
}

interface SelectionJoinRow {
  id: string
  units: UnitJoinRow[] | null
}

function nameOf(value: NamedRow): string | null {
  const row = Array.isArray(value) ? value[0] : value
  return row?.name ?? null
}

/**
 * Returns one entry per selected suite unit, ordered by sort_order. Resolves to
 * an empty list on error so a missing accommodation line never fails a send.
 */
export async function loadSuiteSelections(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<SuiteSelection[]> {
  const { data, error } = await supabase
    .from("booking_package_selections")
    .select(SELECT)
    .eq("booking_id", bookingId)
    .eq("selected", true)

  if (error || !data) return []

  // Nested embeds outrun the generated select-string inference, as elsewhere in
  // the codebase (see lib/voucher/build-service-blocks.ts).
  const selections = data as unknown as SelectionJoinRow[]
  const units = selections.flatMap((selection) => selection.units ?? [])

  return units
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((unit) => ({
      suiteTypeName: nameOf(unit.suite_type) ?? "",
      bedroomType: nameOf(unit.bedroom_type),
      bedroomLayout: nameOf(unit.bedroom_layout),
      bathroomType: nameOf(unit.bathroom_type),
    }))
    .filter((selection) => selection.suiteTypeName.length > 0)
}
