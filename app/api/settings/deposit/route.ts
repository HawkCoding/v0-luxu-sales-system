import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY,
  parseDepositPercentage,
} from "@/lib/pipeline/constants"
import { createSessionClient } from "@/lib/supabase/server"
import { getDepositRefundable } from "@/lib/settings-access"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

const allowedRoles = new Set(["admin", "manager"])

/** Read by app/api/jobs/[id]/cancel to decide whether a cancelled booking's paid deposit is
 * refunded or kept as the cancellation fee (lib/settings-access.ts, getDepositRefundable). */
const DEPOSIT_REFUNDABLE_SETTING_KEY = "deposit_refundable"

// Both fields are optional so the card can save either control on its own; at least one must be
// present, mirroring the partial-group write the banking route does.
const patchSchema = z
  .object({
    defaultDepositPercentage: z.number().min(0).max(100).optional(),
    depositRefundable: z.boolean().optional(),
  })
  .refine(
    (data) => data.defaultDepositPercentage !== undefined || data.depositRefundable !== undefined,
    { message: "No fields to update" },
  )

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

  if (error) return safeSupabaseError("settings/deposit", error)

  const depositRefundable = await getDepositRefundable(context.value.supabase)

  return NextResponse.json({
    defaultDepositPercentage: parseDepositPercentage(data?.value),
    depositRefundable,
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
    .eq("key", DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY)
    .maybeSingle()
  const existingRefundable = await getDepositRefundable(context.value.supabase)

  const updatedAt = new Date().toISOString()
  const upserts: { key: string; value: string; updated_at: string }[] = []

  const value =
    parsed.data.defaultDepositPercentage !== undefined
      ? String(parseDepositPercentage(parsed.data.defaultDepositPercentage))
      : null
  if (value !== null) {
    upserts.push({ key: DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY, value, updated_at: updatedAt })
  }
  if (parsed.data.depositRefundable !== undefined) {
    upserts.push({
      key: DEPOSIT_REFUNDABLE_SETTING_KEY,
      value: String(parsed.data.depositRefundable),
      updated_at: updatedAt,
    })
  }

  const { error } = await context.value.supabase.from("app_settings").upsert(upserts)

  if (error) return safeSupabaseError("settings/deposit", error)

  const nextPercentage = value !== null ? Number(value) : parseDepositPercentage(existing?.value)
  const nextRefundable = parsed.data.depositRefundable ?? existingRefundable

  await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: "deposit",
    action: "settings_changed",
    before: {
      defaultDepositPercentage: existing?.value != null ? Number(existing.value) : null,
      depositRefundable: existingRefundable,
    },
    after: { defaultDepositPercentage: nextPercentage, depositRefundable: nextRefundable },
    meta: settingAuditMeta(DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY),
  })

  return NextResponse.json({
    defaultDepositPercentage: nextPercentage,
    depositRefundable: nextRefundable,
  })
}
