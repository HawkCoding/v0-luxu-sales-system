import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"
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

// Follow-up email wording lives in the templates table (key: follow_up) —
// only the enabled flag and cadence are app settings.
export async function getQuoteFollowUpSettings(
  supabase: SupabaseClient<Database>,
): Promise<{ enabled: boolean; cadence: number[] }> {
  const { data: rows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["quote_follow_up_enabled", "quote_follow_up_cadence"])

  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]))

  const enabled = map["quote_follow_up_enabled"] === "true"
  let cadence: number[] = [3, 7]
  try {
    const parsed: unknown = JSON.parse(map["quote_follow_up_cadence"] ?? "")
    if (Array.isArray(parsed)) cadence = parsed.filter((v): v is number => typeof v === "number")
  } catch {
    // use default cadence
  }

  return { enabled, cadence }
}

export async function getDepositRefundable(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "deposit_refundable")
    .maybeSingle()
  return data?.value === "true"
}

export async function getReadOnlyExportsAllowed(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "read_only_exports_allowed")
    .maybeSingle()
  return data?.value === "true"
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

// Email wording lives in the templates table (Templates page); these keys
// only cover text rendered into the generated PDFs themselves.
export const DOCUMENT_TEXT_SETTING_KEYS = [
  "quote_doc_title",
  "quote_doc_footer_text",
  "quote_doc_includes_heading",
  "quote_doc_excludes_heading",
  "quote_doc_excludes_default",
  "voucher_doc_title",
  "invoice_doc_deposit_title",
  "invoice_doc_final_title",
  "invoice_doc_footer_text",
  "itinerary_doc_journey_heading",
  "itinerary_doc_intro_text",
] as const

export type DocumentTextSettings = Record<(typeof DOCUMENT_TEXT_SETTING_KEYS)[number], string>

const DOCUMENT_TEXT_DEFAULTS: DocumentTextSettings = {
  quote_doc_title: "QUOTATION",
  quote_doc_footer_text:
    "This quotation is subject to availability. Prices are quoted in {{currency}}. Luxus Travel & Tours — Luxury Rail Journeys.",
  quote_doc_includes_heading: "Your Package Includes",
  quote_doc_excludes_heading: "Your Package Excludes",
  // Appended after the suppliers' own exclusions. Seeded to "Services not mentioned." by
  // migration; the default here is empty so clearing it in Settings actually omits the line.
  quote_doc_excludes_default: "",
  voucher_doc_title: "TRAVEL VOUCHERS",
  invoice_doc_deposit_title: "DEPOSIT INVOICE",
  invoice_doc_final_title: "FINAL INVOICE",
  invoice_doc_footer_text: "Luxus Travel & Tours — Luxury Rail Journeys",
  itinerary_doc_journey_heading: "Your Journey",
  // Optional paragraph; empty means the itinerary renders without an intro.
  itinerary_doc_intro_text: "",
}

export async function getDocumentTextSettings(
  supabase: SupabaseClient<Database>,
): Promise<DocumentTextSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", DOCUMENT_TEXT_SETTING_KEYS)

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  return Object.fromEntries(
    DOCUMENT_TEXT_SETTING_KEYS.map((key) => [key, map[key]?.trim() || DOCUMENT_TEXT_DEFAULTS[key]]),
  ) as DocumentTextSettings
}

// Banking + company registration details rendered on invoice PDFs and into
// the {{bankingDetails}} email-template block. Empty values are omitted.
export const BANKING_SETTING_KEYS = [
  "bank_name",
  "bank_account_name",
  "bank_account_number",
  "bank_branch_code",
  "bank_swift_code",
  "payment_reference_hint",
  "company_address",
  "company_reg_number",
  "company_vat_number",
] as const

export type BankingSettings = Record<(typeof BANKING_SETTING_KEYS)[number], string>

export async function getBankingSettings(
  supabase: SupabaseClient<Database>,
): Promise<BankingSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", BANKING_SETTING_KEYS)

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  return Object.fromEntries(
    BANKING_SETTING_KEYS.map((key) => [key, map[key]?.trim() || ""]),
  ) as BankingSettings
}

const DEFAULT_EMAIL_FOOTER_TAGLINE = "Luxury train journeys, handled with care."

export async function getEmailFooterTagline(): Promise<string> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "email_footer_tagline")
    .maybeSingle()
  return data?.value?.trim() || DEFAULT_EMAIL_FOOTER_TAGLINE
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
