import type { SupabaseClient } from "@supabase/supabase-js"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type {
  InvoiceBillingParty,
  InvoiceDeparture,
  InvoiceDepartureLeg,
  InvoiceItem,
} from "@/lib/invoices/pdf/invoice-document"
import { describeInvoiceLine } from "@/lib/invoices/describe-invoice-line"
import { logError } from "@/lib/error-log"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
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
  return lineItems.map((item) => ({
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
        "id, consultant, no_of_adults, no_of_children, no_of_suites, duration_nights, customer:customers(company_name, address_line1, address_line2, city, province, country, postal_code, phone, email, vat_number), package:packages!bookings_package_id_fkey(name), route:routes(name, supplier:suppliers(name))",
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
  const bookingPackage = Array.isArray(booking?.package) ? booking.package[0] : booking?.package
  const route = Array.isArray(booking?.route) ? booking.route[0] : booking?.route
  const routeSupplier = Array.isArray(route?.supplier) ? route.supplier[0] : route?.supplier

  let items: InvoiceItem[] = []
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
    }
  }

  let departure: InvoiceDeparture | null = null
  try {
    const { blocks } = await buildVoucherServiceBlocks(supabase, {
      bookingId,
      additionalServicesDetails: null,
    })
    departure = buildDeparture(blocks, journeyHeading, {
      trainName: routeSupplier?.name ?? null,
      tourName: bookingPackage?.name ?? null,
      durationNights: booking?.duration_nights ?? null,
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

  return {
    consultant: booking?.consultant ?? null,
    guestNames,
    billing: buildBillingParty(customer),
    departure,
    items,
  }
}
