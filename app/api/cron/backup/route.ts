import { NextResponse } from "next/server"
import { logError } from "@/lib/error-log"
import { createBackup } from "@/lib/backup/create-backup"
import { BACKUPS_ENABLED } from "@/lib/feature-flags"

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"

export async function GET(request: Request) {
  if (!BACKUPS_ENABLED) {
    return NextResponse.json({ error: "Backups are currently disabled" }, { status: 404 })
  }
  const authHeader = request.headers.get("authorization")

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await createBackup(SYSTEM_USER_ID)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup cron failed"
    void logError({
      severity: "Critical",
      source: "backup",
      message: "Automatic daily backup failed",
      details: { error: message },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
