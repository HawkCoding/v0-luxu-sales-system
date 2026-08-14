import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildPackageQuoteLineItems, calculateQuoteTotals } from "@/lib/quotes/build-from-package"
import { isMissingPricing } from "@/lib/quotes/pricing-engine"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import { bookingServicesToLegSelections, loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import { getDefaultCommission } from "@/lib/pricing/default-commission"
import { isoDateDaysFromNow, resolveValidityDays } from "@/lib/quotes/quote-validity"
import { getCachedRates } from "@/lib/fx/rates"
import { BASE_CURRENCY } from "@/lib/money"

type ServiceClient = SupabaseClient<Database>

/**
 * The rate types the auto-quote prices against -- the same precedence the Build Booking dialog
 * applies, so an auto-priced quote and a hand-built one agree.
 *
 * Only the system-wide fallback is resolved here; each leg carries its supplier's quoted and base
 * rates, which selectRateCard tries first.
 */
async function resolveRateTypes(supabase: ServiceClient) {
  const { data: rateTypeRows } = await supabase
    .from("rate_types")
    .select("id, code, name, is_default")
    .is("archived_at", null)

  const rateTypes = (rateTypeRows ?? []).map(({ id, code, name }) => ({ id, code, name }))
  const fallbackRateTypeId = (rateTypeRows ?? []).find((rt) => rt.is_default)?.id ?? null

  return { rateTypes, fallbackRateTypeId }
}

/** Same setting POST /api/quotes and POST /api/jobs/[id]/start-quote read, so all three
 * quote-creation paths stamp the same window. Falls back to DEFAULT_QUOTE_VALIDITY_DAYS. */
async function resolveQuoteValidityDate(supabase: ServiceClient): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "quote_validity_days")
    .maybeSingle()
  return isoDateDaysFromNow(resolveValidityDays(data?.value))
}

/**
 * Prices and inserts a draft quote for a freshly created booking, off whatever
 * autoBuildBookingServices already composed (see lib/auto-build/build-from-enquiry.ts) -- never a
 * catalogue package pick. Shared by both attended intake (POST /api/enquiries) and the unattended
 * inbound-email importer, so the two paths can't drift on how "no services yet" is priced/flagged.
 */
export async function createDraftQuoteForBooking({
  supabase,
  bookingId,
  bookingNumber,
  travelDate,
}: {
  supabase: ServiceClient
  bookingId: string
  bookingNumber: string
  travelDate: string | null
}): Promise<{ quoteId: string | null; warning: string | null }> {
  let lineItems: Awaited<ReturnType<typeof buildPackageQuoteLineItems>>["lineItems"] = []
  let status: "draft" | "pricing_incomplete" = "pricing_incomplete"
  let warning: string | null = null

  const { services, units, detail } = await loadBookingServicesPackageDetail(supabase, bookingId, bookingNumber)
  const noServicesBuilt = services.length === 0

  if (noServicesBuilt) {
    warning = "No services were auto-built from the enquiry."
  } else {
    try {
      const selections = bookingServicesToLegSelections(services, units)
      // The house commission stands in for the value Build Booking would otherwise stop and ask
      // a human for, so the waiting quote shows a real total. A zero default means "not
      // configured" -- leave the commission line off entirely rather than write a R0.00 line.
      const defaultCommission = await getDefaultCommission(supabase)
      if (defaultCommission.value > 0 && selections.length > 0) {
        selections[0] = { ...selections[0], commissionOverride: defaultCommission }
      }
      const { rateTypes, fallbackRateTypeId } = await resolveRateTypes(supabase)
      // Auto-drafted quotes are always in the base currency -- there is no salesperson here to
      // pick one. A foreign supplier's rate still has to be converted into it, so the cached
      // rates come along; getCachedRates never calls out, keeping intake off a third party's
      // latency.
      const fx = await getCachedRates(supabase)

      const built = await buildPackageQuoteLineItems({
        supabase,
        packageDetail: detail,
        jobId: bookingId,
        travelDate: travelDate ?? new Date().toISOString().slice(0, 10),
        selections,
        fallbackRateTypeId,
        rateTypes,
        quoteCurrency: BASE_CURRENCY,
        fxRates: fx.rates,
        fxRateAsOf: fx.rows[0]?.asOf ?? null,
      })
      lineItems = built.lineItems
      // A flight leg with no fare typed in yet still counts as "not fully priced" -- same bar as
      // having zero lines at all. A leg skipped for missing configuration counts too: the lines
      // that priced are real, but the quote is not the whole booking.
      status =
        lineItems.length > 0 && built.incompleteLegs.length === 0 && !lineItems.some(isMissingPricing)
          ? "draft"
          : "pricing_incomplete"
      if (built.incompleteLegs.length > 0) {
        warning = built.incompleteLegs.map((leg) => leg.message).join(" · ")
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : "Services were built, but pricing could not be pre-filled."
    }
  }

  const totals = calculateQuoteTotals(lineItems)
  const validityUntil = await resolveQuoteValidityDate(supabase)
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      status,
      currency: BASE_CURRENCY,
      validity_until: validityUntil,
      subtotal: totals.subtotal,
      total: totals.total,
      quote_number: buildQuoteNumber(bookingNumber, []),
    })
    .select("id")
    .single()

  if (quoteError || !quote) {
    return { quoteId: null, warning: "Booking was created, but the draft quote could not be created." }
  }

  if (lineItems.length > 0) {
    const { error: lineItemsError } = await supabase.from("quote_line_items").insert(
      lineItems.map((lineItem, index) => ({
        quote_id: quote.id,
        description: lineItem.description,
        supplier_description: lineItem.supplierDescription ?? null,
        qty: lineItem.qty,
        unit_price: lineItem.unitPrice,
        total: lineItem.total,
        sort_order: index,
        // Persisted so an auto-priced quote carries the same audit trail a hand-built one does --
        // and so re-opening Build Booking can read the commission back off these lines.
        pricing_snapshot: (lineItem.pricingSnapshot ?? null) as Database["public"]["Tables"]["quote_line_items"]["Insert"]["pricing_snapshot"],
      })),
    )

    if (lineItemsError) {
      warning = "Draft quote was created, but line items could not be saved."
    }
  }

  return { quoteId: quote.id, warning }
}
