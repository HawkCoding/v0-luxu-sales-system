import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type DocumentKind = Database["public"]["Enums"]["document_kind"]
type DocumentStatus = Database["public"]["Enums"]["document_status"]

export interface GeneratedDocumentRow {
  id: string
  booking_id: string
  kind: DocumentKind
  status: DocumentStatus
  storage_path: string | null
  created_at: string
}

export interface UpsertGeneratedDocumentInput {
  bookingId: string
  kind: DocumentKind
  /** Bucket-prefixed storage path of the file just uploaded. */
  storagePath: string
  /**
   * Bucket-prefixed paths the same document was stored under by earlier
   * versions of the generator (e.g. the lowercase `quote-…pdf` names). A row
   * found under one of them is re-pointed at `storagePath` instead of a second
   * row being inserted, so a regenerated legacy file never duplicates in the
   * Documents tab.
   */
  legacyStoragePaths?: string[]
  /** Display name shown in the Documents tab and used as the download name. */
  fileName: string
  status?: DocumentStatus
}

const DOCUMENT_COLUMNS = "id, booking_id, kind, status, storage_path, created_at"

/**
 * Insert or update the documents row for a generated PDF, matching an existing
 * row by its current or any legacy storage path.
 *
 * The row's status is always written as `status` (default "generated"). A
 * document whose status must survive a regeneration -- the voucher PDF keeps
 * "sent", which gates the Voucher Sent stage -- must not use this as-is; that
 * is why app/api/voucher/generate/route.ts keeps its own write.
 */
export async function upsertGeneratedDocument(
  supabase: SupabaseClient<Database>,
  { bookingId, kind, storagePath, legacyStoragePaths = [], fileName, status = "generated" }: UpsertGeneratedDocumentInput,
): Promise<GeneratedDocumentRow | null> {
  const candidatePaths = Array.from(new Set([storagePath, ...legacyStoragePaths]))

  const { data: existingRows, error: lookupError } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("booking_id", bookingId)
    .eq("kind", kind)
    .in("storage_path", candidatePaths)
    .order("created_at", { ascending: false })

  // A failed lookup is not "no row": inserting here would duplicate the document in the Documents
  // tab. Report it the same way a failed write is reported.
  if (lookupError) {
    console.error("upsertGeneratedDocument:lookup", lookupError)
    return null
  }

  const rows = existingRows ?? []
  // Prefer the row already on the current path; otherwise adopt the newest legacy row.
  const existing = rows.find((row) => row.storage_path === storagePath) ?? rows[0] ?? null

  const payload = {
    booking_id: bookingId,
    kind,
    status,
    storage_path: storagePath,
    file_name: fileName,
  }

  const write = existing
    ? await supabase.from("documents").update(payload).eq("id", existing.id).select(DOCUMENT_COLUMNS).single()
    : await supabase.from("documents").insert(payload).select(DOCUMENT_COLUMNS).single()

  if (write.error || !write.data) return null
  return write.data
}
