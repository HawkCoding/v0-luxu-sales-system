import type { SupabaseClient } from "@supabase/supabase-js"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { InvoiceBillingParty, InvoiceDeparture, InvoiceItem } from "@/lib/invoices/pdf/invoice-document"
import { INVOICE_PRODUCT_LABEL, invoiceRowsForBlock } from "@/lib/invoices/departure-rows"
import { resolveConsultant } from "@/lib/consultant/resolve-consultant"
import { describeInvoiceLine } from "@/lib/invoices/describe-invoice-line"
import { foldCommissionLines } from "@/lib/invoices/fold-commission-line"
import {
  INVOICE_TRANSPORT_REQUEST_COLUMNS,
  resolveTransportLinePoints,
  type InvoiceTransportRequest,
} from "@/lib/invoices/transport-line-points"
import { payingPaxSupplierId, resolvePayingPax } from "@/lib/invoices/booking-pax"
import { loadQuoteConfig } from "@/lib/quotes/load-quote-config"
import type { PerPersonLine } from "@/lib/invoices/per-person-totals"
import { logError } from "@/lib/error-log"
import { primaryProductDurationCount, primaryProductOf } from "@/lib/enquiry/primary-product"
import { nightsBetween } from "@/lib/packages/trip-date-range"
import { sameRouteEndpoints } from "@/lib/routes/route-name"
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
  /** Adults and paying children (resolvePayingPax) — the divisor of the "Total per Adult/Child" rows. */
  pax: { adults: number; children: number }
  /** The accepted quote's raw priced lines (commission unfolded), for derivePerPersonTotals. */
  pricedLines: PerPersonLine[]
}

type CustomerRow = Pick<Database["public"]["Tables"]["customers"]["Row"], "phone" | "email"> &
  Partial<
    Pick<
      Database["public"]["Tables"]["customers"]["Row"],
      "address_line1" | "address_line2" | "city" | "province" | "postal_code" | "country"
    >
  >

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

interface PostalAddress {
  line1?: string | null
  line2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  country?: string | null
}

function postalAddressLines(address: PostalAddress): string[] {
  return [
    address.line1,
    address.line2,
    [address.city, address.province].filter(Boolean).join(", "),
    address.postalCode,
    address.country,
  ]
    .map((line) => line?.trim() ?? "")
    .filter((line) => line.length > 0)
}

/**
 * The billing party is job-level, not customer-level: Company and VAT come only from
 * booking_reservation_details, with no fallback to the customer profile. The address reads the
 * booking first and falls back to the customer profile's address only when the booking has none
 * at all (client request 2026-10-07: the profile address "is not pulling through") — a booking
 * with any billing address line of its own never mixes in the customer's. Phone and e-mail still
 * read the customer.
 *
 * The postal code is part of the address, on its own line under the town/province and above the
 * country, as a South African postal address is written — not a separate "Code" field.
 */
export function buildBillingParty(
  details: BillingDetailsRow | null | undefined,
  customer: CustomerRow | null | undefined,
): InvoiceBillingParty {
  const bookingAddress = postalAddressLines({
    line1: details?.billing_address_line1,
    line2: details?.billing_address_line2,
    city: details?.billing_city,
    province: details?.billing_province,
    postalCode: details?.billing_postal_code,
    country: details?.billing_country,
  })
  const addressLines =
    bookingAddress.length > 0
      ? bookingAddress
      : postalAddressLines({
          line1: customer?.address_line1,
          line2: customer?.address_line2,
          city: customer?.city,
          province: customer?.province,
          postalCode: customer?.postal_code,
          country: customer?.country,
        })

  return {
    companyName: details?.billing_company_name ?? null,
    addressLines,
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

  // A train route's name is auto-derived from its own endpoints, so the booking-level "Tour" row
  // and the leg's "Route" row below it print the same two places with a different arrow. Only a
  // route named something other than its endpoints ("Pride of Africa") earns both rows.
  const tourName = sameRouteEndpoints(context.tourName, outbound.serviceData.route)
    ? null
    : context.tourName

  return {
    productLabel: INVOICE_PRODUCT_LABEL[outbound.serviceType],
    trainName: outbound.contactDetails.name ?? null,
    tourName,
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

/**
 * When a priced line happens: its day comes from the snapshot's travelDate (the leg's own date the
 * pricing engine priced), and its time from the one booked service block that starts that day for
 * the same supplier. Several same-day blocks from one supplier (two transfers on the 25th) are told
 * apart by the route the line priced; if that still leaves more than one, no time is printed rather
 * than a guessed one.
 */
export function invoiceItemSchedule(
  snapshot: PricingSnapshot | null,
  blocks: readonly VoucherServiceBlock[],
): Pick<InvoiceItem, "date" | "time"> {
  const date = snapshot?.travelDate?.slice(0, 10) || null
  if (!date) return { date: null, time: null }

  const sameDay = blocks.filter(
    (block) =>
      block.serviceData.departureDate?.slice(0, 10) === date &&
      (!snapshot?.supplierId || !block.supplierId || block.supplierId === snapshot.supplierId),
  )
  const byRoute =
    sameDay.length > 1 && snapshot?.routeName
      ? sameDay.filter((block) => block.serviceData.route === snapshot.routeName)
      : sameDay
  const times = new Set(byRoute.map((block) => block.serviceData.startTime ?? null).filter(Boolean))
  return { date, time: times.size === 1 ? [...times][0] : null }
}

export function buildInvoiceItems(
  lineItems: Array<
    Pick<
      Database["public"]["Tables"]["quote_line_items"]["Row"],
      "description" | "qty" | "unit_price" | "total" | "pricing_snapshot"
    >
  >,
  blocks: readonly VoucherServiceBlock[] = [],
  /** The booking's captured trips, so a transfer/rental line names its pick-up and drop-off. */
  transportRequests: readonly InvoiceTransportRequest[] = [],
): InvoiceItem[] {
  // Commission is an internal figure, never a client-facing line. Fold it into the largest
  // travel line rather than dropping it, so the printed items still sum to the subtotal.
  const folded = foldCommissionLines(lineItems)
  const snapshots = folded.map((item) => (item.pricing_snapshot as PricingSnapshot | null) ?? null)
  const transportPoints = resolveTransportLinePoints(snapshots, transportRequests)
  return folded.map((item, index) => {
    const snapshot = snapshots[index]
    return {
      pax: Number(item.qty ?? 0),
      description: describeInvoiceLine(item.description, snapshot, transportPoints[index]),
      unitPrice: Number(item.unit_price ?? 0),
      total: Number(item.total ?? 0),
      ...invoiceItemSchedule(snapshot, blocks),
    }
  })
}

export function buildPaxLabel(adults: number, children: number): string | null {
  const parts = [
    adults > 0 ? `${adults} Adult${adults === 1 ? "" : "s"}` : "",
    children > 0 ? `${children} Child${children === 1 ? "" : "ren"}` : "",
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : null
}

const STOCK_JOURNEY_HEADING = "Your Journey"

/**
 * The journey block's heading. The approved invoice template reads "YOUR TRAIN JOURNEY:" on a rail
 * booking, so the stock global wording ("Your Journey", shared with the itinerary) gains "Train"
 * there; any heading an admin has typed — globally or per supplier kind — prints exactly as typed.
 */
export function invoiceJourneyHeading(setting: string | null | undefined, primarySupplierKind: SupplierKind | null): string {
  const heading = setting?.trim() || STOCK_JOURNEY_HEADING
  return heading === STOCK_JOURNEY_HEADING && primarySupplierKind === "train_operator" ? "Your Train Journey" : heading
}

/**
 * The booking's captured trips, read only when the quote priced a transfer or rental. A failed read
 * degrades to none — the lines then name the route, as they did before trips were read here.
 */
async function loadInvoiceTransportRequests(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  lineItems: Parameters<typeof buildInvoiceItems>[0],
): Promise<InvoiceTransportRequest[]> {
  const pricesTransport = lineItems.some((item) => {
    const serviceType = (item.pricing_snapshot as PricingSnapshot | null)?.serviceType
    return serviceType === "transfer" || serviceType === "rental"
  })
  if (!pricesTransport) return []

  const { data, error } = await supabase
    .from("booking_transport_requests")
    .select(INVOICE_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true })

  if (error) {
    void logError({
      severity: "Warning",
      source: "invoice-pdf",
      message: "Invoice transfer pick-up/drop-off points could not be loaded",
      details: { bookingId, error: error.message },
    })
    return []
  }
  return data ?? []
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
  const [{ data: booking, error: bookingError }, { data: travellers }, { data: billingDetails }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, consultant, assigned_salesperson_id, no_of_adults, no_of_children, child_ages, no_of_suites, duration_nights, trip_start_date, trip_end_date, primary_supplier_id, customer:customers(phone, email, address_line1, address_line2, city, province, postal_code, country), route:routes(name)",
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

  if (bookingError) {
    void logError({
      severity: "Warning",
      source: "invoice-pdf",
      message: "Invoice booking details could not be loaded",
      details: { bookingId, error: bookingError.message },
    })
  }

  const customer = Array.isArray(booking?.customer) ? booking.customer[0] : booking?.customer
  const route = Array.isArray(booking?.route) ? booking.route[0] : booking?.route

  let lineItemRows: Parameters<typeof buildInvoiceItems>[0] = []
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
      lineItemRows = lineItems ?? []
      const legIds = legIdsFromLineItems(lineItems)
      quoteLegIds = legIds.size > 0 ? legIds : undefined
    }
  }

  let departure: InvoiceDeparture | null = null
  // Also dates the description table's lines (their clock time is the booked leg's own).
  let blocks: VoucherServiceBlock[] = []
  try {
    blocks = (
      await buildVoucherServiceBlocks(supabase, {
        bookingId,
        additionalServicesDetails: null,
        legIds: quoteLegIds,
        includeUnlinkedTransportRequests: false,
      })
    ).blocks
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

  const items = buildInvoiceItems(
    lineItemRows,
    blocks,
    await loadInvoiceTransportRequests(supabase, bookingId, lineItemRows),
  )

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

  // Infants and over-age children projected out, bucketed by the same supplier the quote PDF uses
  // (the quote's resolved primary supplier, else the booking's) so both divide by the same people.
  let quotePrimarySupplierId: string | null = null
  if (lineItemRows.length > 0) {
    try {
      const quoteConfig = await loadQuoteConfig(supabase, {
        lineItems: lineItemRows.map((row) => ({ pricingSnapshot: row.pricing_snapshot as PricingSnapshot | null })),
        bookingPrimarySupplierId: booking?.primary_supplier_id ?? null,
      })
      quotePrimarySupplierId = quoteConfig.primarySupplierId
    } catch (err) {
      void logError({
        severity: "Warning",
        source: "invoice-pdf",
        message: "Invoice quote primary supplier could not be resolved",
        details: { bookingId, quoteId, error: err instanceof Error ? err.message : String(err) },
      })
    }
  }
  const pax = await resolvePayingPax(
    supabase,
    booking,
    payingPaxSupplierId(quotePrimarySupplierId, booking?.primary_supplier_id),
  )

  return {
    consultant: resolvedConsultant?.key ?? null,
    guestNames,
    billing: buildBillingParty(billingDetails, customer),
    departure,
    items,
    pax,
    pricedLines: lineItemRows,
  }
}
