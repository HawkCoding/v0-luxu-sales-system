import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortByDateAndClock } from "@/lib/packages/sort-legs-by-date"

/**
 * Orders itinerary blocks the same way the booking's legs are saved (sortLegsByDate), so the
 * voucher, the itinerary and the quote PDF list same-day legs in the order Build Booking shows.
 *
 * Earlier date first; undated blocks last. Two services on the same day run in the order the
 * consultant put them in the booking builder (displayOrder = booking_services.sort_order), with
 * one exception: blocks that carry a real clock event (`clockTime` -- a flight's departure, a
 * transfer's pickup) are put in clock order among themselves, within the slots they already hold.
 * `startTime` is never compared: a hotel's is a "check in from" policy that falls back to the
 * supplier's or the app's default (see buildVoucherServiceBlocks), and sorting on it made an
 * unscheduled 15h00 check-in outrank the 18h00 transfer that delivers the guests to it.
 */
export function sortItineraryBlocksChronologically(
  blocks: VoucherServiceBlock[],
): VoucherServiceBlock[] {
  return sortByDateAndClock(blocks, (block) => ({
    date: block.serviceData.departureDate ?? null,
    time: block.clockTime ?? null,
    order: block.displayOrder,
  }))
}
