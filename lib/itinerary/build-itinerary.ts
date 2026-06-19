import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

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
  const { blocks } = await buildVoucherServiceBlocks(supabase, {
    bookingId: input.bookingId,
    additionalServicesDetails: null,
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
