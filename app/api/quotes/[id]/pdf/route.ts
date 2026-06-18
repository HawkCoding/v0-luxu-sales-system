import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import { logError } from "@/lib/error-log"

export const runtime = "nodejs"

const QUOTE_BUCKET = "quotes"

function sanitizePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
}

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, booking_id, quote_number, status, validity_until, subtotal, vat, total, created_at, booking:bookings(id, booking_number, customer:customers(first_name, last_name))",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return jsonError("Quote not found", 404)
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true })

  if (lineItemsError) {
    return safeSupabaseError("quote-pdf:load-line-items", lineItemsError)
  }

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderQuotePdf({
      quoteNumber: quote.quote_number ?? id,
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
    console.error("quote-pdf:render", err)
    void logError({ severity: "Critical", source: "quote-pdf", message: "Quote PDF could not be rendered", details: { quoteId: id, error: err instanceof Error ? err.message : String(err) } })
    return jsonError("Quote PDF could not be rendered", 500)
  }

  const safeQuoteNumber = sanitizePath(quote.quote_number ?? id)
  const filename = `quote-${safeQuoteNumber}.pdf`
  const storagePath = `${safeQuoteNumber}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(QUOTE_BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) return safeSupabaseError("quote-pdf:storage-upload", uploadError)

  const documentPath = `${QUOTE_BUCKET}/${storagePath}`

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
    return safeSupabaseError("quote-pdf:document-write", documentWrite.error)
  }

  // Link the generated document back so correspondence can auto-attach it.
  await supabase
    .from("quotes")
    .update({ pdf_document_id: documentWrite.data.id })
    .eq("id", id)

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_pdf_generated",
    meta_json: {
      document_id: documentWrite.data.id,
      storage_path: documentPath,
    },
  })

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(QUOTE_BUCKET)
    .createSignedUrl(storagePath, 3600)

  if (signedUrlError) {
    return safeSupabaseError("quote-pdf:signed-url", signedUrlError)
  }

  return Response.json({
    document: {
      id: documentWrite.data.id,
      bookingId: documentWrite.data.booking_id,
      kind: documentWrite.data.kind,
      status: documentWrite.data.status,
      storagePath: documentWrite.data.storage_path,
      createdAt: documentWrite.data.created_at,
    },
    url: signedUrlData.signedUrl,
  })
}
