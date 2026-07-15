import { NextResponse } from "next/server"
import { safeSupabaseError } from "@/lib/api/responses"
import { createBackup } from "@/lib/backup/create-backup"
import { BACKUPS_ENABLED } from "@/lib/feature-flags"
import { requireManagerSettingsAccess } from "@/lib/settings-access"
import { logError } from "@/lib/error-log"

const disabledResponse = () =>
  NextResponse.json({ error: "Backups are currently disabled" }, { status: 404 })

export async function GET() {
  if (!BACKUPS_ENABLED) return disabledResponse()
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("backup_records")
    .select("id, storage_path, size_bytes, created_at, created_by, retained_until")
    .order("created_at", { ascending: false })

  if (error) return safeSupabaseError("backups:list", error, "Failed to load backups")

  return NextResponse.json({ backups: data ?? [] })
}

export async function POST() {
  if (!BACKUPS_ENABLED) return disabledResponse()
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  try {
    const result = await createBackup(auth.value.userId)
    return NextResponse.json({ backup: result }, { status: 201 })
  } catch (err) {
    console.error("[api/backups] Backup creation failed:", err)
    void logError({ severity: "Critical", source: "backup", message: "Backup creation failed", details: { error: err instanceof Error ? err.message : String(err) } })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed" },
      { status: 500 },
    )
  }
}
