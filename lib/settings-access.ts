import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export interface SettingsAccessContext {
  supabase: Awaited<ReturnType<typeof createSessionClient>>
  userId: string
  actorName: string
}

export async function requireAdminSettingsAccess(): Promise<
  | { ok: true; value: SettingsAccessContext }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, surname, email, clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    value: {
      supabase,
      userId: user.id,
      actorName: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email,
    },
  }
}
