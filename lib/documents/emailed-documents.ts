import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"
import { issuedDocumentTypeForKind } from "@/lib/documents/issued-documents"
import type { IssuedDocumentSend } from "@/lib/documents/issued-documents"

type Client = SupabaseClient<Database>

/** What we know about a document type that has been emailed to the client on this booking. */
export interface EmailedDocument {
  /** The emails that carried it, newest first. Empty when we only know from the invoice's own record. */
  sends: IssuedDocumentSend[]
  /** When the booking says it went out, for a document with no email on record. */
  fallbackSentAt: string | null
}

/**
 * Which of the quote, invoice and voucher have been emailed to the client, whether or not a copy of
 * the PDF was kept at the time. Copies are only kept for emails sent after `document_versions`
 * existed, so an older booking can have emailed a quote that has no kept copy; this reads the
 * email log (and, for the invoice, the invoice's own sent date) instead.
 *
 * An invoice counts from its own record only when it has a sent date: the send dialog stamps one
 * when the email goes out, whereas an invoice that merely reads sent or paid (a payment flips a
 * draft to paid, undoing it flips it to sent) was not necessarily ever emailed. An invoice paid
 * before it was emailed carries no sent date but does have its email in the log.
 *
 * "Emailed" uses the same test as the sends list: a correspondence row with status `sent`.
 * Never throws; a failed lookup is logged and reads as "nothing emailed", which only means the
 * extra conveniences stay hidden.
 */
export async function loadEmailedDocuments(
  supabase: Client,
  bookingId: string,
): Promise<Map<IssuedDocumentType, EmailedDocument>> {
  const emailed = new Map<IssuedDocumentType, EmailedDocument>()

  try {
    const { data: rows, error } = await supabase
      .from("correspondences")
      .select("id, kind, subject, sent_at, recipients")
      .eq("booking_id", bookingId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })

    if (error) throw error

    for (const row of rows ?? []) {
      const docType = issuedDocumentTypeForKind(row.kind)
      if (!docType) continue
      const existing = emailed.get(docType) ?? { sends: [], fallbackSentAt: null }
      existing.sends.push({
        correspondenceId: row.id,
        subject: row.subject,
        sentAt: row.sent_at,
        recipients: row.recipients ?? [],
      })
      emailed.set(docType, existing)
    }
  } catch (error) {
    console.error("emailed-documents:correspondences", error)
  }

  try {
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("sent_at")
      .eq("booking_id", bookingId)
      .in("status", ["sent", "paid"])
      .order("created_at", { ascending: false })

    if (error) throw error

    // The newest invoice that has a sent date; one without it was never emailed from here.
    const newestSent = (invoices ?? []).find((invoice) => invoice.sent_at !== null)
    if (newestSent?.sent_at && !emailed.has("invoice")) {
      emailed.set("invoice", { sends: [], fallbackSentAt: newestSent.sent_at })
    }
  } catch (error) {
    console.error("emailed-documents:invoices", error)
  }

  return emailed
}
