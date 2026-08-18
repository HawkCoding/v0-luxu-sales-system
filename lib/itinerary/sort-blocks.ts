import type { VoucherServiceBlock } from "@/lib/generate-voucher"

export function sortItineraryBlocksChronologically(
  blocks: VoucherServiceBlock[],
): VoucherServiceBlock[] {
  return [...blocks].sort((a, b) => {
    const dateA = a.serviceData.departureDate ?? null
    const dateB = b.serviceData.departureDate ?? null

    if (dateA && dateB && dateA !== dateB) {
      return dateA < dateB ? -1 : 1
    }
    if (dateA && !dateB) return -1
    if (!dateA && dateB) return 1

    // Two services on the same day run in the order the consultant put them in the booking builder,
    // never in clock order. The times these blocks carry are not comparable events: a transfer's
    // is the captured pickup, while a hotel's is a "check in from" policy that falls back to the
    // supplier's or the app's default (see buildVoucherServiceBlocks). Sorting them together made
    // an unscheduled 15h00 check-in outrank the 18h00 transfer that delivers the guests to it.
    // booking_services.sort_order is the sequence the salesperson already got right, so it decides.
    return a.displayOrder - b.displayOrder
  })
}
