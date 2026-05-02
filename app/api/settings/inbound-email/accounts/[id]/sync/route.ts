import { NextResponse } from "next/server"
import { syncInboundEmailAccount } from "@/lib/inbound-email/sync"
import { requireAdminSettingsAccess } from "@/lib/settings-access"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const { data: account, error } = await auth.value.supabase
    .from("inbound_email_accounts")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  try {
    const summary = await syncInboundEmailAccount(account)
    return NextResponse.json({ summary })
  } catch (syncError) {
    return NextResponse.json(
      { error: syncError instanceof Error ? syncError.message : "Sync failed" },
      { status: 500 },
    )
  }
}
