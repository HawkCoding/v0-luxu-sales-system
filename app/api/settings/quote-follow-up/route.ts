import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireManagerSettingsAccess } from "@/lib/settings-access"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"

// Follow-up email wording is edited on the Templates page (templates table,
// key: follow_up). This route only manages the enabled flag and cadence.
const KEYS = {
  enabled: "quote_follow_up_enabled",
  cadence: "quote_follow_up_cadence",
} as const

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  cadence: z.array(z.number().int().min(1)).optional(),
})

export async function GET() {
  const access = await requireManagerSettingsAccess()
  if (!access.ok) return access.response

  const { supabase } = access.value

  const { data: rows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(KEYS))

  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]))

  let cadence: number[] = [3, 7]
  try {
    const parsed: unknown = JSON.parse(map[KEYS.cadence] ?? "")
    if (Array.isArray(parsed)) cadence = parsed.filter((v): v is number => typeof v === "number")
  } catch {
    // use default
  }

  return NextResponse.json({
    enabled: map[KEYS.enabled] !== "false",
    cadence,
  })
}

export async function PATCH(req: Request) {
  const access = await requireManagerSettingsAccess()
  if (!access.ok) return access.response

  const { supabase, userId, actorName } = access.value

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

  const { enabled, cadence } = parsed.data

  // Fetch before-values for audit
  const { data: existing } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(KEYS))
  const before = Object.fromEntries((existing ?? []).map((r) => [r.key, r.value]))

  const upserts: { key: string; value: string; updated_at: string }[] = []
  if (enabled !== undefined) {
    upserts.push({ key: KEYS.enabled, value: String(enabled), updated_at: new Date().toISOString() })
  }
  if (cadence !== undefined) {
    upserts.push({ key: KEYS.cadence, value: JSON.stringify(cadence), updated_at: new Date().toISOString() })
  }

  if (upserts.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { error } = await supabase.from("app_settings").upsert(upserts)
  if (error) return safeSupabaseError("settings/quote-follow-up", error)

  const after: Record<string, string> = {}
  for (const u of upserts) after[u.key] = u.value

  await writeAuditLog(supabase, {
    actor: actorName,
    actorUserId: userId,
    entityType: "Settings",
    entityId: "quote-follow-up",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta("quote_follow_up"),
  })

  return NextResponse.json({
    enabled: enabled ?? before[KEYS.enabled] !== "false",
    cadence: cadence ?? JSON.parse(before[KEYS.cadence] ?? "[3,7]"),
  })
}
