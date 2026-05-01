import { NextResponse } from "next/server"
import { syncAllEnabledInboundEmailAccounts } from "@/lib/inbound-email/sync"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await syncAllEnabledInboundEmailAccounts()
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email sync failed" },
      { status: 500 },
    )
  }
}
