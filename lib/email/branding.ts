import { isRasterAssetUrl } from "@/lib/assets/raster-url"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Logo shown in the branded email header. Uses the admin-uploaded brand logo
 * from the public `voucher-assets` bucket — the same asset the voucher PDF
 * embeds — so branding is configured once on the Templates page.
 *
 * Email clients cannot resolve relative paths, so only an absolute URL is
 * usable. Returns null when none is configured; the layout then renders a text
 * wordmark rather than a broken image.
 */
export async function getEmailLogoUrl(): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("voucher_template")
      .select("logo_url")
      .limit(1)
      .maybeSingle()

    const logoUrl = error ? null : data?.logo_url
    if (isRasterAssetUrl(logoUrl) && /^https?:\/\//i.test(logoUrl)) {
      return logoUrl
    }
  } catch {
    // A branding lookup must never block a send — fall back to the wordmark.
  }

  return null
}
