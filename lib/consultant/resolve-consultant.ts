import type { SupabaseClient } from "@supabase/supabase-js"
import { CONSULTANTS } from "@/lib/types"
import type { Database } from "@/lib/supabase/types"

export interface ResolvedConsultant {
  key: string
  name: string
}

/**
 * Resolves a booking's consultant for display on client documents (voucher, itinerary, invoice).
 * `bookings.consultant` is a legacy free-text abbreviation (LB, CDJ, ...) that predates
 * `assigned_salesperson_id`, and not every booking-creation path stamps it. Falls back to the
 * assigned salesperson's profile name rather than asserting a hard-coded default — a wrong name
 * on a client document is worse than a blank field.
 */
export async function resolveConsultant(
  supabase: SupabaseClient<Database>,
  booking: { consultant: string | null; assigned_salesperson_id: string | null },
): Promise<ResolvedConsultant | null> {
  const known = CONSULTANTS.find((item) => item.key === booking.consultant)
  if (known) return known

  if (!booking.assigned_salesperson_id) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, surname")
    .eq("user_id", booking.assigned_salesperson_id)
    .maybeSingle()

  const nameParts = [profile?.name, profile?.surname].filter((part): part is string => Boolean(part?.trim()))
  if (nameParts.length === 0) return null

  const fullName = nameParts.join(" ").trim()
  const initials = nameParts.map((part) => part.trim()[0]?.toUpperCase() ?? "").join("")

  return { key: initials || fullName, name: fullName }
}
