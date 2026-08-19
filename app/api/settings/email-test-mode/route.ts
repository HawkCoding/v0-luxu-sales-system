import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { safeSupabaseError } from "@/lib/api/responses"
import { settingAuditMeta, writeAuditLog } from "@/lib/audit-write"
import {
  EMAIL_TEST_MODE_SETTING_KEYS,
  getEmailTestMode,
  parseTestRecipients,
} from "@/lib/email/test-mode"
import { requireSettingsWrite } from "@/lib/settings-access"

/**
 * Read is open to every signed-in role: the global banner depends on it, and a
 * consultant must be able to see that their sends are not reaching customers.
 * Writing stays with admins and managers, like every other global setting.
 */
export async function GET() {
  const access = await requireAnyRole()
  if (!access.ok) return access.response

  try {
    const settings = await getEmailTestMode(access.value.supabase)
    return NextResponse.json(settings)
  } catch {
    // Fail loud in the UI rather than silently claiming test mode is off.
    return NextResponse.json({ error: "Could not read email test mode" }, { status: 503 })
  }
}

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    // Comma-separated list; empty string clears the configured inbox.
    recipient: z.string().max(500).optional(),
  })
  .refine((body) => body.enabled !== undefined || body.recipient !== undefined, {
    message: "No fields to update",
  })

export async function PATCH(req: Request) {
  const access = await requireSettingsWrite()
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

  const { data: existingRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(EMAIL_TEST_MODE_SETTING_KEYS))
  const before = Object.fromEntries((existingRows ?? []).map((row) => [row.key, row.value]))

  const nextRecipientRaw =
    parsed.data.recipient ?? before[EMAIL_TEST_MODE_SETTING_KEYS.recipient] ?? ""
  const nextRecipients = parseTestRecipients(nextRecipientRaw)
  const nextEnabled = parsed.data.enabled ?? before[EMAIL_TEST_MODE_SETTING_KEYS.enabled] === "true"

  if (parsed.data.recipient !== undefined && nextRecipientRaw.trim() && nextRecipients.length === 0) {
    return NextResponse.json(
      { error: "Enter a valid email address, or several separated by commas" },
      { status: 400 },
    )
  }

  // Enabling without a destination would block every send instead of
  // redirecting it — reject that combination up front.
  if (nextEnabled && nextRecipients.length === 0) {
    return NextResponse.json(
      { error: "Set a test inbox address before turning test mode on" },
      { status: 400 },
    )
  }

  const updatedAt = new Date().toISOString()
  const upserts: { key: string; value: string; updated_at: string }[] = []
  if (parsed.data.enabled !== undefined) {
    upserts.push({
      key: EMAIL_TEST_MODE_SETTING_KEYS.enabled,
      value: String(parsed.data.enabled),
      updated_at: updatedAt,
    })
  }
  if (parsed.data.recipient !== undefined) {
    upserts.push({
      key: EMAIL_TEST_MODE_SETTING_KEYS.recipient,
      value: nextRecipients.join(", "),
      updated_at: updatedAt,
    })
  }

  const { error } = await supabase.from("app_settings").upsert(upserts)
  if (error) return safeSupabaseError("settings/email-test-mode", error)

  const after: Record<string, string> = {}
  for (const upsert of upserts) after[upsert.key] = upsert.value

  // Switching this off resumes real customer email — always auditable.
  await writeAuditLog(supabase, {
    actor: actorName,
    actorUserId: userId,
    entityType: "Settings",
    entityId: "email-test-mode",
    action: "settings_changed",
    before,
    after,
    meta: settingAuditMeta("email_test_mode"),
  })

  return NextResponse.json({ enabled: nextEnabled, recipients: nextRecipients })
}
