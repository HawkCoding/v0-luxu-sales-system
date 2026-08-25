import { resolveAcceptedQuoteScope, scopeLegIdsFilter } from "@/lib/quotes/accepted-quote-scope"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { loadQuoteConfigForBooking } from "@/lib/quotes/load-quote-config"

export interface ItineraryData {
  bookingNumber: string
  tripTitle: string
  tripNotes: string
  guestNames: string
  departure: string
  consultantName: string
  serviceBlocks: VoucherServiceBlock[]
}

export async function buildItineraryData(
  supabase: SupabaseClient<Database>,
  input: {
    bookingId: string
    bookingNumber: string
    tripTitle: string
    tripNotes: string
    guestNames: string
    departure: string
    consultantName: string
  },
): Promise<ItineraryData> {
  // The itinerary ships alongside the voucher, so it describes the same thing the voucher does:
  // the services on the accepted quote, not whatever is currently selected in the builder.
  const quoteScope = await resolveAcceptedQuoteScope(supabase, input.bookingId)
  const quoteConfig = await loadQuoteConfigForBooking(supabase, input.bookingId)

  const { blocks } = await buildVoucherServiceBlocks(supabase, {
    bookingId: input.bookingId,
    additionalServicesDetails: null,
    legIds: scopeLegIdsFilter(quoteScope),
    includeUnlinkedTransportRequests: false,
    inclusionFilter: { journeyClass: quoteConfig.journeyClass, rateAudience: quoteConfig.rateAudience },
  })

  return {
    bookingNumber: input.bookingNumber,
    tripTitle: input.tripTitle,
    tripNotes: input.tripNotes,
    guestNames: input.guestNames,
    departure: input.departure,
    consultantName: input.consultantName,
    serviceBlocks: blocks,
  }
}
