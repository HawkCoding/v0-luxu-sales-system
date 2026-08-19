import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { DEFAULT_QUOTE_VALIDITY_DAYS } from "@/lib/quotes/quote-validity"
import { SETTINGS_WRITE_ROLES } from "@/lib/permissions"

// app_settings key consumed by POST /api/quotes (app/api/quotes/route.ts) and
// POST /api/jobs/[id]/start-quote to set each new quote's validity_until.
const QUOTE_VALIDITY_DAYS_SETTING_KEY = "quote_validity_days"

const patchSchema = z.object({
  quoteValidityDays: z.number().int().min(1).max(365),
})

function parseQuoteValidityDays(value: string | null | undefined): number {
  if (value == null) return DEFAULT_QUOTE_VALIDITY_DAYS
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) return DEFAULT_QUOTE_VALIDITY_DAYS
  return parsed
}

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
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  const actorName =
    [profile.name, profile.surname].filter(Boolean).join(" ").trim() ||
    profile.email ||
    user.email ||
    "unknown"

  return {
    ok: true as const,
    value: {
      supabase,
      userId: user.id,
      actorName,
      canEdit: (SETTINGS_WRITE_ROLES as readonly string[]).includes(profile.clearance_level),
    },
  }
}

export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  const { data, error } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", QUOTE_VALIDITY_DAYS_SETTING_KEY)
    .maybeSingle()

  if (error) return safeSupabaseError("settings/quote-validity", error)

  return NextResponse.json({
    quoteValidityDays: parseQuoteValidityDays(data?.value),
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

  const { data: existing } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", QUOTE_VALIDITY_DAYS_SETTING_KEY)
    .maybeSingle()

  const value = String(parsed.data.quoteValidityDays)
  const { error } = await context.value.supabase
    .from("app_settings")
    .upsert({
      key: QUOTE_VALIDITY_DAYS_SETTING_KEY,
      value,
      updated_at: new Date().toISOString(),
    })

  if (error) return safeSupabaseError("settings/quote-validity", error)

  await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: "quote-validity",
    action: "settings_changed",
    before: { quoteValidityDays: existing?.value != null ? Number(existing.value) : null },
    after: { quoteValidityDays: Number(value) },
    meta: settingAuditMeta(QUOTE_VALIDITY_DAYS_SETTING_KEY),
  })

  return NextResponse.json({ quoteValidityDays: Number(value) })
}
