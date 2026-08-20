import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildInvoiceView } from "@/lib/invoices/build-invoice-view"
import type { InvoiceTotals } from "@/lib/invoices/pdf/invoice-document"
import { renderInvoicePdf } from "@/lib/invoices/render-invoice-pdf"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import { getPaymentMethod } from "@/lib/payment-methods"
import {
  getDocumentBrandSettings,
  getDocumentTextSettings,
  resolveDocumentBrand,
} from "@/lib/settings-access"
import { logError } from "@/lib/error-log"

export const INVOICE_BUCKET = "invoices"

function sanitizePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
}

export interface EnsureInvoicePdfInput {
  invoice: {
    id: string
    booking_id: string
    quote_id?: string | null
    invoice_number: string
    amount: number
    currency: string
    due_date: string | null
    created_at: string
    status: string
    /** Bank/company details this invoice was generated with; omitted resolves to the account default. */
    payment_method_id?: string | null
  }
  bookingNumber: string
  /**
   * The number printed on the PDF as "Invoice No.", reused as the bank
   * payment reference, and used for the storage path/filename — the
   * salesperson-entered `customer_invoice_number`, resolved via
   * `clientInvoiceNumber` (falls back to `invoice.invoice_number` for
   * legacy bookings that predate the required-invoice-number stage gate).
   */
  displayInvoiceNumber: string
  customerName: string
  /**
   * Client-facing status printed in the invoice header (Provisional /
   * Confirmed / …). Resolved by the caller from the configured status options
   * and the booking's payment state.
   */
  statusLabel: string
  /** The money ladder, built by the caller from the current balance. */
  totals: InvoiceTotals
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
  { invoice, bookingNumber, displayInvoiceNumber, customerName, statusLabel, totals }: EnsureInvoicePdfInput,
): Promise<EnsuredInvoicePdf> {
  const [method, documentText, documentBrand] = await Promise.all([
    getPaymentMethod(supabase, invoice.payment_method_id ?? null),
    getDocumentTextSettings(supabase),
    getDocumentBrandSettings(supabase),
  ])
  const banking = method.banking
  const { brand, position } = resolveDocumentBrand(documentBrand)
  const brandLogo = await loadBrandLogo(brand.logoUrl)

  const view = await buildInvoiceView(supabase, {
    bookingId: invoice.booking_id,
    quoteId: invoice.quote_id ?? null,
    journeyHeading: documentText.itinerary_doc_journey_heading,
  })

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderInvoicePdf({
      invoiceNumber: displayInvoiceNumber,
      bookingNumber,
      customerName,
      issueDate: invoice.created_at.slice(0, 10),
      dueDate: invoice.due_date,
      consultant: view.consultant,
      guestNames: view.guestNames,
      billing: view.billing,
      departure: view.departure,
      items: view.items,
      totals,
      currency: invoice.currency,
      statusLabel,
      banking,
      footerText: documentText.invoice_doc_footer_text,
      paymentNote: documentText.invoice_doc_payment_note,
      bankChargesNote: documentText.invoice_doc_bank_charges_note,
      brand,
      brandPosition: position.invoice,
      brandLogo,
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

  const safeNumber = sanitizePath(displayInvoiceNumber)
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
