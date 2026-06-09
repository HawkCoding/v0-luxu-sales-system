/**
 * Central brand configuration.
 *
 * Defaults preserve the original "Luxus Travel & Tours" branding so production
 * and dev behaviour is unchanged. Deployments that serve a different brand
 * (e.g. the Travel Through Time prospect portal) override these via env vars,
 * keeping the codebase byte-identical across branches.
 */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Luxus Travel & Tours"
export const BRAND_TAGLINE = process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Luxury Rail Journeys"
export const BRAND_SHORT_NAME = process.env.NEXT_PUBLIC_BRAND_SHORT_NAME ?? "Luxus"
export const BRAND_INITIALS = process.env.NEXT_PUBLIC_BRAND_INITIALS ?? "LT"
export const BRAND_LOGO_URL =
  process.env.NEXT_PUBLIC_BRAND_LOGO_URL ??
  "https://www.luxustravelandtours.co.za/wp-content/uploads/2023/06/luxus-logo.png"
export const BRAND_FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS ?? `${BRAND_SHORT_NAME} <onboarding@resend.dev>`
export const BRAND_REPLY_TO =
  process.env.NEXT_PUBLIC_BRAND_REPLY_TO ?? "reservations@luxustravel.co.za"
export const BRAND_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL ?? "info@luxustravel.co.za"
