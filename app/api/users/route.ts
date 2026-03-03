/**
 * GET /api/users
 *
 * Admin-only: list app users (profiles) for user management UI.
 */

import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, email, name, surname, clearance_level")
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (profiles ?? []).map((p) => ({
    userId: p.user_id,
    email: p.email,
    name: [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email,
    clearanceLevel: p.clearance_level,
  }))

  return NextResponse.json({ users })
}
