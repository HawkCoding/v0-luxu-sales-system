import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { createSessionClient } from "@/lib/supabase/server"
import {
  TRAIN_CHILD_PRICE_RATIO_SETTING_KEY,
  normalizeTrainChildPriceRatio,
  parseTrainChildPriceRatio,
} from "@/lib/suppliers/auto-child-price"

const patchSchema = z.object({
  ratio: z.number().min(0).max(1),
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
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
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
      userId: user.id,
      actorName:
        [profile.name, profile.surname].filter(Boolean).join(" ").trim() ||
        profile.email ||
        user.email ||
        "system",
    },
  }
}

export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  const { data, error } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", TRAIN_CHILD_PRICE_RATIO_SETTING_KEY)
    .maybeSingle()

  if (error) return safeSupabaseError("settings/train-child-price-ratio", error)

  return NextResponse.json({
    ratio: parseTrainChildPriceRatio(data?.value),
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
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const normalized = normalizeTrainChildPriceRatio(parsed.data.ratio)
  const value = String(normalized)

  const { data: existingSetting, error: existingError } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", TRAIN_CHILD_PRICE_RATIO_SETTING_KEY)
    .maybeSingle()

  if (existingError) {
    return safeSupabaseError("settings/train-child-price-ratio", existingError)
  }

  const { error } = await context.value.supabase.from("app_settings").upsert({
    key: TRAIN_CHILD_PRICE_RATIO_SETTING_KEY,
    value,
    updated_at: new Date().toISOString(),
  })

  if (error) return safeSupabaseError("settings/train-child-price-ratio", error)

  const auditResult = await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: TRAIN_CHILD_PRICE_RATIO_SETTING_KEY,
    action: "settings_changed",
    before: { value: existingSetting?.value ?? null },
    after: { value },
    meta: settingAuditMeta(TRAIN_CHILD_PRICE_RATIO_SETTING_KEY),
  })
  if (auditResult.error) {
    return NextResponse.json(
      { error: "Failed to write settings audit log" },
      { status: 500 },
    )
  }

  return NextResponse.json({ ratio: normalized })
}
