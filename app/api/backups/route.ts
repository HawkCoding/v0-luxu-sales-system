import { NextResponse } from "next/server"
import { safeSupabaseError } from "@/lib/api/responses"
import { createBackup } from "@/lib/backup/create-backup"
import { requireManagerSettingsAccess } from "@/lib/settings-access"

export async function GET() {
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
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  try {
    const result = await createBackup(auth.value.userId)
    return NextResponse.json({ backup: result }, { status: 201 })
  } catch (err) {
    console.error("[api/backups] Backup creation failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed" },
      { status: 500 },
    )
  }
}
