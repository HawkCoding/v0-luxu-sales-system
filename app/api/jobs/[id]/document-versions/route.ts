import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { computeContentFingerprint } from "@/lib/documents/content-fingerprint"
import { recordIssuedDocument, type IssuedAttachment, type IssuedDocumentType } from "@/lib/documents/document-versions"
import { issuedDocumentTypeForKind } from "@/lib/documents/issued-documents"
import type { IssuedDocumentSend, IssuedDocumentVersion } from "@/lib/documents/issued-documents"
import { ensureQuotePdf, QUOTE_BUCKET } from "@/lib/quotes/ensure-quote-pdf"

export const runtime = "nodejs"

const bookingIdSchema = z.string().uuid()

const DOCUMENT_LABELS: Record<IssuedDocumentType, string> = {
  quote: "quote",
  invoice: "invoice",
  voucher: "voucher",
}

const saveSchema = z.object({
  /** The email kind the document would have been sent under; decides which document it is. */
  kind: z.enum(["quote", "invoice", "payment_received", "payment_reminder", "voucher"]),
  quoteId: z.string().uuid().optional(),
  voucherId: z.string().uuid().optional(),
  /** The prepared PDF, as the send dialog holds it. A quote is rendered here instead. */
  attachments: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(240),
        contentBase64: z.string().min(1).max(15_000_000),
        contentType: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .max(5)
    .optional(),
})

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

  // "Leave as is": the booking fingerprint the salesperson looked at and accepted, newest first. A
  // booking that has changed again since then differs from it too, so the flag comes back.
  const acknowledgedByVersion = new Map<string, string>()
  const latestIds = [...latestByType.values()].map((row) => row.id)
  if (latestIds.length > 0) {
    try {
      const { data: acknowledgements, error: acknowledgementsError } = await supabase
        .from("document_version_acknowledgements")
        .select("document_version_id, fingerprint, acknowledged_at")
        .in("document_version_id", latestIds)
        .order("acknowledged_at", { ascending: false })

      if (acknowledgementsError) throw acknowledgementsError
      for (const acknowledgement of acknowledgements ?? []) {
        if (!acknowledgedByVersion.has(acknowledgement.document_version_id)) {
          acknowledgedByVersion.set(acknowledgement.document_version_id, acknowledgement.fingerprint)
        }
      }
    } catch (acknowledgementsError) {
      // Not being able to read them only means a "Leave as is" does not hide the flag this time.
      console.error("document-versions:acknowledgements", acknowledgementsError)
    }
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
        changedByVersion.set(
          row.id,
          current !== row.content_fingerprint && current !== acknowledgedByVersion.get(row.id),
        )
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

/**
 * Keeps the document as it is now WITHOUT emailing it: the "save without sending" choice after the
 * booking has changed. It is for updates only, so the first quote, invoice and voucher still have
 * to be emailed (that send is what advances the booking). Stage, invoices and payments are
 * untouched; the kept copy simply becomes the latest one, which clears "Changed since sent".
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = bookingIdSchema.safeParse(id)
  if (!parsedId.success) return jsonError("Invalid booking id", 400)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = saveSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value
  const bookingId = parsedId.data
  const docType = issuedDocumentTypeForKind(parsed.data.kind)
  if (!docType) return jsonError("Unsupported document", 400)

  const { data: alreadySent, error: sentError } = await supabase
    .from("document_versions")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("doc_type", docType)
    .eq("issue_kind", "sent")
    .limit(1)
    .maybeSingle()

  if (sentError) return safeSupabaseError("document-versions:save:sent-check", sentError)
  if (!alreadySent) {
    return jsonError(
      `The first ${DOCUMENT_LABELS[docType]} has to be emailed to the client. Saving without sending is for updates after that.`,
      409,
    )
  }

  let attachments: IssuedAttachment[] = parsed.data.attachments ?? []

  if (docType === "quote") {
    if (!parsed.data.quoteId) return jsonError("quoteId is required to save a quote", 400)

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, booking_id, status")
      .eq("id", parsed.data.quoteId)
      .maybeSingle()

    if (quoteError) return safeSupabaseError("document-versions:save:quote", quoteError)
    if (!quote || quote.booking_id !== bookingId) return jsonError("Quote not found", 404)
    if (quote.status === "superseded" || quote.status === "cancelled") {
      return jsonError("This quote has been replaced or cancelled — save the current quote instead.", 409)
    }

    try {
      const ensured = await ensureQuotePdf(supabase, quote.id, {
        actorName: profile.actorName,
        actorUserId: user.id,
        force: true,
      })
      const objectPath = ensured.storagePath.startsWith(`${QUOTE_BUCKET}/`)
        ? ensured.storagePath.slice(QUOTE_BUCKET.length + 1)
        : ensured.storagePath
      const { data: blob, error: downloadError } = await supabase.storage.from(QUOTE_BUCKET).download(objectPath)
      if (downloadError || !blob) throw downloadError ?? new Error("Quote PDF download returned nothing")

      attachments = [
        {
          filename: ensured.attachmentFilename,
          contentBase64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
          contentType: "application/pdf",
        },
      ]
    } catch (error) {
      console.error("document-versions:save:quote-pdf", error)
      return jsonError("Quote PDF could not be generated", 500)
    }
  } else if (attachments.length === 0) {
    return jsonError("The prepared document is required", 400)
  }

  const versionId = await recordIssuedDocument(supabase, {
    bookingId,
    kind: parsed.data.kind,
    attachments,
    quoteId: parsed.data.quoteId,
    voucherId: parsed.data.voucherId,
    issuedBy: user.id,
    issueKind: "saved",
  })

  if (!versionId) return jsonError("A copy of the document could not be kept", 500)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: bookingId,
    action: "document_saved_without_sending",
    after: { doc_type: docType, document_version_id: versionId },
  })

  return Response.json({ versionId })
}
