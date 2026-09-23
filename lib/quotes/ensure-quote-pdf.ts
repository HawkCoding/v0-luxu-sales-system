import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import { deriveFlightCapPerPerson, deriveJourneyFromBlocks } from "@/lib/quotes/quote-presentation"
import {
  complimentaryLegIdsFromLineItems,
  complimentaryTransportRequestIdsFromLineItems,
  firstNightComplimentaryLegIdsFromLineItems,
  legIdsFromLineItems,
} from "@/lib/quotes/accepted-quote-scope"
import { buildVoucherServiceBlocks, mapSupplierKindToServiceType } from "@/lib/voucher/build-service-blocks"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import {
  getDocumentBrandSettings,
  getDocumentTextSettings,
  resolveDocumentBrand,
} from "@/lib/settings-access"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { logError } from "@/lib/error-log"
import { documentFileName, shortBookingRef, stripQuoteVersion } from "@/lib/documents/file-names"
import { upsertGeneratedDocument } from "@/lib/documents/upsert-generated-document"
import type { PricingSnapshot } from "@/lib/types"
import { loadSupplierKind } from "@/lib/suppliers/load-supplier-kind"
import { loadQuoteConfig, overridesFromQuoteRow } from "@/lib/quotes/load-quote-config"

export const QUOTE_BUCKET = "quotes"

function sanitizePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
}

/**
 * Name of the quote PDF — both the emailed attachment and the stored file:
 * `Quote-26-0039.pdf`. Named after the short booking reference, never the
 * versioned quote number, so no `-Q1` reaches the customer; it falls back to
 * the quote number (version stripped) when the booking number is unavailable.
 */
export function buildAttachmentFilename(quoteNumber: string, bookingNumber: string | null | undefined): string {
  const reference = bookingNumber || stripQuoteVersion(quoteNumber)
  return documentFileName("Quote", shortBookingRef(reference))
}

/** The pre-rename stored name (`quotes/<quoteNo>/quote-<quoteNo>.pdf`), still on older quotes. */
export function legacyQuoteObjectPath(quoteNumber: string): string {
  const safeQuoteNumber = sanitizePath(quoteNumber)
  return `${safeQuoteNumber}/quote-${safeQuoteNumber}.pdf`
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
  /**
   * documents.storage_path, prefixed with the bucket (e.g.
   * "quotes/LTT-26-0039-Q1/Quote-26-0039.pdf"). Older quotes keep their
   * lowercase "quote-<quoteNo>.pdf" name until they are next re-rendered.
   */
  storagePath: string
  /**
   * Name to attach the PDF under when emailing it (`Quote-26-0039.pdf`). The
   * storage directory stays keyed on the versioned quote number so quote
   * versions cannot overwrite each other; the file name itself carries no version.
   */
  attachmentFilename: string
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
      "id, booking_id, quote_number, status, validity_until, subtotal, total, agent_commission, discount_amount, discount_visible, currency, created_at, pdf_document_id, journey_class, rate_audience, show_train_only_note, booking:bookings(id, booking_number, no_of_adults, no_of_children, primary_supplier_id, customer:customers(title, first_name, last_name, email, phone))",
    )
    .eq("id", quoteId)
    .single()

  if (quoteError || !quote) {
    throw new Error("Quote not found")
  }

  const quoteBooking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const attachmentFilename = buildAttachmentFilename(
    quote.quote_number ?? quoteId,
    quoteBooking?.booking_number,
  )

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
        attachmentFilename,
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

  const booking = quoteBooking
  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer
  const customerName = formatCustomerSalutation(customer)

  // Scope the itinerary to legs actually priced into this quote version, not whatever is
  // currently selected live on the job — an empty set means a manual/no-package quote, so fall
  // back to unfiltered (today's behavior) rather than rendering an empty itinerary.
  const quoteLegIds = legIdsFromLineItems(lineItems)
  const complimentaryLegIds = complimentaryLegIdsFromLineItems(lineItems)
  const firstNightComplimentaryLegIds = firstNightComplimentaryLegIdsFromLineItems(lineItems)
  const complimentaryTransportRequestIds = complimentaryTransportRequestIdsFromLineItems(lineItems)

  // Same journey/rate resolution the quote email uses, so the PDF stapled to a
  // send never disagrees with the body text.
  const quoteConfig = await loadQuoteConfig(supabase, {
    lineItems: (lineItems ?? []).map((li) => ({ pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null })),
    overrides: overridesFromQuoteRow(quote),
    bookingPrimarySupplierId: booking?.primary_supplier_id ?? null,
  })

  // A train whose journey length or rate audience can't be resolved must not silently pick a
  // side on a client document — refuse rather than guess. See the quote's config panel.
  if (quoteConfig.unresolved.length > 0) {
    throw new Error(quoteConfig.unresolved[0])
  }

  // Names the meta line ("Journey"/"Stay"/"Tour") — same lookup the summary block and email
  // preview use, so the PDF stapled to a send never disagrees with the body text.
  const primarySupplierKind = await loadSupplierKind(supabase, quoteConfig.primarySupplierId)

  // Document copy is resolved per the primary product's kind, so a Kruger Shalati quote can carry
  // stay wording (Settings > Document Text) while a rail quote keeps its own -- see
  // getDocumentTextSettings/getDocumentBrandSettings/resolveProductCopy in settings-access.ts.
  const documentText = await getDocumentTextSettings(supabase, primarySupplierKind)
  const { brand, position } = resolveDocumentBrand(
    await getDocumentBrandSettings(supabase, primarySupplierKind),
  )
  const brandLogo = await loadBrandLogo(brand.logoUrl)

  // Itinerary degrades to an empty section rather than blocking the PDF —
  // correspondence relies on a quote email never going out without its PDF.
  let itineraryBlocks: VoucherServiceBlock[] = []
  try {
    const { blocks } = await buildVoucherServiceBlocks(supabase, {
      bookingId: quote.booking_id,
      additionalServicesDetails: null,
      legIds: quoteLegIds.size > 0 ? quoteLegIds : undefined,
      complimentaryLegIds,
      firstNightComplimentaryLegIds,
      complimentaryTransportRequestIds,
      inclusionFilter: { journeyClass: quoteConfig.journeyClass, rateAudience: quoteConfig.rateAudience },
    })
    itineraryBlocks = blocks
  } catch (err) {
    void logError({
      severity: "Warning",
      source: "quote-pdf",
      message: "Quote itinerary blocks could not be loaded",
      details: { quoteId, error: err instanceof Error ? err.message : String(err) },
    })
  }

  // Journey window comes from the priced legs, not the booking's enquiry-time scalar dates which
  // drift out of sync once the package changes -- narrowed to the primary product's own legs
  // where it has any (F-P3-4), so a tour's dates aren't stretched by an add-on hotel or transfer.
  const journey = deriveJourneyFromBlocks(
    itineraryBlocks,
    mapSupplierKindToServiceType(primarySupplierKind),
  ) ?? { start: null, end: null }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderQuotePdf({
      title: documentText.quote_doc_title,
      footerText: documentText.quote_doc_footer_text,
      packageIncludesHeading: documentText.quote_doc_includes_heading,
      packageExcludesHeading: documentText.quote_doc_excludes_heading,
      packageExcludesDefault: documentText.quote_doc_excludes_default,
      quoteNumber: quote.quote_number ?? quoteId,
      customerName,
      customerPhone: customer?.phone ?? null,
      customerEmail: customer?.email ?? null,
      quoteDate: quote.created_at.slice(0, 10),
      validUntil: quote.validity_until,
      journeyStart: journey.start,
      journeyEnd: journey.end,
      adults: booking?.no_of_adults ?? 0,
      children: booking?.no_of_children ?? 0,
      total: quote.total,
      subtotal: quote.subtotal,
      agentCommission: Number(quote.agent_commission ?? 0),
      discount: Number(quote.discount_amount ?? 0),
      discountVisible: quote.discount_visible ?? true,
      // The PDF has always accepted a currency and defaulted it to ZAR; nothing ever passed one,
      // so a foreign-currency quote printed rand symbols over foreign amounts. This also feeds
      // the footer's {{currency}} merge field.
      currency: quote.currency,
      itineraryBlocks,
      flightCapPerPerson: deriveFlightCapPerPerson(
        (lineItems ?? []).map((li) => ({
          unitPrice: Number(li.unit_price),
          pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null,
        })),
      ),
      brand,
      brandPosition: position.quote,
      brandLogo,
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

  // Directory stays keyed on the versioned quote number so versions never
  // overwrite each other; the file itself is named like the attachment.
  const quoteNumber = quote.quote_number ?? quoteId
  const objectPath = `${sanitizePath(quoteNumber)}/${attachmentFilename}`

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

  const document = await upsertGeneratedDocument(supabase, {
    bookingId: quote.booking_id,
    kind: "quote_pdf",
    storagePath: documentPath,
    legacyStoragePaths: [`${QUOTE_BUCKET}/${legacyQuoteObjectPath(quoteNumber)}`],
    fileName: attachmentFilename,
  })

  if (!document) {
    throw new Error("Quote PDF document record could not be written")
  }

  // Link the generated document back so correspondence can auto-attach it.
  await supabase
    .from("quotes")
    .update({ pdf_document_id: document.id })
    .eq("id", quoteId)

  await supabase.from("audit_logs").insert({
    actor: actorName,
    actor_user_id: actorUserId,
    entity_type: "Quote",
    entity_id: quoteId,
    action: "quote_pdf_generated",
    meta_json: {
      document_id: document.id,
      storage_path: documentPath,
    },
  })

  return {
    attachmentFilename,
    documentId: document.id,
    bookingId: document.booking_id,
    storagePath: documentPath,
    status: document.status,
    createdAt: document.created_at,
    regenerated: true,
  }
}
