import type { SupabaseClient } from "@supabase/supabase-js"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { InvoiceBillingParty, InvoiceDeparture, InvoiceItem } from "@/lib/invoices/pdf/invoice-document"
import { INVOICE_PRODUCT_LABEL, invoiceRowsForBlock } from "@/lib/invoices/departure-rows"
import { resolveConsultant } from "@/lib/consultant/resolve-consultant"
import { describeInvoiceLine } from "@/lib/invoices/describe-invoice-line"
import { foldCommissionLines } from "@/lib/invoices/fold-commission-line"
import { logError } from "@/lib/error-log"
import { primaryProductDurationCount, primaryProductOf } from "@/lib/enquiry/primary-product"
import { nightsBetween } from "@/lib/packages/trip-date-range"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot, SupplierKind } from "@/lib/types"
import { legIdsFromLineItems } from "@/lib/quotes/accepted-quote-scope"
import { buildVoucherServiceBlocks, mapSupplierKindToServiceType } from "@/lib/voucher/build-service-blocks"

/**
 * Assembles the descriptive half of an invoice — who is billed, what they are
 * travelling on, and the priced lines. The money ladder is built by the caller,
 * because deposit and final invoices ask different questions of the balance.
 */
export interface InvoiceView {
  consultant: string | null
  /** Traveller names from the reservation form, printed as Guest 1 / Guest 2. */
  guestNames: string[]
  billing: InvoiceBillingParty
  departure: InvoiceDeparture | null
  items: InvoiceItem[]
}

type CustomerRow = Pick<Database["public"]["Tables"]["customers"]["Row"], "phone" | "email">

type BillingDetailsRow = Pick<
  Database["public"]["Tables"]["booking_reservation_details"]["Row"],
  | "billing_company_name"
  | "billing_vat_number"
  | "billing_address_line1"
  | "billing_address_line2"
  | "billing_city"
  | "billing_province"
  | "billing_postal_code"
  | "billing_country"
>

/**
 * The billing party is job-level, not customer-level: Company, VAT and address
 * come only from booking_reservation_details, with no fallback to the customer
 * profile. Phone and e-mail are the exception and still read the customer.
 */
export function buildBillingParty(
  details: BillingDetailsRow | null | undefined,
  customer: CustomerRow | null | undefined,
): InvoiceBillingParty {
  const addressLines = [
    details?.billing_address_line1,
    details?.billing_address_line2,
    [details?.billing_city, details?.billing_province].filter(Boolean).join(", "),
    details?.billing_country,
  ]
    .map((line) => line?.trim() ?? "")
    .filter((line) => line.length > 0)

  return {
    companyName: details?.billing_company_name ?? null,
    addressLines,
    postalCode: details?.billing_postal_code ?? null,
    phone: customer?.phone ?? null,
    email: customer?.email ?? null,
    vatNumber: details?.billing_vat_number ?? null,
  }
}

export interface DepartureContext {
  /** Package/tour name from the booking's route, e.g. "Pretoria Journey" — bookings.route_id is
   *  only ever set for a journey kind, so this is null on a tour or stay. */
  tourName: string | null
  durationNights: number | null
  /** What the primary product's own vocabulary counts durationNights in — feeds buildDaysLabel. */
  durationUnit: "nights" | "days" | null
  suites: number
  adults: number
  children: number
}

/**
 * "2 Nights / 3 Days" for a kind that counts nights (unset/"nights"); "4 Days" for one that
 * counts days ("days" -- the stored interval is nights, but the kind's own word for it counts both
 * end days, see primaryProductDurationCount). The `durationUnit` default keeps every call site
 * written before a booking could be headed by something other than a train unchanged.
 */
export function buildDaysLabel(
  durationNights: number | null,
  durationUnit: "nights" | "days" | null = null,
): string | null {
  if (!durationNights || durationNights <= 0) return null
  if (durationUnit === "days") {
    const days = primaryProductDurationCount(durationNights, "days")
    return `${days} Day${days === 1 ? "" : "s"}`
  }
  return `${durationNights} Night${durationNights === 1 ? "" : "s"} / ${durationNights + 1} Days`
}

/**
 * The invoice's "Days" figure. `bookings.duration_nights` is never written by the app (only
 * `packages.duration_nights` is), so it can't be trusted as the primary source. Prefers, in order:
 * the primary leg's own span (its captured departure/arrival dates -- the product's own length,
 * not the whole trip's), then the trip's actual date span (which spans every dated leg and so
 * over-counts once an ancillary transfer or hotel is added -- see recompute-trip-dates.ts), then
 * the train route's own duration, then the legacy column.
 */
export function resolveDurationNights(
  booking: { trip_start_date?: string | null; trip_end_date?: string | null; duration_nights?: number | null } | null | undefined,
  blocks: VoucherServiceBlock[],
  primaryBlock?: VoucherServiceBlock | null,
): number | null {
  if (primaryBlock) {
    const fromPrimaryLeg = nightsBetween(
      primaryBlock.serviceData.departureDate ?? null,
      primaryBlock.serviceData.arrivalDate ?? null,
    )
    if (fromPrimaryLeg !== null && fromPrimaryLeg > 0) return fromPrimaryLeg
  }

  const fromTripRange = nightsBetween(booking?.trip_start_date ?? null, booking?.trip_end_date ?? null)
  if (fromTripRange !== null && fromTripRange > 0) return fromTripRange

  const outboundTrain = blocks
    .filter((block) => block.serviceType === "train")
    .sort((a, b) => a.displayOrder - b.displayOrder)[0]
  const routeDurationDays = outboundTrain?.serviceData.durationDays ?? null
  if (routeDurationDays !== null && routeDurationDays > 1) return routeDurationDays - 1

  return booking?.duration_nights ?? null
}

/**
 * The blocks that describe the booking's PRIMARY PRODUCT — the leg supplied by
 * bookings.primary_supplier_id — not "whichever train block exists" (F-P3-2: a tour booking with
 * a Blue Train add-on used to print the add-on as the thing being sold; a stay- or tour-headed
 * booking with no train printed nothing at all).
 *
 * Falls back in order: the primary supplier's own block(s) -> any block of the primary kind's
 * service type -> the earliest priced service block -> empty. A ladder, not a single rule, so an
 * older booking with no primary_supplier_id recorded (or one whose primary leg somehow isn't
 * dated/priced) still renders something rather than nothing.
 */
export function selectPrimaryBlocks(
  blocks: VoucherServiceBlock[],
  primarySupplierId: string | null,
  primarySupplierKind: SupplierKind | null,
): VoucherServiceBlock[] {
  const sorted = [...blocks].sort((a, b) => a.displayOrder - b.displayOrder)

  if (primarySupplierId) {
    const own = sorted.filter((block) => block.supplierId === primarySupplierId)
    if (own.length > 0) return own
  }

  if (primarySupplierKind) {
    const kindServiceType = mapSupplierKindToServiceType(primarySupplierKind)
    const kindMatch = sorted.filter((block) => block.serviceType === kindServiceType)
    if (kindMatch.length > 0) return kindMatch
  }

  const earliest = sorted.find((block) => block.serviceType !== "additional_service")
  return earliest ? [earliest] : []
}

/**
 * The journey block for the booking's primary product. A second block of the same kind (a round
 * trip) renders as its own "Return Journey" section; every other kind has exactly one block.
 */
export function buildDeparture(
  primaryBlocks: VoucherServiceBlock[],
  heading: string,
  context: DepartureContext,
): InvoiceDeparture | null {
  const [outbound, returnLeg] = primaryBlocks
  if (!outbound) return null

  // The units actually configured on the outbound leg are the authoritative suite count;
  // no_of_suites is an enquiry-time scalar that drifts once the package is configured in detail.
  const resolvedSuites = outbound.serviceData.numberOfSuites ?? context.suites

  return {
    productLabel: INVOICE_PRODUCT_LABEL[outbound.serviceType],
    trainName: outbound.contactDetails.name ?? null,
    tourName: context.tourName,
    daysLabel: buildDaysLabel(context.durationNights, context.durationUnit),
    qty: resolvedSuites > 0 ? String(resolvedSuites) : null,
    adults: String(context.adults),
    children: String(context.children),
    legs: [
      { heading, rows: invoiceRowsForBlock(outbound) },
      ...(returnLeg ? [{ heading: "Return Journey", rows: invoiceRowsForBlock(returnLeg) }] : []),
    ],
  }
}

export function buildInvoiceItems(
  lineItems: Array<
    Pick<
      Database["public"]["Tables"]["quote_line_items"]["Row"],
      "description" | "qty" | "unit_price" | "total" | "pricing_snapshot"
    >
  >,
): InvoiceItem[] {
  // Commission is an internal figure, never a client-facing line. Fold it into the largest
  // travel line rather than dropping it, so the printed items still sum to the subtotal.
  return foldCommissionLines(lineItems).map((item) => ({
    pax: Number(item.qty ?? 0),
    description: describeInvoiceLine(
      item.description,
      (item.pricing_snapshot as PricingSnapshot | null) ?? null,
    ),
    unitPrice: Number(item.unit_price ?? 0),
    total: Number(item.total ?? 0),
  }))
}

export function buildPaxLabel(adults: number, children: number): string | null {
  const parts = [
    adults > 0 ? `${adults} Adult${adults === 1 ? "" : "s"}` : "",
    children > 0 ? `${children} Child${children === 1 ? "" : "ren"}` : "",
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : null
}

export interface BuildInvoiceViewOptions {
  bookingId: string
  quoteId: string | null
  journeyHeading: string
  /** The booking's primary product — already resolved by the caller (ensure-invoice-pdf.ts also
   *  uses it for per-kind document copy/brand), so no second lookup happens here. */
  primarySupplierKind: SupplierKind | null
}

/**
 * Loads everything the invoice PDF describes. Individual sections degrade to
 * empty rather than throwing: an invoice must still render (and be sent) when
 * the itinerary or a line-item read fails.
 */
export async function buildInvoiceView(
  supabase: SupabaseClient<Database>,
  { bookingId, quoteId, journeyHeading, primarySupplierKind }: BuildInvoiceViewOptions,
): Promise<InvoiceView> {
  const [{ data: booking }, { data: travellers }, { data: billingDetails }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, consultant, assigned_salesperson_id, no_of_adults, no_of_children, no_of_suites, duration_nights, trip_start_date, trip_end_date, primary_supplier_id, customer:customers(phone, email), route:routes(name)",
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("travellers")
      .select("prefix, first_name, last_name, sort_order")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("booking_reservation_details")
      .select(
        "billing_company_name, billing_vat_number, billing_address_line1, billing_address_line2, billing_city, billing_province, billing_postal_code, billing_country",
      )
      .eq("booking_id", bookingId)
      .maybeSingle(),
  ])

  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer
  const route = Array.isArray(booking?.route) ? booking.route[0] : booking?.route

  let items: InvoiceItem[] = []
  // The invoice's quote is the accepted one, so its priced legs also scope the departure block
  // below — no second lookup needed. Empty means a manual quote, which stays unfiltered.
  let quoteLegIds: Set<string> | undefined
  if (quoteId) {
    const { data: lineItems, error } = await supabase
      .from("quote_line_items")
      .select("description, qty, unit_price, total, pricing_snapshot, sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true })

    if (error) {
      void logError({
        severity: "Warning",
        source: "invoice-pdf",
        message: "Invoice line items could not be loaded",
        details: { bookingId, quoteId, error: error.message },
      })
    } else {
      items = buildInvoiceItems(lineItems ?? [])
      const legIds = legIdsFromLineItems(lineItems)
      quoteLegIds = legIds.size > 0 ? legIds : undefined
    }
  }

  let departure: InvoiceDeparture | null = null
  try {
    const { blocks } = await buildVoucherServiceBlocks(supabase, {
      bookingId,
      additionalServicesDetails: null,
      legIds: quoteLegIds,
      includeUnlinkedTransportRequests: false,
    })
    const primaryBlocks = selectPrimaryBlocks(blocks, booking?.primary_supplier_id ?? null, primarySupplierKind)
    departure = buildDeparture(primaryBlocks, journeyHeading, {
      tourName: route?.name ?? null,
      durationNights: resolveDurationNights(booking, blocks, primaryBlocks[0] ?? null),
      durationUnit: primaryProductOf(primarySupplierKind).durationUnit,
      suites: booking?.no_of_suites ?? 0,
      adults: booking?.no_of_adults ?? 0,
      children: booking?.no_of_children ?? 0,
    })
  } catch (err) {
    void logError({
      severity: "Warning",
      source: "invoice-pdf",
      message: "Invoice departure information could not be loaded",
      details: { bookingId, error: err instanceof Error ? err.message : String(err) },
    })
  }

  const guestNames = (travellers ?? [])
    .map((traveller) =>
      [traveller.prefix, traveller.first_name, traveller.last_name].filter(Boolean).join(" ").trim(),
    )
    .filter(Boolean)

  const resolvedConsultant = booking
    ? await resolveConsultant(supabase, {
        consultant: booking.consultant,
        assigned_salesperson_id: booking.assigned_salesperson_id,
      })
    : null

  return {
    consultant: resolvedConsultant?.key ?? null,
    guestNames,
    billing: buildBillingParty(billingDetails, customer),
    departure,
    items,
  }
}
