import { isRasterAssetUrl } from "@/lib/assets/raster-url"
import { FOOTER_BRAND_BUCKET } from "@/lib/assets/footer-brand"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * The app's own logo — sidebar mark, browser tab icon, login screen. Separate
 * from `lib/assets/footer-brand.ts`, which is the client-facing document/email
 * brand block; this one is UI chrome and has no committed fallback file, so
 * an empty value means "no logo" rather than "use the default asset".
 */
export const APP_LOGO_SETTING_KEY = "app_logo_url"
export const APP_LOGO_BUCKET = FOOTER_BRAND_BUCKET
export const APP_LOGO_OBJECT_PATH = "brand/app-logo.png"

export interface AppBranding {
  logoUrl: string | null
  businessName: string
}

const DEFAULT_BUSINESS_NAME = "Luxus Travel"

/**
 * Reads the app logo + business name with the service client, since the
 * consumers (login screen, root layout metadata) run before a user session
 * exists. Never throws — a branding lookup must not block the login page or
 * the app shell from rendering.
 */
export async function getAppBranding(): Promise<AppBranding> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [APP_LOGO_SETTING_KEY, "business_name"])

    if (error) throw error

    const settings = Object.fromEntries((data ?? []).map(({ key, value }) => [key, value]))
    const storedLogo = settings[APP_LOGO_SETTING_KEY]?.trim()

    return {
      logoUrl: isRasterAssetUrl(storedLogo) ? storedLogo : null,
      businessName: settings.business_name?.trim() || DEFAULT_BUSINESS_NAME,
    }
  } catch {
    return { logoUrl: null, businessName: DEFAULT_BUSINESS_NAME }
  }
}
