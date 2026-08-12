/**
 * Admin gate shared by the user-management routes.
 *
 * Returns 401 for an unauthenticated caller and 403 for an authenticated
 * non-admin, per the API contract in CLAUDE.md.
 */

import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export interface AdminContext {
  adminUserId: string
  adminName: string
}

export type RequireAdminResult =
  | { ok: true; value: AdminContext }
  | { ok: false; status: 401 | 403 }

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, status: 401 }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, surname, clearance_level, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return { ok: false, status: 403 }
  }

  return {
    ok: true,
    value: {
      adminUserId: user.id,
      adminName: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email,
    },
  }
}

export function adminAuthErrorResponse(status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: status === 401 ? "Unauthorized" : "Forbidden" },
    { status }
  )
}
