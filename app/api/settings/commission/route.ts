import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  DEFAULT_COMMISSION_TYPE_SETTING_KEY,
  DEFAULT_COMMISSION_VALUE_SETTING_KEY,
  getDefaultCommission,
  normalizeCommissionValue,
} from "@/lib/pricing/default-commission"
import { createSessionClient } from "@/lib/supabase/server"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import { SETTINGS_WRITE_ROLES } from "@/lib/permissions"

// A percent commission is bounded here rather than left to normalizeCommissionValue's clamp:
// clamping happens after validation, so 250 would save as 100 and report 200 OK — the admin
// would never learn the value they typed was not the value stored.
const patchSchema = z
  .object({
    type: z.enum(["percent", "per_person", "fixed"]),
    value: z.number().min(0).max(1_000_000),
  })
  .superRefine((data, ctx) => {
    if (data.type === "percent" && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percent commission must be between 0 and 100",
      })
    }
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
      canEdit: (SETTINGS_WRITE_ROLES as readonly string[]).includes(profile.clearance_level),
    },
  }
}

/** Readable by any authenticated user -- Build Booking pre-fills its commission field from this,
 * and a salesperson has to be able to read the house default to start from it. */
export async function GET() {
  const context = await getAuthenticatedContext()
  if (!context.ok) return context.response

  const defaultCommission = await getDefaultCommission(context.value.supabase)

  return NextResponse.json({
    defaultCommission,
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

  const before = await getDefaultCommission(context.value.supabase)
  const next = {
    type: parsed.data.type,
    value: normalizeCommissionValue(parsed.data.type, parsed.data.value),
  }

  const updatedAt = new Date().toISOString()
  const { error } = await context.value.supabase.from("app_settings").upsert([
    { key: DEFAULT_COMMISSION_TYPE_SETTING_KEY, value: next.type, updated_at: updatedAt },
    { key: DEFAULT_COMMISSION_VALUE_SETTING_KEY, value: String(next.value), updated_at: updatedAt },
  ])

  if (error) return safeSupabaseError("settings/commission", error)

  await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: "commission",
    action: "settings_changed",
    before: { commissionType: before.type, commissionValue: before.value },
    after: { commissionType: next.type, commissionValue: next.value },
    meta: settingAuditMeta(DEFAULT_COMMISSION_VALUE_SETTING_KEY),
  })

  return NextResponse.json({ defaultCommission: next })
}
