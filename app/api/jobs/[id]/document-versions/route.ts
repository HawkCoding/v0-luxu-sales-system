import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import type { IssuedDocumentSend, IssuedDocumentVersion } from "@/lib/documents/issued-documents"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"

const bookingIdSchema = z.string().uuid()

/**
 * The PDFs that have gone out on this booking, one row per distinct copy, each with the emails that
 * carried it. Read-only; the copies themselves are written by POST /api/correspondence.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = bookingIdSchema.safeParse(id)
  if (!parsedId.success) return jsonError("Invalid booking id", 400)

  const { supabase } = auth.value

  const { data: rows, error } = await supabase
    .from("document_versions")
    .select("id, doc_type, version_no, file_name, size_bytes, issued_at, issue_kind, quote:quotes(quote_number)")
    .eq("booking_id", parsedId.data)
    .order("issued_at", { ascending: false })

  if (error) return safeSupabaseError("document-versions:list", error)

  const versionIds = (rows ?? []).map((row) => row.id)
  const sendsByVersion = new Map<string, IssuedDocumentSend[]>()

  if (versionIds.length > 0) {
    const { data: sends, error: sendsError } = await supabase
      .from("correspondences")
      .select("id, document_version_id, subject, sent_at, recipients")
      .in("document_version_id", versionIds)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })

    if (sendsError) return safeSupabaseError("document-versions:sends", sendsError)

    for (const send of sends ?? []) {
      if (!send.document_version_id) continue
      const existing = sendsByVersion.get(send.document_version_id) ?? []
      existing.push({
        correspondenceId: send.id,
        subject: send.subject,
        sentAt: send.sent_at,
        recipients: send.recipients ?? [],
      })
      sendsByVersion.set(send.document_version_id, existing)
    }
  }

  const versions: IssuedDocumentVersion[] = (rows ?? []).map((row) => {
    const quote = Array.isArray(row.quote) ? row.quote[0] : row.quote
    return {
      id: row.id,
      docType: row.doc_type as IssuedDocumentType,
      versionNo: row.version_no,
      fileName: row.file_name,
      sizeBytes: row.size_bytes,
      issuedAt: row.issued_at,
      issueKind: row.issue_kind === "saved" ? "saved" : "sent",
      quoteNumber: quote?.quote_number ?? null,
      sends: sendsByVersion.get(row.id) ?? [],
    }
  })

  return Response.json({ versions })
}
