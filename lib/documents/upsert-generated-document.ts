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
  /**
   * Match the booking's existing row of this kind whatever path it is on, not
   * only `storagePath`/`legacyStoragePaths`. For documents a booking holds one
   * of (voucher, itinerary), whose earlier file names aren't all known.
   */
  matchAnyPath?: boolean
  /** Display name shown in the Documents tab and used as the download name. */
  fileName: string
  status?: DocumentStatus
  /**
   * Statuses a regeneration must not reset. When the existing row has one of
   * these it is written back unchanged instead of `status` -- the voucher keeps
   * "sent", which gates the Voucher Sent stage.
   */
  keepStatuses?: DocumentStatus[]
}

const DOCUMENT_COLUMNS = "id, booking_id, kind, status, storage_path, created_at"

/** The columns a documents row is unique on (see ux_documents_booking_kind_storage_path). */
const DOCUMENT_CONFLICT_TARGET = "booking_id,kind,storage_path"

/**
 * Insert or update the documents row for a generated PDF, matching an existing
 * row by its current or any legacy storage path (or, with `matchAnyPath`, by
 * kind alone).
 *
 * The row's status is written as `status` (default "generated") unless the
 * existing row's status is listed in `keepStatuses`.
 */
export async function upsertGeneratedDocument(
  supabase: SupabaseClient<Database>,
  {
    bookingId,
    kind,
    storagePath,
    legacyStoragePaths = [],
    matchAnyPath = false,
    fileName,
    status = "generated",
    keepStatuses = [],
  }: UpsertGeneratedDocumentInput,
): Promise<GeneratedDocumentRow | null> {
  const candidatePaths = Array.from(new Set([storagePath, ...legacyStoragePaths]))

  const lookup = supabase
    .from("documents")
    .select("id, storage_path, status")
    .eq("booking_id", bookingId)
    .eq("kind", kind)
  const { data: existingRows, error: lookupError } = await (matchAnyPath
    ? lookup
    : lookup.in("storage_path", candidatePaths)
  ).order("created_at", { ascending: false })

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
    status: existing && keepStatuses.includes(existing.status) ? existing.status : status,
    storage_path: storagePath,
    file_name: fileName,
  }

  // No row yet: upsert on the unique (booking_id, kind, storage_path) index, so a second
  // regeneration racing this one lands on the same row instead of inserting a duplicate.
  const write = existing
    ? await supabase.from("documents").update(payload).eq("id", existing.id).select(DOCUMENT_COLUMNS).single()
    : await supabase
        .from("documents")
        .upsert(payload, { onConflict: DOCUMENT_CONFLICT_TARGET })
        .select(DOCUMENT_COLUMNS)
        .single()

  if (write.error || !write.data) return null
  return write.data
}
