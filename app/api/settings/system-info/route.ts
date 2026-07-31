import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

/**
 * Describe what production would actually do with an outbound email, so a
 * misconfigured environment is visible here instead of only in a failed send.
 * `credentialCount` is RLS-scoped, so a consultant sees only their own mailbox.
 */
function resolveEmailProvider(credentialCount: number): string {
  const isProduction = process.env.NODE_ENV === "production"
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim())
  const hasMailpit = Boolean(
    process.env.MAILPIT_SMTP_URL?.trim() || process.env.MAILPIT_SMTP_HOST?.trim(),
  )

  if (credentialCount > 0) return "Per-salesperson SMTP"
  if (hasResend) return "Resend"
  if (!isProduction || hasMailpit) return "Mailpit (local SMTP)"
  return "Not configured"
}

export async function GET() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const isLocal = supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost")
  const dataMode = isLocal ? "Local (Supabase Docker)" : "Live (Supabase Cloud)"

  const { count: credentialCount } = await supabase
    .from("salesperson_credentials")
    .select("id", { count: "exact", head: true })

  return NextResponse.json({ dataMode, emailProvider: resolveEmailProvider(credentialCount ?? 0) })
}
