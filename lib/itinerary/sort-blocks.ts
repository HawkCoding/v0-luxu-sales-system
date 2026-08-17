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

    // Two services on the same day run in clock order, not in the order the consultant happened to
    // add them — an outbound flight at 10h00 and its connecting transfer at 12h15 read as a
    // sequence. Only a captured time counts; an untimed block keeps its builder position.
    const timeA = a.serviceData.startTime?.trim() || null
    const timeB = b.serviceData.startTime?.trim() || null
    if (timeA && timeB && timeA !== timeB) return timeA < timeB ? -1 : 1

    return a.displayOrder - b.displayOrder
  })
}
