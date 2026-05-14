import { NextResponse } from "next/server"
import { z } from "zod"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY,
  parseDepositPercentage,
} from "@/lib/pipeline/constants"
import { createSessionClient } from "@/lib/supabase/server"

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

  return {
    ok: true as const,
    value: {
      supabase,
      canEdit: allowedRoles.has(profile.clearance_level),
      userId: user.id,
      actorName: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email || user.email || "system",
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

  const value = String(parseDepositPercentage(parsed.data.defaultDepositPercentage))
  const { data: existingSetting, error: existingError } = await context.value.supabase
    .from("app_settings")
    .select("value")
    .eq("key", DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY)
    .maybeSingle()

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const { error } = await context.value.supabase
    .from("app_settings")
    .upsert({
      key: DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY,
      value,
      updated_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const auditResult = await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY,
    action: "settings_changed",
    before: { value: existingSetting?.value ?? null },
    after: { value },
    meta: settingAuditMeta(DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY),
  })
  if (auditResult.error) return NextResponse.json({ error: "Failed to write settings audit log" }, { status: 500 })

  return NextResponse.json({ defaultDepositPercentage: Number(value) })
}
