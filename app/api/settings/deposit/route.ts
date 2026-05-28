import { NextResponse } from "next/server"
import { z } from "zod"
import {
  DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY,
  parseDepositPercentage,
} from "@/lib/pipeline/constants"
import { createSessionClient } from "@/lib/supabase/server"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

const allowedRoles = new Set(["admin", "manager"])

const patchSchema = z.object({
  defaultDepositPercentage: z.number().min(0).max(100),
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
      canEdit: allowedRoles.has(profile.clearance_level),
    },
  }
}

export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  const { data, error } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    defaultDepositPercentage: parseDepositPercentage(data?.value),
    canEdit: context.value.canEdit,
  })
}

export async function PATCH(req: Request) {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  if (!context.value.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: existing } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY)
    .maybeSingle()

  const value = String(parseDepositPercentage(parsed.data.defaultDepositPercentage))
  const { error } = await context.value.supabase
    .from("app_settings")
    .upsert({
      key: DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY,
      value,
      updated_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: "deposit",
    action: "settings_changed",
    before: { defaultDepositPercentage: existing?.value ?? null },
    after: { defaultDepositPercentage: Number(value) },
    meta: settingAuditMeta(DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY),
  })

  return NextResponse.json({ defaultDepositPercentage: Number(value) })
}
