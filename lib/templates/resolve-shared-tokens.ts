// Resolves every email token from current booking state, so any token works
// in any template — not just the ones its own send path originally computed.
// Values that genuinely don't exist yet at this pipeline stage (no quote, no
// invoice, no voucher) render as PLACEHOLDER rather than staying literally
// unreplaced. Callers spread `tokens`/`blocks` first, then layer their own
// already-precise values on top so nothing regresses to a generic guess where
// the route already knows the exact answer.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { firstRecord } from "@/lib/utils"
import { resolveBookingSupplierName } from "@/lib/quotes/resolve-supplier-name"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { buildUnifiedTotals } from "@/lib/invoices/build-unified-totals"
import { clientInvoiceNumber } from "@/lib/invoices/invoice-status"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { buildGuestInfoBlock } from "@/lib/templates/guest-info-block"
import { buildSuiteTokens } from "@/lib/templates/suite-description"
import { loadSuiteSelections } from "@/lib/templates/suite-selections"
import { buildQuoteSummaryBlock, formatMoney } from "@/lib/quotes/quote-summary-block"
import { deriveJourneyFromBlocks } from "@/lib/quotes/quote-presentation"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"
import { getBankingSettings, getDocumentTextSettings } from "@/lib/settings-access"

const PLACEHOLDER = "—"

export interface SharedEmailTokens {
  tokens: Record<string, string>
  blocks: Record<string, string>
}

function orPlaceholder(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : PLACEHOLDER
}

function latestByCreatedAt<T extends { created_at: string | null }>(rows: T[] | null): T | null {
  return (rows ?? []).slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null
}

/** Invoice amounts carry their own currency, unlike the always-ZAR quote total. */
function formatCurrency(amount: number, currency = "ZAR"): string {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/**
 * This resolver is best-effort enrichment layered under the route's own
 * precise tokens, never the reason a send fails — a missing/errored table
 * (or a table an older test double doesn't know about yet) degrades that one
 * value to PLACEHOLDER rather than throwing. `build` is deferred so a
 * synchronous throw from `.from(...)` itself is caught too, not just a
 * rejected query.
 */
async function safeQuery<T>(build: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data } = await build()
    return data ?? null
  } catch {
    return null
  }
}

async function safely<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch {
    return fallback
  }
}

interface BookingRow {
  id: string
  booking_number: string
  customer_invoice_number: string | null
  consultant: string | null
  departure_date: string | null
  trip_end_date: string | null
  no_of_adults: number | null
  no_of_children: number | null
  route_reversed: boolean | null
  customer: { title: string | null; first_name: string | null; last_name: string | null; email: string | null } | { title: string | null; first_name: string | null; last_name: string | null; email: string | null }[] | null
  route:
    | {
        name: string | null
        direction_mode: string | null
        origin: { name: string | null } | { name: string | null }[] | null
        destination: { name: string | null } | { name: string | null }[] | null
      }
    | {
        name: string | null
        direction_mode: string | null
        origin: { name: string | null } | { name: string | null }[] | null
        destination: { name: string | null } | { name: string | null }[] | null
      }[]
    | null
}

interface QuoteRow {
  id: string
  quote_number: string | null
  validity_until: string | null
  total: number | null
  created_at: string | null
}

interface InvoiceRow {
  kind: string | null
  amount: number
  currency: string
  due_date: string | null
  deposit_percentage: number | null
  created_at: string | null
}

interface VoucherRow {
  voucher_number: string
  created_at: string | null
}

interface CorrespondenceRow {
  kind: string | null
  sent_at: string | null
}

interface TravellerRow {
  prefix: string | null
  first_name: string
  last_name: string
  id_passport: string | null
  is_child: boolean
  sort_order: number | null
}

export async function resolveSharedEmailTokens(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<SharedEmailTokens> {
  const [booking, quotes, invoices, vouchers, correspondences, travellers, suiteSelections, bankingSettings, supplierName] =
    await Promise.all([
      safeQuery<BookingRow>(() =>
        supabase
          .from("bookings")
          .select(
            "id, booking_number, customer_invoice_number, consultant, departure_date, trip_end_date, no_of_adults, no_of_children, route_reversed, customer:customers(title, first_name, last_name, email), route:routes(name, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name))",
          )
          .eq("id", bookingId)
          .maybeSingle(),
      ),
      safeQuery<QuoteRow[]>(() =>
        supabase.from("quotes").select("id, quote_number, validity_until, total, created_at").eq("booking_id", bookingId),
      ),
      safeQuery<InvoiceRow[]>(() =>
        supabase
          .from("invoices")
          .select("kind, amount, currency, due_date, deposit_percentage, created_at")
          .eq("booking_id", bookingId),
      ),
      safeQuery<VoucherRow[]>(() => supabase.from("vouchers").select("voucher_number, created_at").eq("booking_id", bookingId)),
      safeQuery<CorrespondenceRow[]>(() => supabase.from("correspondences").select("kind, sent_at").eq("booking_id", bookingId)),
      safeQuery<TravellerRow[]>(() =>
        supabase
          .from("travellers")
          .select("prefix, first_name, last_name, id_passport, is_child, sort_order")
          .eq("booking_id", bookingId),
      ),
      safely(() => loadSuiteSelections(supabase, bookingId), []),
      safely(() => getBankingSettings(supabase), {} as Awaited<ReturnType<typeof getBankingSettings>>),
      safely(() => resolveBookingSupplierName(supabase, bookingId), "Supplier"),
    ])

  const customer = firstRecord(booking?.customer)
  const route = firstRecord(booking?.route)
  const origin = firstRecord(route?.origin)
  const destination = firstRecord(route?.destination)
  const direction =
    route && origin?.name && destination?.name
      ? resolveDirectedRouteName(origin.name, destination.name, booking?.route_reversed ?? false)
      : null
  const departureDate = formatDisplayDateLong(booking?.departure_date ?? null)

  const guestTravellers = (travellers ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const guests = guestTravellers
    .filter((t) => !t.is_child)
    .map((t) => ({
      name: [t.prefix, t.first_name, t.last_name].filter(Boolean).join(" "),
      idNumber: t.id_passport,
    }))
    .filter((guest) => guest.name.length > 0)

  const guestInfo = buildGuestInfoBlock({
    customerName: formatCustomerSalutation(customer) || "the traveller",
    customerEmail: customer?.email ?? null,
    guests,
    adults: booking?.no_of_adults ?? 0,
    children: booking?.no_of_children ?? 0,
  })

  const suiteTokens = buildSuiteTokens(suiteSelections)

  const lastQuoteSentAt = latestByCreatedAt(
    (correspondences ?? [])
      .filter((c) => c.kind === "quote" && c.sent_at)
      .map((c) => ({ ...c, created_at: c.sent_at })),
  )

  const latestQuote = latestByCreatedAt(quotes)
  const latestInvoice = latestByCreatedAt(invoices)
  const latestDepositInvoice = (invoices ?? [])
    .filter((inv) => inv.kind === "deposit")
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]
  const latestVoucher = latestByCreatedAt(vouchers)

  let quoteSummaryTable = PLACEHOLDER
  if (latestQuote) {
    try {
      const { data: lineItems } = await supabase
        .from("quote_line_items")
        .select("pricing_snapshot")
        .eq("quote_id", latestQuote.id)

      const legIds = new Set(
        (lineItems ?? [])
          .map((li) => (li.pricing_snapshot as PricingSnapshot | null)?.legId)
          .filter((legId): legId is string => Boolean(legId)),
      )

      const { blocks: itineraryBlocks } = await buildVoucherServiceBlocks(supabase, {
        bookingId,
        additionalServicesDetails: null,
        legIds: legIds.size > 0 ? legIds : undefined,
      })

      const journey = deriveJourneyFromBlocks(itineraryBlocks) ?? { start: null, end: null }
      const documentText = await getDocumentTextSettings(supabase)

      quoteSummaryTable = buildQuoteSummaryBlock({
        quoteNumber: latestQuote.quote_number ?? "",
        quoteDate: latestQuote.created_at?.slice(0, 10) ?? "",
        validUntil: latestQuote.validity_until,
        journeyStart: journey.start,
        journeyEnd: journey.end,
        adults: booking?.no_of_adults ?? 0,
        children: booking?.no_of_children ?? 0,
        total: latestQuote.total ?? 0,
        itineraryBlocks,
        packageIncludesHeading: documentText.quote_doc_includes_heading,
        packageExcludesHeading: documentText.quote_doc_excludes_heading,
        packageExcludesDefault: documentText.quote_doc_excludes_default,
      })
    } catch {
      quoteSummaryTable = PLACEHOLDER
    }
  }

  let receivedAmount = PLACEHOLDER
  let outstandingAmount = PLACEHOLDER
  let finalAmount = PLACEHOLDER
  let finalDueDate = PLACEHOLDER
  try {
    const balance = await calculateInvoiceBalance(supabase, bookingId)
    const totals = buildUnifiedTotals({
      balance,
      departureDate: booking?.departure_date ?? null,
      depositPercentage: latestDepositInvoice?.deposit_percentage ?? null,
      depositAmount: latestDepositInvoice?.amount ?? null,
    })
    receivedAmount = formatMoney(totals.amountReceived)
    outstandingAmount = formatMoney(totals.outstanding)
    finalAmount = formatMoney(totals.finalAmount)
    finalDueDate = totals.finalDueDate ? formatDisplayDateLong(totals.finalDueDate) : "Now"
  } catch {
    // No accepted quote yet — leave the payment-ladder tokens as placeholders.
  }

  let daysOverdue = PLACEHOLDER
  if (latestInvoice?.due_date) {
    const due = new Date(`${latestInvoice.due_date}T00:00:00Z`)
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z")
    const diffDays = Math.floor((today.getTime() - due.getTime()) / 86_400_000)
    if (diffDays > 0) daysOverdue = String(diffDays)
  }

  const tokens: Record<string, string> = {
    customerName: orPlaceholder(formatCustomerSalutation(customer)),
    clientSurname: orPlaceholder(customer?.last_name),
    jobNumber: orPlaceholder(booking?.booking_number),
    consultantName: orPlaceholder(booking?.consultant),
    supplierName: orPlaceholder(supplierName),
    direction: orPlaceholder(direction),
    routeName: orPlaceholder(direction),
    departureDate: orPlaceholder(departureDate),
    departureDateShort: orPlaceholder(departureDate),
    tripEndDate: orPlaceholder(formatDisplayDateLong(booking?.trip_end_date ?? null)),
    tripTitle: PLACEHOLDER,
    suiteType: orPlaceholder(suiteTokens.suiteType),
    suiteConfiguration: orPlaceholder(suiteTokens.suiteConfiguration),
    suiteDescription: orPlaceholder(suiteTokens.suiteDescription),
    quoteNumber: orPlaceholder(latestQuote?.quote_number),
    quoteDate: orPlaceholder(latestQuote ? formatDisplayDateLong(latestQuote.created_at?.slice(0, 10) ?? null) : null),
    validityDate: orPlaceholder(latestQuote ? formatDisplayDateLong(latestQuote.validity_until) : null),
    total: orPlaceholder(latestQuote ? formatMoney(latestQuote.total ?? 0) : null),
    invoiceNumber: orPlaceholder(booking?.booking_number ? clientInvoiceNumber(booking) : null),
    amountDue: orPlaceholder(latestInvoice ? formatCurrency(latestInvoice.amount, latestInvoice.currency) : null),
    dueDate: orPlaceholder(latestInvoice ? formatDisplayDateLong(latestInvoice.due_date) : null),
    depositAmount: orPlaceholder(
      latestDepositInvoice ? formatCurrency(latestDepositInvoice.amount, latestDepositInvoice.currency) : null,
    ),
    depositPercentage: orPlaceholder(
      latestDepositInvoice?.deposit_percentage != null ? String(latestDepositInvoice.deposit_percentage) : null,
    ),
    finalDueDate,
    finalAmount,
    receivedAmount,
    outstandingAmount,
    daysOverdue,
    voucherNumber: orPlaceholder(latestVoucher?.voucher_number),
    lastSentDate: orPlaceholder(lastQuoteSentAt ? formatDisplayDateLong(lastQuoteSentAt.sent_at) : null),
  }

  const blocks: Record<string, string> = {
    bankingDetails: orPlaceholder(buildBankingDetailsBlock(bankingSettings)),
    guestInfo,
    quoteSummaryTable,
  }

  return { tokens, blocks }
}
