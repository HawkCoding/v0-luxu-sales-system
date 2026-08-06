import { NextResponse } from "next/server"
import { syncAllEnabledInboundEmailAccounts } from "@/lib/inbound-email/sync"

// Hobby plan ceiling. Not the root cause of the connection-drop incident this batch of changes
// fixes (the run's Critical log was written, so the function was alive when the socket died) --
// set anyway as defensive hygiene now that each account's sync is bounded by MAX_UIDS_PER_RUN.
export const maxDuration = 60

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
