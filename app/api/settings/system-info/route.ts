import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

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

  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim())
  const emailProvider = hasResend ? "Resend" : "Mailpit (Local SMTP)"

  return NextResponse.json({ dataMode, emailProvider })
}
