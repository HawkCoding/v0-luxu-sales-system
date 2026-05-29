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

// Tables included in snapshots — ordered parents-before-children for readability;
// the restore function uses session_replication_role=replica so actual order is irrelevant.
// Excluded: backup_records (self-referential), inbound_email_messages / inbound_email_sync_runs
// (large/transient), report_snapshots (generated cache).
// Note: salesperson_credentials contains AES-encrypted SMTP secrets — acceptable in the
// private, server-only 'backups' bucket (see migration 20260528110000 for full rationale).
const TABLES_TO_SNAPSHOT = [
  // Config / reference
  "app_settings",
  "outcome_reasons",
  "rate_types",
  "countries",
  "country_aliases",
  "locations",
  "templates",
  "voucher_template",
  // Auth
  "profiles",
  "salesperson_credentials",
  // Suppliers
  "suppliers",
  "supplier_emails",
  "supplier_email_labels",
  "suite_types",
  "bathroom_types",
  "bedroom_types",
  "bedroom_layouts",
  "suite_type_bathroom_types",
  "suite_type_bedroom_types",
  "suite_type_bedroom_layouts",
  "supplier_pricing_options",
  "supplier_seasonal_periods",
  "supplier_seasonal_prices",
  "rate_cards",
  // Routes & packages
  "routes",
  "itineraries",
  "packages",
  "package_legs",
  "package_leg_routes",
  // Inbound email
  "inbound_email_accounts",
  "inbound_email_rules",
  // Customers
  "customers",
  "customer_linked_accounts",
  // Bookings
  "booking_number_sequences",
  "bookings",
  "booking_suites",
  "booking_notes",
  "booking_package_selections",
  "booking_supplier_schedules",
  "booking_transport_requests",
  "booking_vehicle_rental_details",
  "vehicle_rental_route_details",
  "travellers",
  "hotel_offers",
  "pipeline_history",
  // Quotes
  "quotes",
  "quote_acceptance_tokens",
  "quote_line_items",
  "quote_follow_ups",
  // Invoices & payments
  "invoices",
  "payments",
  "payment_reminders",
  // Documents & correspondence
  "documents",
  "correspondences",
  // Vouchers
  "vouchers",
  "voucher_service_blocks",
  // Logs
  "audit_logs",
  "audit_log_archives",
  "error_logs",
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
