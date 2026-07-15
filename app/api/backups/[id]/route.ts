import { NextResponse } from "next/server"
import { safeSupabaseError } from "@/lib/api/responses"
import { BACKUPS_ENABLED } from "@/lib/feature-flags"
import { requireManagerSettingsAccess } from "@/lib/settings-access"

const BACKUP_BUCKET = "backups"
const SIGNED_URL_EXPIRY_SECONDS = 300

const disabledResponse = () =>
  NextResponse.json({ error: "Backups are currently disabled" }, { status: 404 })

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!BACKUPS_ENABLED) return disabledResponse()
  const { id } = await params
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { data: record, error: fetchError } = await auth.value.supabase
    .from("backup_records")
    .select("id, storage_path, size_bytes, created_at")
    .eq("id", id)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 })
  }

  const { data: signedUrl, error: urlError } = await auth.value.supabase.storage
    .from(BACKUP_BUCKET)
    .createSignedUrl(record.storage_path, SIGNED_URL_EXPIRY_SECONDS)

  if (urlError || !signedUrl) {
    return safeSupabaseError("backups:signed-url", urlError, "Failed to generate download URL")
  }

  return NextResponse.json({ downloadUrl: signedUrl.signedUrl, record })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!BACKUPS_ENABLED) return disabledResponse()
  const { id } = await params
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { data: record, error: fetchError } = await auth.value.supabase
    .from("backup_records")
    .select("id, storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 })
  }

  const { error: storageError } = await auth.value.supabase.storage
    .from(BACKUP_BUCKET)
    .remove([record.storage_path])

  if (storageError) {
    return safeSupabaseError("backups:delete-storage", storageError, "Failed to delete backup file")
  }

  const { error: deleteError } = await auth.value.supabase
    .from("backup_records")
    .delete()
    .eq("id", id)

  if (deleteError) {
    return safeSupabaseError("backups:delete-record", deleteError, "Failed to delete backup record")
  }

  return NextResponse.json({ success: true })
}
