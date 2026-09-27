import type { VoucherServiceBlock, VoucherServiceType } from "@/lib/generate-voucher"
import { INVOICE_PRODUCT_LABEL } from "@/lib/invoices/departure-rows"
import { displayRouteName, sameRouteEndpoints } from "@/lib/routes/route-name"

/** The quote's "Train Journey details" box: what the booking's main product is. */
export interface QuoteJourneyDetails {
  serviceType: VoucherServiceType
  /** What `productName` names — "Train", "Hotel", "Tour Operator", … (the invoice's own labels). */
  productLabel: string
  productName: string | null
  /** The package/tour name ("Golf Safari"), or a tour's booked tour type. */
  tourName: string | null
  route: string | null
}

const JOURNEY_HEADINGS: Record<VoucherServiceType, string> = {
  train: "Train Journey details:",
  hotel: "Stay details:",
  tour: "Tour details:",
  airline: "Flight details:",
  transfer: "Travel details:",
  additional_service: "Travel details:",
}

export function quoteJourneyHeading(serviceType: VoucherServiceType | null | undefined): string {
  return serviceType ? JOURNEY_HEADINGS[serviceType] : JOURNEY_HEADINGS.train
}

/**
 * Built from the booking's primary block — the same leg the invoice's journey block describes
 * (selectPrimaryBlocks) — so the quote and the invoice name the main product identically. The
 * package name only prints when it says something the route doesn't (a route named after its own
 * endpoints would otherwise print twice).
 */
export function buildQuoteJourneyDetails(
  primaryBlock: VoucherServiceBlock | null | undefined,
  packageName: string | null | undefined,
): QuoteJourneyDetails | null {
  if (!primaryBlock) return null
  const d = primaryBlock.serviceData
  const productName = primaryBlock.contactDetails.name?.trim() || primaryBlock.title?.trim() || null
  const base = {
    serviceType: primaryBlock.serviceType,
    productLabel: INVOICE_PRODUCT_LABEL[primaryBlock.serviceType],
    productName,
  }

  switch (primaryBlock.serviceType) {
    case "train": {
      const route = displayRouteName(d.route)
      const tourName = displayRouteName(packageName)
      return { ...base, tourName: sameRouteEndpoints(tourName, route) ? null : tourName, route }
    }
    case "airline":
      return { ...base, tourName: null, route: displayRouteName(d.route) }
    case "tour":
      return { ...base, tourName: d.suiteType?.trim() || null, route: null }
    default:
      return { ...base, tourName: null, route: null }
  }
}
