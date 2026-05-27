import { createServiceClient } from "@/lib/supabase/server"
import { logError } from "@/lib/error-log"
import type { Database } from "@/lib/supabase/types"

const BACKUP_BUCKET = "backups"
const RETENTION_DAYS = 14

export interface CreateBackupResult {
  path: string
  sizeBytes: number
}

/**
 * Creates a JSON snapshot of key application tables and uploads it to the
 * private Supabase Storage 'backups' bucket. Old backups beyond the 14-day
 * retention window are deleted after a successful upload.
 */
export async function createBackup(createdByUserId: string): Promise<CreateBackupResult> {
  const supabase = createServiceClient()

  const snapshot = await buildSnapshot(supabase)
  const json = JSON.stringify(snapshot, null, 2)
  const bytes = Buffer.from(json, "utf8")

  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  const ts = now.getTime()
  const path = `${yyyy}/${mm}/${dd}/backup-${ts}.json`

  const { error: uploadError } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(path, bytes, {
      contentType: "application/json",
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Backup upload failed: ${uploadError.message}`)
  }

  const retainedUntil = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const { error: insertError } = await supabase.from("backup_records").insert({
    storage_path: path,
    size_bytes: bytes.length,
    created_by: createdByUserId,
    retained_until: retainedUntil.toISOString(),
  })

  if (insertError) {
    console.error("[create-backup] Failed to insert backup_record:", insertError)
    void logError({ severity: "Warning", source: "backup", message: "Backup file uploaded but record insert failed", details: { path, error: insertError.message } })
  }

  await pruneOldBackups(supabase, now)

  return { path, sizeBytes: bytes.length }
}

async function pruneOldBackups(
  supabase: ReturnType<typeof createServiceClient>,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const { data: oldRecords, error } = await supabase
    .from("backup_records")
    .select("id, storage_path")
    .lt("retained_until", cutoff.toISOString())

  if (error || !oldRecords?.length) return

  const paths = oldRecords.map((r) => r.storage_path)

  const { error: storageError } = await supabase.storage.from(BACKUP_BUCKET).remove(paths)

  if (storageError) {
    console.warn("[create-backup] Storage prune partial failure:", storageError.message)
  }

  const ids = oldRecords.map((r) => r.id)
  const { error: deleteError } = await supabase.from("backup_records").delete().in("id", ids)

  if (deleteError) {
    console.warn("[create-backup] Prune record deletion failed:", deleteError.message)
  }
}

type TableName = keyof Database["public"]["Tables"]

const TABLES_TO_SNAPSHOT = [
  "profiles",
  "customers",
  "bookings",
  "quotes",
  "quote_line_items",
  "invoices",
  "payments",
  "suppliers",
  "supplier_pricing_options",
  "supplier_seasonal_periods",
  "supplier_seasonal_prices",
  "rate_cards",
  "packages",
  "package_legs",
  "inbound_email_accounts",
  "app_settings",
  "audit_logs",
] as const satisfies readonly TableName[]

async function buildSnapshot(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Record<string, unknown[]>> {
  const snapshot: Record<string, unknown[]> = {
    _meta: [{ created_at: new Date().toISOString(), version: 1 }],
  }

  for (const table of TABLES_TO_SNAPSHOT) {
    const { data, error } = await supabase.from(table).select("*")
    if (error) {
      console.warn(`[create-backup] Skipping table "${table}":`, error.message)
      snapshot[table] = []
    } else {
      snapshot[table] = data ?? []
    }
  }

  return snapshot
}
