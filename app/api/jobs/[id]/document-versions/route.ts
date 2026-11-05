import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { computeContentFingerprint } from "@/lib/documents/content-fingerprint"
import type { IssuedDocumentSend, IssuedDocumentVersion } from "@/lib/documents/issued-documents"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"

const bookingIdSchema = z.string().uuid()

/**
 * The PDFs that have gone out on this booking, one row per distinct copy, each with the emails that
 * carried it. Read-only; the copies themselves are written by POST /api/correspondence.
 *
 * The latest copy of each document also says whether the booking has changed since it was sent.
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
    .select(
      "id, doc_type, version_no, file_name, size_bytes, issued_at, issue_kind, quote_id, invoice_id, content_fingerprint, quote:quotes(quote_number)",
    )
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

  // The newest copy of each document type: the only one worth comparing against the booking now.
  const latestByType = new Map<string, NonNullable<typeof rows>[number]>()
  for (const row of rows ?? []) {
    const current = latestByType.get(row.doc_type)
    if (!current || row.version_no > current.version_no) latestByType.set(row.doc_type, row)
  }

  const changedByVersion = new Map<string, boolean>()
  await Promise.all(
    [...latestByType.values()].map(async (row) => {
      // No fingerprint taken when it was sent (a copy kept before they existed): unknown, not changed.
      if (!row.content_fingerprint) return
      try {
        const current = await computeContentFingerprint(supabase, {
          bookingId: parsedId.data,
          docType: row.doc_type as IssuedDocumentType,
          quoteId: row.quote_id,
          invoiceId: row.invoice_id,
        })
        changedByVersion.set(row.id, current !== row.content_fingerprint)
      } catch (fingerprintError) {
        console.error("document-versions:fingerprint", fingerprintError)
      }
    }),
  )

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
      contentChanged: changedByVersion.get(row.id) ?? null,
      sends: sendsByVersion.get(row.id) ?? [],
    }
  })

  return Response.json({ versions })
}
