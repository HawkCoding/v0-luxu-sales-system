import type { VoucherServiceBlock } from "@/lib/generate-voucher"

/**
 * Orders itinerary blocks in the order the salesperson arranged the legs in Build Booking step 1
 * (displayOrder = booking_services.sort_order), so the voucher, the itinerary and the quote PDF
 * list services exactly as the quote and invoice lines do. Dates and clock times never reorder
 * anything: the salesperson owns the order. Stable, and the input array is not mutated.
 */
export function sortItineraryBlocksByLegOrder(blocks: VoucherServiceBlock[]): VoucherServiceBlock[] {
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.displayOrder - b.block.displayOrder || a.index - b.index)
    .map(({ block }) => block)
}
