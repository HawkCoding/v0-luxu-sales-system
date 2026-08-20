import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface RoomOverrideProvenance {
  setAt: string | null
  setByName: string | null
}

/**
 * Display name for each of the given profile ids, keyed by id. Shared by hotel and transport
 * override provenance — both stamp a "who set this price" name into a quote line's pricing
 * snapshot from the same profiles table.
 *
 * Safe to call with an empty/all-null id list. An id that doesn't resolve to a profile is simply
 * absent from the map.
 */
export async function resolveOverrideSetterNames(
  supabase: SupabaseClient<Database>,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const nameByUserId = new Map<string, string>()
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
  if (ids.length === 0) return nameByUserId

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name, surname, email")
    .in("user_id", ids)

  for (const profile of profiles ?? []) {
    const name = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email
    if (name) nameByUserId.set(profile.user_id, name)
  }

  return nameByUserId
}

/**
 * Who put a hotel room's manual price there, and when — read from booking_service_units rather
 * than taken from the request, so the trail stamped into a quote line's pricing snapshot is the
 * server's record and not something a client asserted about itself.
 *
 * Safe to call with an empty id list. Rooms with no override (or ids that don't resolve) are
 * simply absent from the map; a missing entry is never an error, it just means the line renders
 * the amount without a "set by" note.
 */
export async function loadRoomOverrideProvenance(
  supabase: SupabaseClient<Database>,
  unitIds: readonly string[],
): Promise<Map<string, RoomOverrideProvenance>> {
  const provenance = new Map<string, RoomOverrideProvenance>()
  const ids = Array.from(new Set(unitIds.filter(Boolean)))
  if (ids.length === 0) return provenance

  const { data: units, error } = await supabase
    .from("booking_service_units")
    .select("id, manual_room_price_set_at, manual_room_price_set_by")
    .in("id", ids)
    .not("manual_room_price", "is", null)

  if (error || !units || units.length === 0) return provenance

  const nameByUserId = await resolveOverrideSetterNames(
    supabase,
    units.map((unit) => unit.manual_room_price_set_by),
  )

  for (const unit of units) {
    provenance.set(unit.id, {
      setAt: unit.manual_room_price_set_at,
      setByName: unit.manual_room_price_set_by ? nameByUserId.get(unit.manual_room_price_set_by) ?? null : null,
    })
  }

  return provenance
}

/**
 * Who put a tour unit's manual price there, and when — read from booking_service_units rather
 * than taken from the request, same reasoning as loadRoomOverrideProvenance.
 *
 * Safe to call with an empty id list. Units with no override (or ids that don't resolve) are
 * simply absent from the map; a missing entry is never an error, it just means the line renders
 * the amount without a "set by" note.
 */
export async function loadTourOverrideProvenance(
  supabase: SupabaseClient<Database>,
  unitIds: readonly string[],
): Promise<Map<string, RoomOverrideProvenance>> {
  const provenance = new Map<string, RoomOverrideProvenance>()
  const ids = Array.from(new Set(unitIds.filter(Boolean)))
  if (ids.length === 0) return provenance

  const { data: units, error } = await supabase
    .from("booking_service_units")
    .select("id, manual_tour_price_set_at, manual_tour_price_set_by")
    .in("id", ids)
    .not("manual_tour_price", "is", null)

  if (error || !units || units.length === 0) return provenance

  const nameByUserId = await resolveOverrideSetterNames(
    supabase,
    units.map((unit) => unit.manual_tour_price_set_by),
  )

  for (const unit of units) {
    provenance.set(unit.id, {
      setAt: unit.manual_tour_price_set_at,
      setByName: unit.manual_tour_price_set_by ? nameByUserId.get(unit.manual_tour_price_set_by) ?? null : null,
    })
  }

  return provenance
}
