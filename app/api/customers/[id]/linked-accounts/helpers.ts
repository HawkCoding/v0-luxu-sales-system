import { createSessionClient } from "@/lib/supabase/server"

export const allowedRoles = new Set(["admin", "manager"])

export type SessionClient = Awaited<ReturnType<typeof createSessionClient>>

export async function hasWriteAccess(supabase: SessionClient, userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", userId)
    .single()

  if (error || !profile) return false
  return allowedRoles.has(profile.clearance_level)
}
