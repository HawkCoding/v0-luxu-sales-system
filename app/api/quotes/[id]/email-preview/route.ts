import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { composeEmail } from "@/lib/templates/compose-email"
import { buildSuiteTokens, suiteSelectionsFromSnapshots } from "@/lib/templates/suite-description"
import { buildQuoteSummaryBlock } from "@/lib/quotes/quote-summary-block"
import { formatMoney } from "@/lib/money"
import { deriveFlightCapPerPerson, deriveJourneyFromBlocks } from "@/lib/quotes/quote-presentation"
import { resolvePrimaryRoute, resolvePrimarySupplierId } from "@/lib/quotes/resolve-primary-route"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import {
  complimentaryLegIdsFromLineItems,
  complimentaryTransportRequestIdsFromLineItems,
  firstNightComplimentaryLegIdsFromLineItems,
  legIdsFromLineItems,
} from "@/lib/quotes/accepted-quote-scope"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { PricingSnapshot } from "@/lib/types"
import { getDocumentTextSettings } from "@/lib/settings-access"

// Composes the quote email from the editable quote_email template (Templates
// page) with the line-item summary injected as the {{quoteSummaryTable}} block.
const previewSchema = z.object({
  subject: z.string().trim().min(1).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: Request, { params }: RouteParams) {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const parsed = previewSchema.safeParse(await req.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, booking_id, quote_number, validity_until, subtotal, total, currency, created_at, booking:bookings(booking_number, no_of_adults, no_of_children, assigned_salesperson_id, route:routes(name, supplier:suppliers(name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(name), customer:customers(title, first_name, last_name))",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true })

  if (lineItemsError) {
    return NextResponse.json({ error: "Failed to load quote line items" }, { status: 500 })
  }

  if (!lineItems || lineItems.length === 0) {
    return NextResponse.json({ error: "Quote must have line items before it can be sent" }, { status: 400 })
  }

  // The quoted journey's route (from line-item snapshots) beats the booking's
  // route_id, which may still point at the enquiry-time route.
  const snapshotCarriers = lineItems.map((li) => ({
    pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null,
  }))
  const { routeName: quotedRouteName } = resolvePrimaryRoute(snapshotCarriers)

  // The supplier is named to the customer exactly as it is spelled in Suppliers,
  // so the name is read live off the record rather than from the booking's
  // enquiry-time route (a fuzzy text match that often points at another
  // supplier) or the snapshot's frozen copy of the name.
  const quotedSupplierId = resolvePrimarySupplierId(snapshotCarriers)
  let quotedSupplierName: string | null = null
  if (quotedSupplierId) {
    const { data: quotedSupplier } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", quotedSupplierId)
      .maybeSingle()
    quotedSupplierName = quotedSupplier?.name ?? null
  }

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const customer = Array.isArray(booking?.customer) ? booking?.customer[0] : booking?.customer
  const route = Array.isArray(booking?.route) ? booking?.route[0] : booking?.route
  const routeSupplier = Array.isArray(route?.supplier) ? route?.supplier[0] : route?.supplier
  const hotelSupplier = Array.isArray(booking?.hotel_supplier)
    ? booking?.hotel_supplier[0]
    : booking?.hotel_supplier
  const customerName = formatCustomerSalutation(customer) || "traveller"
  const supplierName =
    quotedSupplierName ?? routeSupplier?.name ?? hotelSupplier?.name ?? "Supplier"
  const clientSurname = customer?.last_name?.trim() || "Client"
  const quoteNumber = quote.quote_number ?? `${booking?.booking_number ?? "QUOTE"}-Q1`
  const quoteDate = quote.created_at?.slice(0, 10) ?? todayDateString()

  // Scope the itinerary to legs actually priced into this quote version, not whatever is
  // currently selected live on the job — an empty set means a manual/no-package quote, so fall
  // back to unfiltered (today's behavior) rather than rendering an empty itinerary.
  const quoteLegIds = legIdsFromLineItems(lineItems)
  const complimentaryLegIds = complimentaryLegIdsFromLineItems(lineItems)
  const firstNightComplimentaryLegIds = firstNightComplimentaryLegIdsFromLineItems(lineItems)
  const complimentaryTransportRequestIds = complimentaryTransportRequestIdsFromLineItems(lineItems)

  // Itinerary degrades to an omitted section rather than failing the preview.
  let itineraryBlocks: VoucherServiceBlock[] = []
  try {
    const { blocks } = await buildVoucherServiceBlocks(supabase, {
      bookingId: quote.booking_id,
      additionalServicesDetails: null,
      legIds: quoteLegIds.size > 0 ? quoteLegIds : undefined,
      complimentaryLegIds,
      firstNightComplimentaryLegIds,
      complimentaryTransportRequestIds,
    })
    itineraryBlocks = blocks
  } catch {
    itineraryBlocks = []
  }

  const documentText = await getDocumentTextSettings(supabase)

  // Journey + header departure date come from the priced legs, not the booking's
  // enquiry-time scalar dates which drift out of sync once the package changes.
  const journey = deriveJourneyFromBlocks(itineraryBlocks) ?? { start: null, end: null }

  const quoteSummaryTable = buildQuoteSummaryBlock({
    quoteNumber,
    quoteDate,
    validUntil: quote.validity_until,
    journeyStart: journey.start,
    journeyEnd: journey.end,
    adults: booking?.no_of_adults ?? 0,
    children: booking?.no_of_children ?? 0,
    total: quote.total,
    currency: quote.currency,
    itineraryBlocks,
    packageIncludesHeading: documentText.quote_doc_includes_heading,
    packageExcludesHeading: documentText.quote_doc_excludes_heading,
    packageExcludesDefault: documentText.quote_doc_excludes_default,
    flightCapPerPerson: deriveFlightCapPerPerson(
      lineItems.map((li) => ({
        unitPrice: Number(li.unit_price),
        pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null,
      })),
    ),
  })

  const shared = await resolveSharedEmailTokens(supabase, quote.booking_id)
  const composed = await composeEmail(supabase, "quote_email", {
    tokens: {
      ...shared.tokens,
      customerName,
      jobNumber: booking?.booking_number ?? "",
      quoteNumber,
      quoteDate: formatDisplayDateLong(quoteDate),
      validityDate: formatDisplayDateLong(quote.validity_until) || "To be confirmed",
      departureDate: formatDisplayDateLong(journey.start) || "To be confirmed",
      departureDateShort: formatDisplayDateLong(journey.start) || "TBC",
      direction: quotedRouteName ?? route?.name ?? "your journey",
      supplierName,
      clientSurname,
      total: formatMoney(quote.total, quote.currency),
      ...buildSuiteTokens(
        suiteSelectionsFromSnapshots(
          lineItems.map((li) => li.pricing_snapshot as PricingSnapshot | null),
        ),
      ),
    },
    blocks: { ...shared.blocks, quoteSummaryTable },
    senderProfileId: booking?.assigned_salesperson_id ?? user.id,
  })

  if (!composed) {
    return NextResponse.json({ error: "Quote email template could not be resolved" }, { status: 500 })
  }

  const subject = parsed.data.subject ?? composed.subject

  return NextResponse.json({
    html: composed.bodyHtml,
    bodyContentHtml: composed.bodyContentHtml,
    subject,
    quoteNumber,
    warnings: composed.warnings,
    signatureProfileId: composed.signatureProfileId,
    signatureBrandId: composed.signatureBrandId,
  })
}
