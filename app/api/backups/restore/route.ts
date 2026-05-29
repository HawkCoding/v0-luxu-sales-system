import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonZodError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { logError } from "@/lib/error-log"
import { requireAdminSettingsAccess } from "@/lib/settings-access"
import { createServiceClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"

const bodySchema = z
  .object({
    backupId: z.string().uuid(),
    confirm: z.literal(true, {
      errorMap: () => ({ message: "confirm must be true — explicit confirmation is required" }),
    }),
    confirmBackupId: z.string().uuid({ message: "confirmBackupId must be a valid UUID" }),
  })
  .refine((d) => d.confirmBackupId === d.backupId, {
    message: "confirmBackupId must match backupId",
    path: ["confirmBackupId"],
  })

export async function POST(request: Request) {
  // Restore is Admin-only — more destructive than a typical Manager action.
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const result = bodySchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Restore requires explicit confirmation")

  const { backupId } = result.data

  const { data: record, error: fetchError } = await auth.value.supabase
    .from("backup_records")
    .select("id, storage_path, created_at, size_bytes")
    .eq("id", backupId)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 })
  }

  // Use service client for storage download and RPC (needs elevated privileges).
  const service = createServiceClient()

  // Download the snapshot JSON from private storage.
  const { data: fileBlob, error: downloadError } = await service.storage
    .from("backups")
    .download(record.storage_path)

  if (downloadError || !fileBlob) {
    void logError({
      severity: "Critical",
      source: "backup-restore",
      message: "Failed to download backup file from storage",
      details: { backupId, storagePath: record.storage_path, error: downloadError?.message },
    })
    return NextResponse.json({ error: "Failed to download backup file" }, { status: 500 })
  }

  let snapshotData: Json
  try {
    const text = await fileBlob.text()
    snapshotData = JSON.parse(text) as Json
  } catch (parseErr) {
    void logError({
      severity: "Critical",
      source: "backup-restore",
      message: "Failed to parse backup snapshot JSON",
      details: { backupId, error: parseErr instanceof Error ? parseErr.message : String(parseErr) },
    })
    return NextResponse.json({ error: "Backup file is corrupt or unreadable" }, { status: 500 })
  }

  // Execute the atomic restore via the SECURITY DEFINER Postgres function.
  // The function sets session_replication_role=replica for the transaction, which
  // disables FK triggers so all tables can be truncated and reinserted in any order.
  const { error: rpcError } = await service.rpc("restore_backup_snapshot", {
    snapshot: snapshotData,
  })

  if (rpcError) {
    void logError({
      severity: "Critical",
      source: "backup-restore",
      message: "Restore RPC failed — database may be in a partial state",
      details: { backupId, storagePath: record.storage_path, error: rpcError.message },
    })
    return NextResponse.json(
      { error: "Restore failed — database was not modified (transaction rolled back)" },
      { status: 500 },
    )
  }

  await writeAuditLog(auth.value.supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Backup",
    entityId: backupId,
    action: "backup_restored",
    meta: {
      storage_path: record.storage_path,
      backup_created_at: record.created_at,
      size_bytes: record.size_bytes,
      restored_by_role: auth.value.role,
    },
  })

  return NextResponse.json({
    ok: true,
    message: "Database restored successfully from backup",
    backupCreatedAt: record.created_at,
  })
}
