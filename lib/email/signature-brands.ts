import { z } from "zod"
import { isRasterAssetUrl } from "@/lib/assets/raster-url"
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
  companyLine: z.string().trim().max(500).nullable().optional(),
  registrationLine: z.string().trim().max(200).nullable().optional(),
  tradingHours: z.string().trim().max(200).nullable().optional(),
  divisionsLine: z.string().trim().max(200).nullable().optional(),
  confidentiality: z.string().trim().max(1000).nullable().optional(),
  officeAddress: z.string().trim().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

/** SVG or non-https assets never load reliably in Outlook/Gmail; blank rather than embed a broken image. */
export function isEmailSafeAssetUrl(url: string | null | undefined): url is string {
  return isRasterAssetUrl(url) && url.startsWith("https://")
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
export function toSignatureBrand(row: SignatureBrandRow, defaults: EmailSignatureSettings): SignatureBrand {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bannerUrl: isEmailSafeAssetUrl(row.banner_url) ? row.banner_url : null,
    bannerWidth: row.banner_width,
    bannerHeight: row.banner_height,
    badges: parseBadges(row.badges),
    companyLine: row.company_line?.trim() || defaults.signature_company_line || null,
    registrationLine: row.registration_line?.trim() || defaults.signature_registration_line || null,
    tradingHours: row.trading_hours?.trim() || defaults.signature_trading_hours || null,
    divisionsLine: row.divisions_line?.trim() || defaults.signature_divisions_line || null,
    confidentiality: row.confidentiality?.trim() || defaults.signature_confidentiality || null,
    officeAddress: row.office_address?.trim() || defaults.signature_office_address || null,
  }
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
