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

    return a.displayOrder - b.displayOrder
  })
}
