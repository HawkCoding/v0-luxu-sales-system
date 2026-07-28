import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildPackageQuoteLineItems, calculateQuoteTotals } from "@/lib/quotes/build-from-package"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import { bookingServicesToLegSelections, loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"

type ServiceClient = SupabaseClient<Database>

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
      const built = await buildPackageQuoteLineItems({
        supabase,
        packageDetail: detail,
        jobId: bookingId,
        travelDate: travelDate ?? new Date().toISOString().slice(0, 10),
        selections: bookingServicesToLegSelections(services, units),
      })
      lineItems = built.lineItems
      status = lineItems.length > 0 ? "draft" : "pricing_incomplete"
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
        qty: lineItem.qty,
        unit_price: lineItem.unitPrice,
        total: lineItem.total,
        sort_order: index,
      })),
    )

    if (lineItemsError) {
      warning = "Draft quote was created, but line items could not be saved."
    }
  }

  return { quoteId: quote.id, warning }
}
