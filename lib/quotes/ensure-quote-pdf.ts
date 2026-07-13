import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import { getDocumentTextSettings } from "@/lib/settings-access"
import { logError } from "@/lib/error-log"

export const QUOTE_BUCKET = "quotes"

function sanitizePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
}

export interface EnsureQuotePdfOptions {
  actorName: string
  actorUserId: string
  /** Re-render even when a PDF document already exists (default false). */
  force?: boolean
}

export interface EnsuredQuotePdf {
  documentId: string
  bookingId: string
  /** documents.storage_path, prefixed with the bucket (e.g. "quotes/BT-1_Q1/quote-BT-1_Q1.pdf"). */
  storagePath: string
  status: string
  createdAt: string
  regenerated: boolean
}

/**
 * Guarantee a stored quote PDF exists and is linked via quotes.pdf_document_id.
 * Shared by the download route (force re-render) and the correspondence send
 * hub (generate-if-missing so a quote email never goes out without its PDF).
 * Throws on load/render/storage failures.
 */
export async function ensureQuotePdf(
  supabase: SupabaseClient<Database>,
  quoteId: string,
  { actorName, actorUserId, force = false }: EnsureQuotePdfOptions,
): Promise<EnsuredQuotePdf> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, booking_id, quote_number, status, validity_until, subtotal, vat, total, created_at, pdf_document_id, booking:bookings(id, booking_number, customer:customers(first_name, last_name))",
    )
    .eq("id", quoteId)
    .single()

  if (quoteError || !quote) {
    throw new Error("Quote not found")
  }

  if (!force && quote.pdf_document_id) {
    const { data: existingDoc } = await supabase
      .from("documents")
      .select("id, booking_id, kind, status, storage_path, created_at")
      .eq("id", quote.pdf_document_id)
      .maybeSingle()

    if (existingDoc?.storage_path) {
      return {
        documentId: existingDoc.id,
        bookingId: existingDoc.booking_id,
        storagePath: existingDoc.storage_path,
        status: existingDoc.status,
        createdAt: existingDoc.created_at,
        regenerated: false,
      }
    }
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true })

  if (lineItemsError) {
    throw new Error("Quote line items could not be loaded")
  }

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()

  const documentText = await getDocumentTextSettings(supabase)

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderQuotePdf({
      title: documentText.quote_doc_title,
      footerText: documentText.quote_doc_footer_text,
      quoteNumber: quote.quote_number ?? quoteId,
      bookingNumber: booking?.booking_number ?? "",
      customerName,
      quoteDate: quote.created_at.slice(0, 10),
      validUntil: quote.validity_until,
      lineItems: (lineItems ?? []).map((li) => ({
        description: li.description,
        supplierDescription: li.supplier_description,
        qty: li.qty,
        unit:
          li.pricing_snapshot && typeof li.pricing_snapshot === "object"
            ? ((li.pricing_snapshot as { unit?: string | null }).unit ?? null)
            : null,
        unitPrice: li.unit_price,
        total: li.total,
      })),
      subtotal: quote.subtotal,
      vat: quote.vat,
      total: quote.total,
    })
  } catch (err) {
    void logError({
      severity: "Critical",
      source: "quote-pdf",
      message: "Quote PDF could not be rendered",
      details: { quoteId, error: err instanceof Error ? err.message : String(err) },
    })
    throw new Error("Quote PDF could not be rendered")
  }

  const safeQuoteNumber = sanitizePath(quote.quote_number ?? quoteId)
  const filename = `quote-${safeQuoteNumber}.pdf`
  const objectPath = `${safeQuoteNumber}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(QUOTE_BUCKET)
    .upload(objectPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    throw new Error("Quote PDF could not be stored")
  }

  const documentPath = `${QUOTE_BUCKET}/${objectPath}`

  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("booking_id", quote.booking_id)
    .eq("kind", "quote_pdf")
    .eq("storage_path", documentPath)
    .maybeSingle()

  const documentPayload = {
    booking_id: quote.booking_id,
    kind: "quote_pdf" as const,
    status: "generated" as const,
    storage_path: documentPath,
  }

  const documentWrite = existingDocument
    ? await supabase
        .from("documents")
        .update(documentPayload)
        .eq("id", existingDocument.id)
        .select("id, booking_id, kind, status, storage_path, created_at")
        .single()
    : await supabase
        .from("documents")
        .insert(documentPayload)
        .select("id, booking_id, kind, status, storage_path, created_at")
        .single()

  if (documentWrite.error || !documentWrite.data) {
    throw new Error("Quote PDF document record could not be written")
  }

  // Link the generated document back so correspondence can auto-attach it.
  await supabase
    .from("quotes")
    .update({ pdf_document_id: documentWrite.data.id })
    .eq("id", quoteId)

  await supabase.from("audit_logs").insert({
    actor: actorName,
    actor_user_id: actorUserId,
    entity_type: "Quote",
    entity_id: quoteId,
    action: "quote_pdf_generated",
    meta_json: {
      document_id: documentWrite.data.id,
      storage_path: documentPath,
    },
  })

  return {
    documentId: documentWrite.data.id,
    bookingId: documentWrite.data.booking_id,
    storagePath: documentPath,
    status: documentWrite.data.status,
    createdAt: documentWrite.data.created_at,
    regenerated: true,
  }
}
