import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { createSessionClient } from "@/lib/supabase/server"
import { AGE_SETTINGS_KEYS, DEFAULT_AGE_BUCKETS } from "@/lib/pricing/age-buckets"
import { SETTINGS_WRITE_ROLES } from "@/lib/permissions"

const patchSchema = z
  .object({
    infantMaxAge: z.number().int().min(0).max(17),
    childMaxAge: z.number().int().min(0).max(17),
  })
  .refine((value) => value.infantMaxAge <= value.childMaxAge, {
    message: "Infant max age must be less than or equal to child max age",
    path: ["infantMaxAge"],
  })

async function getAuthenticatedContext() {
  const supabase = await createSessionClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()
  if (profileError || !profile) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return {
    ok: true as const,
    value: {
      supabase,
      canEdit: (SETTINGS_WRITE_ROLES as readonly string[]).includes(profile.clearance_level),
      userId: user.id,
      actorName:
        [profile.name, profile.surname].filter(Boolean).join(" ").trim() ||
        profile.email ||
        user.email ||
        "system",
    },
  }
}

function parseAge(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 17) return fallback
  return Math.floor(parsed)
}

export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  const { data, error } = await context.value.supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [AGE_SETTINGS_KEYS.INFANT, AGE_SETTINGS_KEYS.CHILD])

  if (error) return safeSupabaseError("settings/age-bands", error)

  const map = new Map<string, string>((data ?? []).map((row) => [row.key, row.value]))
  return NextResponse.json({
    infantMaxAge: parseAge(map.get(AGE_SETTINGS_KEYS.INFANT), DEFAULT_AGE_BUCKETS.infantMax),
    childMaxAge: parseAge(map.get(AGE_SETTINGS_KEYS.CHILD), DEFAULT_AGE_BUCKETS.childMax),
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: existing, error: existingError } = await context.value.supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [AGE_SETTINGS_KEYS.INFANT, AGE_SETTINGS_KEYS.CHILD])
  if (existingError) return safeSupabaseError("settings/age-bands", existingError)

  const existingMap = new Map<string, string>((existing ?? []).map((row) => [row.key, row.value]))
  const now = new Date().toISOString()
  const rows = [
    {
      key: AGE_SETTINGS_KEYS.INFANT,
      value: String(parsed.data.infantMaxAge),
      updated_at: now,
    },
    {
      key: AGE_SETTINGS_KEYS.CHILD,
      value: String(parsed.data.childMaxAge),
      updated_at: now,
    },
  ]

  const { error } = await context.value.supabase.from("app_settings").upsert(rows)
  if (error) return safeSupabaseError("settings/age-bands", error)

  const auditResult = await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: "age_bands",
    action: "settings_changed",
    before: {
      infantMaxAge: existingMap.get(AGE_SETTINGS_KEYS.INFANT) ?? null,
      childMaxAge: existingMap.get(AGE_SETTINGS_KEYS.CHILD) ?? null,
    },
    after: { infantMaxAge: parsed.data.infantMaxAge, childMaxAge: parsed.data.childMaxAge },
    meta: settingAuditMeta("age_bands"),
  })
  if (auditResult.error) {
    return NextResponse.json({ error: "Failed to write settings audit log" }, { status: 500 })
  }

  return NextResponse.json({
    infantMaxAge: parsed.data.infantMaxAge,
    childMaxAge: parsed.data.childMaxAge,
  })
}
