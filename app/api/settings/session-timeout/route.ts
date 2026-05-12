import { NextResponse } from "next/server"
import { z } from "zod"
import {
  getSessionTimeoutWarningMinutes,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
  parseSessionTimeoutMinutes,
  SESSION_TIMEOUT_SETTING_KEY,
} from "@/lib/session-timeout"
import { createSessionClient } from "@/lib/supabase/server"

const patchSchema = z.object({
  sessionTimeoutMinutes: z
    .number()
    .int()
    .min(MIN_SESSION_TIMEOUT_MINUTES)
    .max(MAX_SESSION_TIMEOUT_MINUTES),
})

async function getAuthenticatedContext() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, is_active")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.is_active === false) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true as const,
    value: {
      supabase,
      canEdit: profile.clearance_level === "admin",
    },
  }
}

export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  const { data, error } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", SESSION_TIMEOUT_SETTING_KEY)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessionTimeoutMinutes = parseSessionTimeoutMinutes(data?.value)
  return NextResponse.json({
    sessionTimeoutMinutes,
    warningMinutes: getSessionTimeoutWarningMinutes(sessionTimeoutMinutes),
    canEdit: context.value.canEdit,
  })
}

export async function PATCH(req: Request) {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  if (!context.value.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const value = String(parseSessionTimeoutMinutes(parsed.data.sessionTimeoutMinutes))
  const { error } = await context.value.supabase
    .from("app_settings")
    .upsert({
      key: SESSION_TIMEOUT_SETTING_KEY,
      value,
      updated_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessionTimeoutMinutes = Number(value)
  return NextResponse.json({
    sessionTimeoutMinutes,
    warningMinutes: getSessionTimeoutWarningMinutes(sessionTimeoutMinutes),
  })
}
