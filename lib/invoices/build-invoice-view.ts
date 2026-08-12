import type { SupabaseClient } from "@supabase/supabase-js"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type {
  InvoiceBillingParty,
  InvoiceDeparture,
  InvoiceDepartureLeg,
  InvoiceItem,
} from "@/lib/invoices/pdf/invoice-document"
import { resolveConsultant } from "@/lib/consultant/resolve-consultant"
import { describeInvoiceLine } from "@/lib/invoices/describe-invoice-line"
import { foldCommissionLines } from "@/lib/invoices/fold-commission-line"
import { logError } from "@/lib/error-log"
import { nightsBetween } from "@/lib/packages/trip-date-range"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import { legIdsFromLineItems } from "@/lib/quotes/accepted-quote-scope"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"

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

type CustomerRow = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  | "company_name"
  | "address_line1"
  | "address_line2"
  | "city"
  | "province"
  | "country"
  | "postal_code"
  | "phone"
  | "email"
  | "vat_number"
>

export function buildBillingParty(customer: CustomerRow | null | undefined): InvoiceBillingParty {
  const addressLines = [
    customer?.address_line1,
    customer?.address_line2,
    [customer?.city, customer?.province].filter(Boolean).join(", "),
    customer?.country,
  ]
    .map((line) => line?.trim() ?? "")
    .filter((line) => line.length > 0)

  return {
    companyName: customer?.company_name ?? null,
    addressLines,
    postalCode: customer?.postal_code ?? null,
    phone: customer?.phone ?? null,
    email: customer?.email ?? null,
    vatNumber: customer?.vat_number ?? null,
  }
}

function toLeg(block: VoucherServiceBlock): InvoiceDepartureLeg {
  const data = block.serviceData
  return {
    route: data.route ?? null,
    departureDate: data.departureDate ?? null,
    departureTime: data.startTime ?? null,
    arrivalDate: data.arrivalDate ?? null,
    arrivalTime: data.endTime ?? null,
    suite: data.suiteType ?? null,
  }
}

export interface DepartureContext {
  /** Train / product name, e.g. "The Blue Train" (route supplier). */
  trainName: string | null
  /** Package name, e.g. "Pretoria Journey". */
  tourName: string | null
  durationNights: number | null
  suites: number
  adults: number
  children: number
}

/** "2 Nights / 3 Days" from the booking's duration. */
export function buildDaysLabel(durationNights: number | null): string | null {
  if (!durationNights || durationNights <= 0) return null
  return `${durationNights} Night${durationNights === 1 ? "" : "s"} / ${durationNights + 1} Days`
}

/**
 * The invoice's "Days" figure. `bookings.duration_nights` is never written by the app (only
 * `packages.duration_nights` is), so it can't be trusted as the primary source — prefer the
 * trip's actual date span, which `recompute-trip-dates.ts` keeps current across every dated
 * service (train, hotel, transfers), then the train route's own duration, then the legacy column.
 */
export function resolveDurationNights(
  booking: { trip_start_date?: string | null; trip_end_date?: string | null; duration_nights?: number | null } | null | undefined,
  blocks: VoucherServiceBlock[],
): number | null {
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
 * The journey shown on the invoice is the train travel. A second train block
 * means a return leg, rendered as its own journey block.
 */
export function buildDeparture(
  blocks: VoucherServiceBlock[],
  heading: string,
  context: DepartureContext,
): InvoiceDeparture | null {
  const trainBlocks = blocks
    .filter((block) => block.serviceType === "train")
    .sort((a, b) => a.displayOrder - b.displayOrder)

  const [outbound, returnLeg] = trainBlocks
  if (!outbound) return null

  // The units actually configured on the outbound leg are the authoritative suite count;
  // no_of_suites is an enquiry-time scalar that drifts once the package is configured in detail.
  const resolvedSuites = outbound.serviceData.numberOfSuites ?? context.suites

  return {
    heading,
    trainName: context.trainName,
    tourName: context.tourName,
    daysLabel: buildDaysLabel(context.durationNights),
    qty: resolvedSuites > 0 ? String(resolvedSuites) : null,
    adults: String(context.adults),
    children: String(context.children),
    outbound: toLeg(outbound),
    returnLeg: returnLeg ? toLeg(returnLeg) : null,
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
}

/**
 * Loads everything the invoice PDF describes. Individual sections degrade to
 * empty rather than throwing: an invoice must still render (and be sent) when
 * the itinerary or a line-item read fails.
 */
export async function buildInvoiceView(
  supabase: SupabaseClient<Database>,
  { bookingId, quoteId, journeyHeading }: BuildInvoiceViewOptions,
): Promise<InvoiceView> {
  const [{ data: booking }, { data: travellers }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, consultant, assigned_salesperson_id, no_of_adults, no_of_children, no_of_suites, duration_nights, trip_start_date, trip_end_date, customer:customers(company_name, address_line1, address_line2, city, province, country, postal_code, phone, email, vat_number), route:routes(name, supplier:suppliers(name))",
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("travellers")
      .select("prefix, first_name, last_name, sort_order")
      .eq("booking_id", bookingId)
      .order("sort_order"),
  ])

  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer
  const route = Array.isArray(booking?.route) ? booking.route[0] : booking?.route
  const routeSupplier = Array.isArray(route?.supplier) ? route.supplier[0] : route?.supplier

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
    departure = buildDeparture(blocks, journeyHeading, {
      trainName: routeSupplier?.name ?? null,
      tourName: route?.name ?? null,
      durationNights: resolveDurationNights(booking, blocks),
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
    billing: buildBillingParty(customer),
    departure,
    items,
  }
}
