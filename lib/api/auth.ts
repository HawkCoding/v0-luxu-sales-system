import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import type { Role } from "@/lib/types"

export interface ApiAuthProfile {
  clearanceLevel: string
  isActive: boolean
  name: string | null
  surname: string | null
  email: string | null
  actorName: string
}

export interface ApiAuthContext {
  supabase: Awaited<ReturnType<typeof createSessionClient>>
  user: { id: string; email?: string }
  profile: ApiAuthProfile
}

export type ApiAuthResult =
  | { ok: true; value: ApiAuthContext }
  | { ok: false; response: NextResponse }

function buildActorName(profile: { name: string | null; surname: string | null; email: string | null }, fallback: string): string {
  const composed = [profile.name, profile.surname].filter(Boolean).join(" ").trim()
  return composed || profile.email || fallback
}

export async function requireUser(): Promise<ApiAuthResult> {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, is_active, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.is_active === false) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return {
    ok: true,
    value: {
      supabase,
      user: { id: user.id, email: user.email ?? undefined },
      profile: {
        clearanceLevel: profile.clearance_level,
        isActive: profile.is_active ?? true,
        name: profile.name,
        surname: profile.surname,
        email: profile.email,
        actorName: buildActorName(profile, user.email ?? "system"),
      },
    },
  }
}

export async function requireRole(roles: ReadonlyArray<Role | string>): Promise<ApiAuthResult> {
  const auth = await requireUser()
  if (!auth.ok) return auth

  if (!roles.includes(auth.value.profile.clearanceLevel)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return auth
}
