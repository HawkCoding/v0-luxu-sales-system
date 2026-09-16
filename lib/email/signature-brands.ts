import { z } from "zod"
import { isRasterAssetUrl } from "@/lib/assets/raster-url"
import { isBlankSignatureHtml } from "@/lib/email/signature-html"
import type { EmailSignatureSettings } from "@/lib/settings-access"
import type { Database } from "@/lib/supabase/types"

export const MAX_SIGNATURE_BRANDS = 10

export type SignatureBrandRow = Database["public"]["Tables"]["signature_brands"]["Row"]

export interface SignatureBadge {
  url: string
  alt: string
  href: string | null
  width: number
  height: number
}

export interface SignatureBrand {
  id: string
  slug: string
  name: string
  bannerUrl: string | null
  bannerWidth: number | null
  bannerHeight: number | null
  badges: SignatureBadge[]
  companyLine: string | null
  registrationLine: string | null
  tradingHours: string | null
  divisionsLine: string | null
  confidentiality: string | null
  officeAddress: string | null
  /** Sanitized inline HTML for the sender name/contact block; never null — falls back through the shared default to the built-in layout (see lib/email/sender-layout.ts). */
  senderLayout: string
}

export const signatureBadgeSchema = z.object({
  url: z.string().trim().min(1),
  alt: z.string().trim().max(200),
  href: z.string().trim().url().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const signatureBrandTextFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  companyLine: z.string().trim().max(2000).nullable().optional(),
  registrationLine: z.string().trim().max(800).nullable().optional(),
  tradingHours: z.string().trim().max(800).nullable().optional(),
  divisionsLine: z.string().trim().max(800).nullable().optional(),
  confidentiality: z.string().trim().max(4000).nullable().optional(),
  officeAddress: z.string().trim().max(1200).nullable().optional(),
  senderLayout: z.string().trim().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

/**
 * SVG or non-https assets never load reliably in Outlook/Gmail; blank rather
 * than embed a broken image. Exception: local Supabase serves storage over
 * plain http, so an asset under that exact origin is trusted too — this
 * branch is inert in production, where NEXT_PUBLIC_SUPABASE_URL is https.
 */
export function isEmailSafeAssetUrl(url: string | null | undefined): url is string {
  if (!isRasterAssetUrl(url)) return false
  if (url.startsWith("https://")) return true
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  return !!supabaseUrl && supabaseUrl.startsWith("http://") && url.startsWith(supabaseUrl)
}

function parseBadges(raw: unknown): SignatureBadge[] {
  const result = z.array(signatureBadgeSchema).safeParse(raw)
  if (!result.success) return []
  return result.data.filter((badge) => isEmailSafeAssetUrl(badge.url))
}

/**
 * Merge a brand row's optional overrides over the shared app_settings
 * defaults — blank/null on the brand means "inherit". Also blanks an unsafe
 * banner and drops unsafe badges so the react-email component never has to
 * guess about asset safety.
 */
/**
 * Row -> inherited-or-overridden field. Every text override is sanitized
 * inline HTML (see lib/email/signature-html.ts), so "blank" is checked with
 * isBlankSignatureHtml rather than a plain trim — a rich-text field cleared
 * in the editor can still serialize to a non-empty `<p></p>`.
 */
function overrideOrDefault(override: string | null, fallback: string): string | null {
  return !isBlankSignatureHtml(override) ? (override as string) : fallback || null
}

export function toSignatureBrand(row: SignatureBrandRow, defaults: EmailSignatureSettings): SignatureBrand {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bannerUrl: isEmailSafeAssetUrl(row.banner_url) ? row.banner_url : null,
    bannerWidth: row.banner_width,
    bannerHeight: row.banner_height,
    badges: parseBadges(row.badges),
    companyLine: overrideOrDefault(row.company_line, defaults.signature_company_line),
    registrationLine: overrideOrDefault(row.registration_line, defaults.signature_registration_line),
    tradingHours: overrideOrDefault(row.trading_hours, defaults.signature_trading_hours),
    divisionsLine: overrideOrDefault(row.divisions_line, defaults.signature_divisions_line),
    confidentiality: overrideOrDefault(row.confidentiality, defaults.signature_confidentiality),
    officeAddress: overrideOrDefault(row.office_address, defaults.signature_office_address),
    senderLayout: overrideOrDefault(row.sender_layout, defaults.signature_sender_layout) ?? "",
  }
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
