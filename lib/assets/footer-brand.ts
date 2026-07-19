/**
 * The SARAIL brand block shown at the bottom of client-facing emails and the
 * quote/invoice PDFs.
 *
 * These strings are fixed brand chrome, deliberately separate from the
 * `voucher_template.header_text` / `product_line` columns, which are
 * admin-editable per-template values rendered in the voucher PDF header.
 *
 * The logo is committed at `assets/brand/` and mirrored into the public
 * `voucher-assets` bucket by `scripts/upload-footer-brand.ts`. PDFs read the
 * committed file from disk; emails need an absolute URL, so they read the
 * bucket copy.
 */

export const FOOTER_BRAND_ALT = "SARAIL"
export const FOOTER_BRAND_DIVISION_LINE = "A division of Luxus Travel & Tours"
export const FOOTER_BRAND_PRODUCT_LINE = "BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI"

export const FOOTER_BRAND_BUCKET = "voucher-assets"
export const FOOTER_BRAND_OBJECT_PATH = "brand/sarail-footer-logo.png"
export const FOOTER_BRAND_LOCAL_PATH = "assets/brand/sarail-footer-logo.png"

/**
 * Absolute public URL of the footer logo for email embedding. Each environment
 * resolves against its own Supabase project, so no extra config is needed.
 * Returns null when the Supabase URL is unset; callers then render the text
 * lines alone rather than a broken image.
 */
export function getFooterBrandLogoUrl(): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) return null

  return `${baseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${FOOTER_BRAND_BUCKET}/${FOOTER_BRAND_OBJECT_PATH}`
}
