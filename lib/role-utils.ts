import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { Role } from "./types"

const VALID_ROLES: ReadonlySet<Role> = new Set(["admin", "manager", "consultant", "readonly"])

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && VALID_ROLES.has(value as Role)
}

export function extractRoleFromJwt(user: SupabaseUser | null | undefined): Role | null {
  const raw = user?.app_metadata?.clearance_level
  return isRole(raw) ? raw : null
}
