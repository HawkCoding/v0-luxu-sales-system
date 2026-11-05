import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { computeContentFingerprint } from "@/lib/documents/content-fingerprint"
import { issuedDocumentTypeForKind } from "@/lib/documents/issued-documents"

/**
 * Issued-document history.
 *
 * The quote, invoice and voucher PDFs are each one storage object that is overwritten on every
 * render, so the copy a client actually received could not be found again once it was
 * regenerated. When one of them goes out in an email, the exact attached bytes are kept here in an
 * immutable bucket and the email row is linked to them.
 *
 * Capture is strictly best-effort: the email is already out by the time it runs, so nothing in this
 * file may throw or change the send's outcome.
 */

export const DOCUMENT_VERSIONS_BUCKET = "document-versions"

export type IssuedDocumentType = "quote" | "invoice" | "voucher"

export interface IssuedAttachment {
  filename: string
  contentBase64: string
  contentType?: string
}

// Defined in issued-documents.ts so client components can use it without pulling in node:crypto.
export { issuedDocumentTypeForKind }

function isPdf(attachment: IssuedAttachment): boolean {
  return attachment.contentType === "application/pdf" || /\.pdf$/i.test(attachment.filename)
}

/**
 * The attachment that IS the document, among everything the email carries (fact sheets, the
 * itinerary PDF sent beside a voucher, library files). Null when none can be identified, in which
 * case nothing is captured rather than a wrong file being kept.
 */
export function pickIssuedAttachment(
  docType: IssuedDocumentType,
  attachments: IssuedAttachment[],
): IssuedAttachment | null {
  const pdfs = attachments.filter(isPdf)

  switch (docType) {
    // The quote PDF is unshifted to the front of the list by the send route.
    case "quote":
      return pdfs[0] ?? null
    case "invoice":
      return pdfs.find((attachment) => /invoice/i.test(attachment.filename)) ?? pdfs[0] ?? null
    case "voucher":
      // Deliberately not falling back to the first PDF: that would be the itinerary when the
      // voucher itself is somehow absent.
      return pdfs.find((attachment) => /voucher/i.test(attachment.filename)) ?? null
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function documentVersionStoragePath(bookingId: string, docType: IssuedDocumentType, sha256: string): string {
  return `${bookingId}/${docType}/${sha256}.pdf`
}

export interface CaptureIssuedDocumentInput {
  bookingId: string
  docType: IssuedDocumentType
  attachment: IssuedAttachment
  quoteId?: string | null
  invoiceId?: string | null
  voucherId?: string | null
  issuedBy?: string | null
  issueKind?: "sent" | "saved"
  /** Fingerprint of the booking data the document was printed from (lib/documents/content-fingerprint.ts). */
  contentFingerprint?: string | null
}

type Client = SupabaseClient<Database>

const MAX_INSERT_ATTEMPTS = 3
const UNIQUE_VIOLATION = "23505"

function isAlreadyStored(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false
  const status = String(error.statusCode ?? "")
  return status === "409" || /already exists|duplicate/i.test(error.message ?? "")
}

async function findBySha(
  supabase: Client,
  bookingId: string,
  docType: IssuedDocumentType,
  sha256: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("doc_type", docType)
    .eq("sha256", sha256)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

/**
 * Keeps the attached bytes as the next version of this booking's document and returns its id, or
 * null when nothing could be kept. Identical bytes link to the existing version instead of making
 * a new one, so re-sending an unchanged document does not inflate the history.
 */
export async function captureIssuedDocument(
  supabase: Client,
  input: CaptureIssuedDocumentInput,
): Promise<string | null> {
  try {
    const bytes = Buffer.from(input.attachment.contentBase64, "base64")
    if (bytes.length === 0) return null

    const sha256 = sha256Hex(bytes)

    const existingId = await findBySha(supabase, input.bookingId, input.docType, sha256)
    if (existingId) return existingId

    const storagePath = documentVersionStoragePath(input.bookingId, input.docType, sha256)
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_VERSIONS_BUCKET)
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false })

    // Content-addressed, so "already there" means these exact bytes are stored (a prior attempt
    // uploaded them but did not get as far as the row).
    if (uploadError && !isAlreadyStored(uploadError)) {
      console.error("document-versions:upload", uploadError)
      return null
    }

    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
      const { data: latest, error: latestError } = await supabase
        .from("document_versions")
        .select("version_no")
        .eq("booking_id", input.bookingId)
        .eq("doc_type", input.docType)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestError) {
        console.error("document-versions:latest", latestError)
        return null
      }

      const { data: inserted, error: insertError } = await supabase
        .from("document_versions")
        .insert({
          booking_id: input.bookingId,
          doc_type: input.docType,
          quote_id: input.quoteId ?? null,
          invoice_id: input.invoiceId ?? null,
          voucher_id: input.voucherId ?? null,
          version_no: (latest?.version_no ?? 0) + 1,
          storage_path: storagePath,
          file_name: input.attachment.filename,
          sha256,
          size_bytes: bytes.length,
          issue_kind: input.issueKind ?? "sent",
          issued_by: input.issuedBy ?? null,
          content_fingerprint: input.contentFingerprint ?? null,
        })
        .select("id")
        .single()

      if (!insertError && inserted) return inserted.id

      if (insertError?.code === UNIQUE_VIOLATION) {
        // Either a concurrent send stored the same bytes (link to it) or took the version number
        // (take the next one).
        const racedId = await findBySha(supabase, input.bookingId, input.docType, sha256)
        if (racedId) return racedId
        continue
      }

      console.error("document-versions:insert", insertError)
      return null
    }

    console.error("document-versions:insert", "version number kept colliding")
    return null
  } catch (error) {
    console.error("document-versions:capture", error)
    return null
  }
}

/**
 * Whether an email of this kind with these attachments carries a document that
 * `recordIssuedDocument` is expected to keep. False for a kind that carries none (a reservation
 * acknowledgement) and for a kind whose PDF is not among the attachments, where a null result from
 * `recordIssuedDocument` is expected and not a failure to tell the salesperson about.
 */
export function hasIssuedDocumentToKeep(
  kind: string | null | undefined,
  attachments: IssuedAttachment[],
): boolean {
  const docType = issuedDocumentTypeForKind(kind)
  if (!docType) return false

  const attachment = pickIssuedAttachment(docType, attachments)
  if (!attachment) return false

  // Mirrors captureIssuedDocument, which keeps nothing for an empty file.
  return Buffer.from(attachment.contentBase64, "base64").length > 0
}

export interface RecordIssuedDocumentInput {
  bookingId: string
  /** The email that carried the document; absent when the copy is kept without being sent. */
  correspondenceId?: string
  issueKind?: "sent" | "saved"
  kind: string | null | undefined
  attachments: IssuedAttachment[]
  quoteId?: string | null
  voucherId?: string | null
  issuedBy?: string | null
}

/**
 * Called by the send route once an email has gone out: keeps the document it carried and links the
 * email to that copy. Also used to keep a copy WITHOUT an email (`issueKind: "saved"`, no
 * `correspondenceId`). Never throws and never affects a send; returns the kept copy's id, or null
 * when nothing was kept.
 */
export async function recordIssuedDocument(supabase: Client, input: RecordIssuedDocumentInput): Promise<string | null> {
  try {
    const docType = issuedDocumentTypeForKind(input.kind)
    if (!docType) return null

    const attachment = pickIssuedAttachment(docType, input.attachments)
    if (!attachment) return null

    let invoiceId: string | null = null
    if (docType === "invoice") {
      // One live invoice per booking in practice; the newest non-void one is the one just sent.
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("booking_id", input.bookingId)
        .in("kind", ["deposit", "full"])
        .neq("status", "void")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) console.error("document-versions:invoice-lookup", error)
      invoiceId = data?.id ?? null
    }

    // What the booking looked like when this went out. Failing to take it only means this copy can
    // never be reported as changed ("unknown"); it must not stop the copy being kept.
    let contentFingerprint: string | null = null
    try {
      contentFingerprint = await computeContentFingerprint(supabase, {
        bookingId: input.bookingId,
        docType,
        quoteId: docType === "quote" ? input.quoteId ?? null : null,
        invoiceId,
      })
    } catch (error) {
      console.error("document-versions:fingerprint", error)
    }

    const versionId = await captureIssuedDocument(supabase, {
      bookingId: input.bookingId,
      docType,
      attachment,
      quoteId: docType === "quote" ? input.quoteId ?? null : null,
      invoiceId,
      voucherId: docType === "voucher" ? input.voucherId ?? null : null,
      issuedBy: input.issuedBy ?? null,
      issueKind: input.issueKind ?? "sent",
      contentFingerprint,
    })
    if (!versionId) return null

    if (input.correspondenceId) {
      const { error: linkError } = await supabase
        .from("correspondences")
        .update({ document_version_id: versionId })
        .eq("id", input.correspondenceId)

      if (linkError) console.error("document-versions:link", linkError)
    }

    return versionId
  } catch (error) {
    console.error("document-versions:record", error)
    return null
  }
}
