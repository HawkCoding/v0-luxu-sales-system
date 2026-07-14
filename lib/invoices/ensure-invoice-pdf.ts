import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { renderInvoicePdf, type InvoicePdfLine } from "@/lib/invoices/render-invoice-pdf"
import { getBankingSettings, getDocumentTextSettings } from "@/lib/settings-access"
import { logError } from "@/lib/error-log"

export const INVOICE_BUCKET = "invoices"

function sanitizePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
}

export interface EnsureInvoicePdfInput {
  invoice: {
    id: string
    booking_id: string
    kind: "deposit" | "final"
    invoice_number: string
    amount: number
    currency: string
    due_date: string | null
    created_at: string
    status: string
  }
  bookingNumber: string
  customerName: string
  /** Context lines (quote total, payments received, ...) shown above the amount due. */
  lines: InvoicePdfLine[]
}

export interface EnsuredInvoicePdf {
  documentId: string
  /** documents.storage_path, prefixed with the bucket. */
  storagePath: string
  filename: string
  contentBase64: string
}

/**
 * Render the invoice PDF, store it in the invoices bucket, upsert the
 * documents row, and link invoices.pdf_document_id. Always re-renders so the
 * PDF reflects the current invoice state. Throws on render/storage failures.
 */
export async function ensureInvoicePdf(
  supabase: SupabaseClient<Database>,
  { invoice, bookingNumber, customerName, lines }: EnsureInvoicePdfInput,
): Promise<EnsuredInvoicePdf> {
  const [banking, documentText] = await Promise.all([
    getBankingSettings(supabase),
    getDocumentTextSettings(supabase),
  ])

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      bookingNumber,
      customerName,
      kind: invoice.kind,
      issueDate: invoice.created_at.slice(0, 10),
      dueDate: invoice.due_date,
      lines,
      amountDue: invoice.amount,
      currency: invoice.currency,
      statusLabel: invoice.status === "draft" ? "Draft" : invoice.status,
      banking,
      depositTitle: documentText.invoice_doc_deposit_title,
      finalTitle: documentText.invoice_doc_final_title,
      footerText: documentText.invoice_doc_footer_text,
    })
  } catch (err) {
    void logError({
      severity: "Critical",
      source: "invoice-pdf",
      message: "Invoice PDF could not be rendered",
      details: { invoiceId: invoice.id, error: err instanceof Error ? err.message : String(err) },
    })
    throw new Error("Invoice PDF could not be rendered")
  }

  const safeNumber = sanitizePath(invoice.invoice_number)
  const filename = `invoice-${safeNumber}.pdf`
  const objectPath = `${safeNumber}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(INVOICE_BUCKET)
    .upload(objectPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    throw new Error("Invoice PDF could not be stored")
  }

  const documentPath = `${INVOICE_BUCKET}/${objectPath}`

  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("booking_id", invoice.booking_id)
    .eq("kind", "invoice_pdf")
    .eq("storage_path", documentPath)
    .maybeSingle()

  const documentPayload = {
    booking_id: invoice.booking_id,
    kind: "invoice_pdf" as const,
    status: "generated" as const,
    storage_path: documentPath,
  }

  const documentWrite = existingDocument
    ? await supabase
        .from("documents")
        .update(documentPayload)
        .eq("id", existingDocument.id)
        .select("id")
        .single()
    : await supabase.from("documents").insert(documentPayload).select("id").single()

  if (documentWrite.error || !documentWrite.data) {
    throw new Error("Invoice PDF document record could not be written")
  }

  const { error: linkError } = await supabase
    .from("invoices")
    .update({ pdf_document_id: documentWrite.data.id })
    .eq("id", invoice.id)

  if (linkError) {
    console.error("invoice-pdf:link", linkError)
  }

  return {
    documentId: documentWrite.data.id,
    storagePath: documentPath,
    filename,
    contentBase64: pdfBuffer.toString("base64"),
  }
}
