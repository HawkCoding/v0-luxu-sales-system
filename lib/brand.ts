/**
 * Central brand configuration for the Travel Through Time portal.
 *
 * Values come from NEXT_PUBLIC_BRAND_* env vars; the defaults below are neutral
 * (no client-identifying strings) so nothing brand-specific ever ships in the
 * client bundle even if an env var is missing. Env values are trimmed so a
 * stray BOM/newline can't leak into rendered text or break === comparisons.
 */
function env(name: string, fallback: string): string {
  const raw = process.env[name]
  const trimmed = raw?.trim()
  return trimmed ? trimmed : fallback
}

export const BRAND_NAME = env("NEXT_PUBLIC_BRAND_NAME", "Travel Through Time")
export const BRAND_TAGLINE = env("NEXT_PUBLIC_BRAND_TAGLINE", "Luxury Rail Journeys")
export const BRAND_SHORT_NAME = env("NEXT_PUBLIC_BRAND_SHORT_NAME", "Travel Through Time")
export const BRAND_INITIALS = env("NEXT_PUBLIC_BRAND_INITIALS", "TTT")
export const BRAND_LOGO_URL = env("NEXT_PUBLIC_BRAND_LOGO_URL", "/3in1.png")
export const BRAND_FROM_ADDRESS = env("EMAIL_FROM_ADDRESS", `${BRAND_SHORT_NAME} <onboarding@resend.dev>`)
export const BRAND_REPLY_TO = env("NEXT_PUBLIC_BRAND_REPLY_TO", "hello@travelthroughtime.app")
export const BRAND_CONTACT_EMAIL = env("NEXT_PUBLIC_BRAND_CONTACT_EMAIL", "hello@travelthroughtime.app")
