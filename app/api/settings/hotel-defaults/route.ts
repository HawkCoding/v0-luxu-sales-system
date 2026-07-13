import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  FALLBACK_HOTEL_CHECK_IN_TIME,
  FALLBACK_HOTEL_CHECK_OUT_TIME,
  HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY,
  HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY,
  getHotelDefaultTimes,
  parseTimeOfDay,
} from "@/lib/suppliers/hotel-default-times"
import { createSessionClient } from "@/lib/supabase/server"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

const allowedRoles = new Set(["admin", "manager"])

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const patchSchema = z.object({
  checkInTime: z.string().regex(TIME_PATTERN, "Expected HH:MM"),
  checkOutTime: z.string().regex(TIME_PATTERN, "Expected HH:MM"),
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

  const times = await getHotelDefaultTimes(context.value.supabase)

  return NextResponse.json({
    checkInTime: times.checkIn,
    checkOutTime: times.checkOut,
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

  const existing = await getHotelDefaultTimes(context.value.supabase)

  const checkInTime = parseTimeOfDay(parsed.data.checkInTime, FALLBACK_HOTEL_CHECK_IN_TIME)
  const checkOutTime = parseTimeOfDay(parsed.data.checkOutTime, FALLBACK_HOTEL_CHECK_OUT_TIME)
  const now = new Date().toISOString()

  const { error } = await context.value.supabase.from("app_settings").upsert([
    { key: HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY, value: checkInTime, updated_at: now },
    { key: HOTEL_DEFAULT_CHECK_OUT_TIME_SETTING_KEY, value: checkOutTime, updated_at: now },
  ])

  if (error) return safeSupabaseError("settings/hotel-defaults", error)

  await writeAuditLog(context.value.supabase, {
    actor: context.value.actorName,
    actorUserId: context.value.userId,
    entityType: "Settings",
    entityId: "hotel-defaults",
    action: "settings_changed",
    before: { checkInTime: existing.checkIn, checkOutTime: existing.checkOut },
    after: { checkInTime, checkOutTime },
    meta: settingAuditMeta(HOTEL_DEFAULT_CHECK_IN_TIME_SETTING_KEY),
  })

  return NextResponse.json({ checkInTime, checkOutTime })
}
