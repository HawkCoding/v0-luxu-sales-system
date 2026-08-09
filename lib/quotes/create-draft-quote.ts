import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildPackageQuoteLineItems, calculateQuoteTotals } from "@/lib/quotes/build-from-package"
import { isMissingPricing } from "@/lib/quotes/pricing-engine"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import { bookingServicesToLegSelections, loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import { getDefaultCommission } from "@/lib/pricing/default-commission"

type ServiceClient = SupabaseClient<Database>

/**
 * The rate types the auto-quote prices against -- the same precedence the Build Booking dialog
 * applies, so an auto-priced quote and a hand-built one agree.
 *
 * `rateTypeId` deliberately stays null when the customer has no default of their own: collapsing it
 * onto the system default here would shadow each leg's supplier default, which selectRateCard slots
 * in between the two.
 */
async function resolveRateTypes(supabase: ServiceClient, bookingId: string) {
  const [{ data: rateTypeRows }, { data: booking }] = await Promise.all([
    supabase.from("rate_types").select("id, code, name, is_default").is("archived_at", null),
    supabase.from("bookings").select("customers(default_rate_type_id)").eq("id", bookingId).maybeSingle(),
  ])

  const rateTypes = (rateTypeRows ?? []).map(({ id, code, name }) => ({ id, code, name }))
  const fallbackRateTypeId = (rateTypeRows ?? []).find((rt) => rt.is_default)?.id ?? null
  const customer = Array.isArray(booking?.customers) ? booking?.customers[0] : booking?.customers
  const rateTypeId = customer?.default_rate_type_id ?? null

  return { rateTypes, fallbackRateTypeId, rateTypeId }
}

function addDaysToDateString(value: string, days: number): string {
  const [year = "1970", month = "1", day = "1"] = value.split("-")
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getDefaultQuoteValidityDate(): string {
  return addDaysToDateString(new Date().toISOString().slice(0, 10), 14)
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
      const { rateTypes, fallbackRateTypeId, rateTypeId } = await resolveRateTypes(supabase, bookingId)

      const built = await buildPackageQuoteLineItems({
        supabase,
        packageDetail: detail,
        jobId: bookingId,
        travelDate: travelDate ?? new Date().toISOString().slice(0, 10),
        selections,
        rateTypeId,
        fallbackRateTypeId,
        rateTypes,
      })
      lineItems = built.lineItems
      // A flight leg with no fare typed in yet still counts as "not fully priced" -- same bar as
      // having zero lines at all.
      status =
        lineItems.length > 0 && !lineItems.some(isMissingPricing) ? "draft" : "pricing_incomplete"
    } catch (error) {
      warning = error instanceof Error ? error.message : "Services were built, but pricing could not be pre-filled."
    }
  }

  const totals = calculateQuoteTotals(lineItems)
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      status,
      validity_until: getDefaultQuoteValidityDate(),
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
