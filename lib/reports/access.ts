/**
 * Reporting access gate shared by /app/reporting and /api/reports/*.
 *
 * Reporting is a per-user grant (`profiles.can_view_reporting`), switched on
 * by an admin in Settings -> Users. It is independent of role: admins start
 * without it too. An inactive account or a retired clearance level never
 * passes, whatever the flag says.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { isRole } from "@/lib/role-utils"
import type { Database } from "@/lib/supabase/types"

export async function canUserViewReporting(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("clearance_level, is_active, can_view_reporting")
    .eq("user_id", userId)
    .single()

  if (error || !profile) return false
  if (!isRole(profile.clearance_level)) return false
  if (profile.is_active === false) return false
  return profile.can_view_reporting === true
}
