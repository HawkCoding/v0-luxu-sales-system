/**
 * Central brand configuration.
 *
 * Defaults preserve the original "Luxus Travel & Tours" branding so production
 * and dev behaviour is unchanged. Deployments that serve a different brand
 * (e.g. the Travel Through Time prospect portal) override these via env vars,
 * keeping the codebase byte-identical across branches.
 *
 * Env values are trimmed so a stray BOM/newline from however they were set
 * (e.g. a CLI pipe) can't leak into rendered text or break === comparisons.
 */
function env(name: string, fallback: string): string {
  const raw = process.env[name]
  const trimmed = raw?.trim()
  return trimmed ? trimmed : fallback
}

export const BRAND_NAME = env("NEXT_PUBLIC_BRAND_NAME", "Luxus Travel & Tours")
export const BRAND_TAGLINE = env("NEXT_PUBLIC_BRAND_TAGLINE", "Luxury Rail Journeys")
export const BRAND_SHORT_NAME = env("NEXT_PUBLIC_BRAND_SHORT_NAME", "Luxus")
export const BRAND_INITIALS = env("NEXT_PUBLIC_BRAND_INITIALS", "LT")
export const BRAND_LOGO_URL = env(
  "NEXT_PUBLIC_BRAND_LOGO_URL",
  "https://www.luxustravelandtours.co.za/wp-content/uploads/2023/06/luxus-logo.png",
)
export const BRAND_FROM_ADDRESS = env("EMAIL_FROM_ADDRESS", `${BRAND_SHORT_NAME} <onboarding@resend.dev>`)
export const BRAND_REPLY_TO = env("NEXT_PUBLIC_BRAND_REPLY_TO", "reservations@luxustravel.co.za")
export const BRAND_CONTACT_EMAIL = env("NEXT_PUBLIC_BRAND_CONTACT_EMAIL", "info@luxustravel.co.za")
