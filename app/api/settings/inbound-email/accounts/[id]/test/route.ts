import { NextResponse } from "next/server"
import { testInboundEmailConnection } from "@/lib/inbound-email/sync"
import { requireSettingsWrite } from "@/lib/settings-access"

const INBOUND_EMAIL_ACCOUNT_COLUMNS =
  "created_at, email, enabled, first_sync_completed, host, id, inbox_folder, last_seen_uid, last_synced_at, last_uidvalidity, needs_review_folder, password_encrypted, port, processed_folder, tls_mode, updated_at, username"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const { data: account, error } = await auth.value.supabase
    .from("inbound_email_accounts")
    .select(INBOUND_EMAIL_ACCOUNT_COLUMNS)
    .eq("id", id)
    .single()

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  const result = await testInboundEmailConnection(account)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
