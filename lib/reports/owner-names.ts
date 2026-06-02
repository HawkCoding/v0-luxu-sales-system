import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { BookingInputRow } from "./types"

type Client = SupabaseClient<Database>

/**
 * Resolves each booking's owner display name from assigned_salesperson_id so
 * reports reflect reassignments rather than the legacy `consultant` code.
 * Bookings with no assigned salesperson keep owner_name null (rendered as
 * "Unassigned" by the report functions).
 */
export async function withOwnerNames(
  supabase: Client,
  bookings: BookingInputRow[],
): Promise<BookingInputRow[]> {
  const ownerIds = Array.from(
    new Set(bookings.map((b) => b.assigned_salesperson_id).filter((id): id is string => Boolean(id))),
  )
  if (ownerIds.length === 0) {
    return bookings.map((b) => ({ ...b, owner_name: null }))
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name, surname, email")
    .in("user_id", ownerIds)

  const nameById = new Map<string, string>()
  for (const p of profiles ?? []) {
    const label = [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email
    nameById.set(p.user_id, label)
  }

  return bookings.map((b) => ({
    ...b,
    owner_name: b.assigned_salesperson_id ? nameById.get(b.assigned_salesperson_id) ?? null : null,
  }))
}
