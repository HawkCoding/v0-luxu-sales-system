import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import {
  EMAIL_APPEARANCE_SETTING_KEYS,
  toEmailFontFamily,
  toEmailFontSize,
  type EmailAppearanceSettings,
} from "@/lib/email/appearance"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
  getFooterBrandLogoUrl,
} from "@/lib/assets/footer-brand"
import {
  parseInvoiceStatusOptions,
  type InvoiceStatusOption,
} from "@/lib/invoices/invoice-status-options"
import { SETTINGS_WRITE_ROLES } from "@/lib/permissions"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

export interface SettingsAccessContext {
  supabase: Awaited<ReturnType<typeof createSessionClient>>
  userId: string
  actorName: string
  role: string
}

/** Writing global configuration — admin + manager. Consultants read settings, never write. */
export async function requireSettingsWrite(): Promise<
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

  if (
    profileError ||
    !profile ||
    !(SETTINGS_WRITE_ROLES as readonly string[]).includes(profile.clearance_level)
  ) {
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
  "invoice_doc_payment_note",
  "invoice_doc_bank_charges_note",
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
  invoice_doc_payment_note:
    "Please e-mail proof of payment. Reservations can only be confirmed once payment has been received.",
  invoice_doc_bank_charges_note:
    "Please note that the amounts transferred should be exclusive of all bank charges.",
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

// The status-option shapes, defaults and parser live in
// lib/invoices/invoice-status-options.ts so Client Components can reach them
// without pulling this server-only module in. Re-exported here because callers
// already import them from settings-access alongside getInvoiceStatusOptions.
export {
  DEFAULT_INVOICE_STATUS_OPTIONS,
  parseInvoiceStatusOptions,
} from "@/lib/invoices/invoice-status-options"
export type {
  InvoiceStatusOption,
  InvoiceStatusRole,
} from "@/lib/invoices/invoice-status-options"

export async function getInvoiceStatusOptions(
  supabase: SupabaseClient<Database>,
): Promise<InvoiceStatusOption[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "invoice_status_options")
    .maybeSingle()
  return parseInvoiceStatusOptions(data?.value)
}

// The SARAIL brand block (seal + heading + subheading) rendered on the quote,
// invoice, voucher and itinerary PDFs and in the email footer. Admins choose
// where it sits per document type; the strings and logo are editable too, so
// these keys are the single source of truth for brand chrome across documents.
export const BRAND_BLOCK_POSITIONS = ["top", "bottom", "hidden"] as const
export type BrandBlockPosition = (typeof BRAND_BLOCK_POSITIONS)[number]

// Position is only offered for the quote and invoice, the two documents that
// render the standalone SARAIL block. The voucher and itinerary carry a banner
// masthead instead, which has no coherent top/bottom/hidden slot; they still
// take the shared heading/subheading/logo so brand copy stays in one place.
export const DOCUMENT_BRAND_SETTING_KEYS = [
  "brand_block_heading",
  "brand_block_subheading",
  "brand_block_logo_url",
  "brand_block_position_quote",
  "brand_block_position_invoice",
  "brand_block_position_email",
] as const

export type DocumentBrandSettings = Record<
  (typeof DOCUMENT_BRAND_SETTING_KEYS)[number],
  string
>

const DOCUMENT_BRAND_DEFAULTS: DocumentBrandSettings = {
  brand_block_heading: FOOTER_BRAND_PRODUCT_LINE,
  brand_block_subheading: FOOTER_BRAND_DIVISION_LINE,
  // Empty means "no uploaded logo" — the renderers then fall back to the
  // committed asset. A non-empty default would make that state unreachable,
  // because getDocumentBrandSettings treats a blank row as unset (see below).
  brand_block_logo_url: "",
  // The PDF position dropdown edits quote and invoice together (see
  // brand-block-settings-editor.tsx), so both default to the same placement.
  brand_block_position_quote: "top",
  brand_block_position_invoice: "top",
  // Emails no longer render a separate logo/wordmark header, so the brand
  // block is the masthead by default.
  brand_block_position_email: "top",
}

function isBrandBlockPosition(value: string): value is BrandBlockPosition {
  return (BRAND_BLOCK_POSITIONS as readonly string[]).includes(value)
}

/**
 * Positions are validated as an enum at the API boundary, but app_settings.value
 * is plain text and rows predate this code, so a stored value can still be
 * anything. Re-check on read and fall back to the default rather than rendering
 * an unknown placement as nothing.
 */
export function toBrandBlockPosition(
  value: string,
  fallback: BrandBlockPosition,
): BrandBlockPosition {
  return isBrandBlockPosition(value) ? value : fallback
}

/** The brand block resolved for one document, ready to hand to a renderer. */
export interface DocumentBrand {
  heading: string
  subheading: string
  logoUrl: string | null
}

export async function getDocumentBrandSettings(
  supabase: SupabaseClient<Database>,
): Promise<DocumentBrandSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", DOCUMENT_BRAND_SETTING_KEYS)

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  return Object.fromEntries(
    DOCUMENT_BRAND_SETTING_KEYS.map((key) => [
      key,
      map[key]?.trim() || DOCUMENT_BRAND_DEFAULTS[key],
    ]),
  ) as DocumentBrandSettings
}

/**
 * Splits the flat settings row into the brand text/logo and the per-document
 * placements, so renderers take a resolved object instead of reaching for
 * setting keys themselves.
 */
/**
 * The brand block resolved for the email footer. Emails cannot embed a local
 * file or a relative path, so the logo must be an absolute URL: the uploaded
 * one when present, otherwise the committed asset mirrored into the public
 * bucket. Never throws — a branding lookup must not block a send.
 */
export interface EmailBrand {
  brand: DocumentBrand
  position: BrandBlockPosition
}

export async function getDocumentBrandForEmail(): Promise<EmailBrand> {
  try {
    const supabase = createServiceClient()
    const settings = await getDocumentBrandSettings(supabase)
    const uploaded = settings.brand_block_logo_url
    return {
      brand: {
        heading: settings.brand_block_heading,
        subheading: settings.brand_block_subheading,
        logoUrl: /^https?:\/\//i.test(uploaded) ? uploaded : getFooterBrandLogoUrl(),
      },
      position: toBrandBlockPosition(settings.brand_block_position_email, "bottom"),
    }
  } catch {
    return {
      brand: {
        heading: FOOTER_BRAND_PRODUCT_LINE,
        subheading: FOOTER_BRAND_DIVISION_LINE,
        logoUrl: getFooterBrandLogoUrl(),
      },
      position: "bottom",
    }
  }
}

export function resolveDocumentBrand(settings: DocumentBrandSettings): {
  brand: DocumentBrand
  position: Record<"quote" | "invoice", BrandBlockPosition>
} {
  return {
    brand: {
      heading: settings.brand_block_heading,
      subheading: settings.brand_block_subheading,
      logoUrl: settings.brand_block_logo_url || null,
    },
    position: {
      quote: toBrandBlockPosition(settings.brand_block_position_quote, "bottom"),
      invoice: toBrandBlockPosition(settings.brand_block_position_invoice, "top"),
    },
  }
}

// Banking + company registration details rendered on invoice PDFs and into
// the {{bankingDetails}} email-template block. Empty values are omitted.
export const BANKING_SETTING_KEYS = [
  "bank_name",
  "bank_account_name",
  "bank_account_number",
  "bank_branch_code",
  "bank_swift_code",
  "company_address",
  "company_reg_number",
  "company_vat_number",
  "company_tel",
  "company_cell",
  "company_fax",
  "company_email",
  "company_website",
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

export interface EmailBrandingSettings extends EmailAppearanceSettings {
  footerTagline: string
}

export async function getEmailAppearanceSettings(
  supabase: SupabaseClient<Database>,
): Promise<EmailAppearanceSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", EMAIL_APPEARANCE_SETTING_KEYS)

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  return {
    email_font_family: toEmailFontFamily(map["email_font_family"]),
    email_font_size: toEmailFontSize(map["email_font_size"]),
  }
}

/**
 * Footer + font for the branded email wrapper. Uses the service client because
 * composing runs from workers and cron with no user session.
 */
export async function getEmailBrandingSettings(): Promise<EmailBrandingSettings> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["email_footer_tagline", ...EMAIL_APPEARANCE_SETTING_KEYS])

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  return {
    footerTagline: map["email_footer_tagline"]?.trim() || DEFAULT_EMAIL_FOOTER_TAGLINE,
    email_font_family: toEmailFontFamily(map["email_font_family"]),
    email_font_size: toEmailFontSize(map["email_font_size"]),
  }
}

// Company-wide chrome appended under every salesperson's per-person signature
// lines (name/title/phones/email/web, which live in the email_signatures
// table). Distinct from BANKING_SETTING_KEYS' company_* fields, which are
// Luxus Travel's own invoice/banking details — this is the SARAIL division
// copy shown in the outgoing-mail signature block.
export const EMAIL_SIGNATURE_SETTING_KEYS = [
  "signature_enabled",
  "signature_company_line",
  "signature_registration_line",
  "signature_trading_hours",
  "signature_divisions_line",
  "signature_confidentiality",
  "signature_office_address",
] as const

export type EmailSignatureSettings = Record<(typeof EMAIL_SIGNATURE_SETTING_KEYS)[number], string>

const EMAIL_SIGNATURE_DEFAULTS: EmailSignatureSettings = {
  signature_enabled: "true",
  signature_company_line:
    "SA-Rail is a division of Luxus Travel & Tours. We are authorized reservation agents for The Blue Train, Rovos Rail & Kruger Shalati since 2014.",
  signature_registration_line: "Registered in South Africa CK2007/049324/23",
  signature_trading_hours: "Trading Hours: Mon – Fri 08h30 to 16h00 Closed on Weekends and Public Holidays",
  signature_divisions_line: "DIVISIONS OF LUXUS TRAVEL & TOURS",
  signature_confidentiality:
    "CONFIDENTIALITY CAUTION: This message is intended for the use of the addressed party only. If the reader is not the intended recipient, please notify us immediately and destroy this message.",
  signature_office_address: "",
}

/**
 * Company-wide signature chrome, resolved with the service client because
 * composing runs from workers and cron with no user session. Never throws —
 * a settings lookup must not block a send.
 */
export async function getEmailSignatureSettings(): Promise<EmailSignatureSettings> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", EMAIL_SIGNATURE_SETTING_KEYS)

    const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

    return Object.fromEntries(
      EMAIL_SIGNATURE_SETTING_KEYS.map((key) => [
        key,
        map[key]?.trim() || EMAIL_SIGNATURE_DEFAULTS[key],
      ]),
    ) as EmailSignatureSettings
  } catch {
    return { ...EMAIL_SIGNATURE_DEFAULTS }
  }
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
