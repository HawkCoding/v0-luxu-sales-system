import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonZodError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { requireManagerSettingsAccess } from "@/lib/settings-access"

const bodySchema = z.object({
  backupId: z.string().uuid(),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be true — explicit confirmation is required" }),
  }),
})

export async function POST(request: Request) {
  const auth = await requireManagerSettingsAccess()
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

  await writeAuditLog(auth.value.supabase, {
    actor: auth.value.actorName,
    actorUserId: auth.value.userId,
    entityType: "Backup",
    entityId: backupId,
    action: "restore_initiated",
    meta: {
      storage_path: record.storage_path,
      backup_created_at: record.created_at,
      initiated_by_role: auth.value.role,
    },
  })

  // TODO (Batch 5 follow-up): implement full destructive restore from the snapshot JSON.
  // Steps will be:
  //   1. Download the backup file from Supabase Storage via signed URL
  //   2. Parse the JSON snapshot
  //   3. Truncate and re-insert each table within a transaction
  //   4. Audit the completed restore
  // This stub returns a clear message so callers are not silently misled.

  return NextResponse.json(
    {
      warning:
        "Restore has been recorded in the audit log. Full data restoration is not yet implemented — contact your system administrator to perform a manual restore from the snapshot at the path below.",
      storagePath: record.storage_path,
      backupCreatedAt: record.created_at,
    },
    { status: 202 },
  )
}
