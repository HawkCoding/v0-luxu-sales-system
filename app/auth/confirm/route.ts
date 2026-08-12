/**
 * GET /auth/confirm
 *
 * Verifies an emailed `token_hash` link (password recovery, magic link, invite)
 * and establishes the session server-side.
 *
 * The older /auth/callback exchanges a PKCE `code`, which only works in the
 * browser that requested the email because the verifier lives in a cookie there
 * — opening the link on a phone failed with "Sign in failed" (QA 02, F02-7).
 * A token hash carries no such state, so the link works on any device.
 */

import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createSessionClient } from "@/lib/supabase/server"

const ALLOWED_TYPES: EmailOtpType[] = ["recovery", "magiclink", "invite", "email", "email_change"]

export function resolveOtpType(rawType: string | null): EmailOtpType | null {
  return ALLOWED_TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null
}

export function getSafeNextPath(rawNext: string | null): string {
  // Only same-origin absolute paths; never a protocol-relative "//evil.com".
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) return "/app"
  return rawNext
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = resolveOtpType(searchParams.get("type"))
  const next = getSafeNextPath(searchParams.get("next"))

  const supabase = await createSessionClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) {
      console.warn("[auth/confirm] verification failed:", error.code ?? error.message)
      return NextResponse.redirect(`${origin}/login?error=link-invalid`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Fallback for links still built from the default `{{ .ConfirmationURL }}`
  // template — the hosted projects keep sending PKCE `code` links until their
  // email template is updated. Same-browser only, by nature of PKCE.
  const code = searchParams.get("code")
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.warn("[auth/confirm] code exchange failed:", error.code ?? error.message)
      return NextResponse.redirect(`${origin}/login?error=link-invalid`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=link-invalid`)
}
