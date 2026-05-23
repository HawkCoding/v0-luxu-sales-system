import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

export interface SettingsAccessContext {
  supabase: Awaited<ReturnType<typeof createSessionClient>>
  userId: string
  actorName: string
  role: string
}

export async function requireAdminSettingsAccess(): Promise<
  | { ok: true; value: SettingsAccessContext }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, surname, email, clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    value: {
      supabase,
      userId: user.id,
      role: profile.clearance_level,
      actorName: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email,
    },
  }
}

export async function requireManagerSettingsAccess(): Promise<
  | { ok: true; value: SettingsAccessContext }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, surname, email, clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !["admin", "manager"].includes(profile.clearance_level)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    value: {
      supabase,
      userId: user.id,
      role: profile.clearance_level,
      actorName: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email,
    },
  }
}

export async function getPaymentReferenceRequired(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "payment_reference_required")
    .maybeSingle()
  return data?.value === "true"
}

export async function getPaymentReminderSettings(
  supabase: SupabaseClient<Database>,
): Promise<{ enabled: boolean; cadence: number[] }> {
  const { data: rows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["payment_reminder_enabled", "payment_reminder_cadence"])

  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]))

  const enabled = map["payment_reminder_enabled"] !== "false"
  let cadence: number[] = [3, 7, 14]
  try {
    const parsed: unknown = JSON.parse(map["payment_reminder_cadence"] ?? "")
    if (Array.isArray(parsed)) cadence = parsed.filter((v): v is number => typeof v === "number")
  } catch {
    // use default cadence
  }

  return { enabled, cadence }
}

const DEFAULT_ATTACHMENT_MAX_SIZE_MB = 10
const DEFAULT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const

export async function getAttachmentMaxSizeMb(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "attachment_max_size_mb")
    .maybeSingle()
  const parsed = Number(data?.value ?? "")
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ATTACHMENT_MAX_SIZE_MB
}

export async function getAttachmentAllowedMimeTypes(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "attachment_allowed_mime_types")
    .maybeSingle()

  if (data?.value) {
    try {
      const parsed: unknown = JSON.parse(data.value)
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((v): v is string => typeof v === "string" && v.length > 0)
        if (filtered.length > 0) return filtered
      }
    } catch {
      // fall through to default
    }
  }
  return [...DEFAULT_ATTACHMENT_ALLOWED_MIME_TYPES]
}
