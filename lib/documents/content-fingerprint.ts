import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"

/**
 * "Has the booking changed since this document was sent?"
 *
 * A fingerprint of the booking data a quote, invoice or voucher is printed from. It is taken when a
 * document is emailed and compared against the booking as it is now, so a change to dates, guests,
 * services, prices or (for vouchers) supplier references shows up without re-rendering anything.
 *
 * Deliberately NOT derived from the PDF render path: that would mean refactoring three working PDF
 * pipelines for a display hint. This reads the source rows instead, so it can be wrong in one
 * direction only by being too broad (an unprinted field that changes flags a document "changed",
 * and the salesperson can leave it as is). It is never a gate.
 *
 * What is left out on purpose: ids and timestamps (they change on every save without the content
 * changing), who-set-it provenance, supplier payment admin, payments and invoice status (recording
 * a payment is not a change to the document), and branding/document text (a settings change does
 * not mean the client holds the wrong document).
 */

type Client = SupabaseClient<Database>

/** Row keys that change on a save without the printed content changing. */
const ALWAYS_IGNORED_KEYS = new Set([
  "id",
  "booking_id",
  "service_id",
  "transport_request_id",
  "created_at",
  "updated_at",
])

/** Supplier-side payment admin: never printed on any client document. */
const SUPPLIER_ADMIN_KEYS = new Set(["booking_date", "confirmation_date", "payment_made_date", "paid_with"])

/** Printed on the voucher only. */
const VOUCHER_ONLY_KEYS = new Set(["supplier_reference", "supplier_contact_name", "voucher_footnote", "notes"])

function isIgnoredKey(key: string, docType: IssuedDocumentType): boolean {
  if (ALWAYS_IGNORED_KEYS.has(key) || SUPPLIER_ADMIN_KEYS.has(key)) return true
  // Who set a price override, and when, is provenance rather than content.
  if (/_set_(at|by)$/.test(key)) return true
  return docType !== "voucher" && VOUCHER_ONLY_KEYS.has(key)
}

/** Drops the keys that are not content and the null/empty ones, so adding an empty field is no change. */
export function contentOf(row: Record<string, unknown>, docType: IssuedDocumentType): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (isIgnoredKey(key, docType)) continue
    if (value === null || value === undefined || value === "") continue
    if (Array.isArray(value) && value.length === 0) continue
    content[key] = value
  }
  return content
}

/** JSON with object keys sorted, so the same content always serialises the same way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function fingerprintOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

/** Rows have no stable id across saves, so order by content: a reshuffle alone is not a change. */
function sortedByContent(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const left = canonicalJson(a)
    const right = canonicalJson(b)
    return left < right ? -1 : left > right ? 1 : 0
  })
}

export interface ContentFingerprintInput {
  bookingId: string
  docType: IssuedDocumentType
  /** The quote the document was issued from (quotes). */
  quoteId?: string | null
  /** The invoice the document was issued from (invoices). */
  invoiceId?: string | null
}

async function rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return (data ?? []) as Record<string, unknown>[]
}

async function quoteLines(supabase: Client, quoteId: string | null | undefined): Promise<Record<string, unknown>[]> {
  if (!quoteId) return []
  const lines = await rows(
    supabase
      .from("quote_line_items")
      .select("description, qty, unit_price, total, sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    "quote lines",
  )
  // sort_order is position, not content: the order the lines print in is.
  return lines.map((line) => {
    const { sort_order: _position, ...rest } = line
    return rest
  })
}

async function documentSource(
  supabase: Client,
  input: ContentFingerprintInput,
): Promise<Record<string, unknown>> {
  if (input.docType === "quote") {
    const [quote] = input.quoteId
      ? await rows(
          supabase
            .from("quotes")
            .select(
              "subtotal, total, currency, agent_commission, discount_amount, discount_visible, validity_until, journey_class, rate_audience, show_train_only_note",
            )
            .eq("id", input.quoteId),
          "quote",
        )
      : []
    return { quote: quote ?? null, lines: await quoteLines(supabase, input.quoteId) }
  }

  if (input.docType === "invoice") {
    const [invoice] = input.invoiceId
      ? await rows(
          supabase
            .from("invoices")
            .select("amount, currency, due_date, deposit_percentage, kind, quote_id")
            .eq("id", input.invoiceId),
          "invoice",
        )
      : []
    const quoteId = typeof invoice?.quote_id === "string" ? invoice.quote_id : null
    const { quote_id: _quoteId, ...invoiceContent } = invoice ?? {}
    // The invoice prints the quote's totals (what is left to pay follows the live quote, while the
    // deposit row stays as issued), so a discount or commission change moves them with no line
    // changing. Without these an invoice would not be flagged when only the total moved.
    const [quote] = quoteId
      ? await rows(
          supabase
            .from("quotes")
            .select("subtotal, total, currency, agent_commission, discount_amount, discount_visible")
            .eq("id", quoteId),
          "invoice quote",
        )
      : []
    return {
      invoice: invoice ? invoiceContent : null,
      quote: quote ?? null,
      lines: await quoteLines(supabase, quoteId),
    }
  }

  // Voucher: scoped to what the accepted quote bought.
  const [accepted] = await rows(
    supabase
      .from("quotes")
      .select("id")
      .eq("booking_id", input.bookingId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1),
    "accepted quote",
  )
  return { lines: await quoteLines(supabase, typeof accepted?.id === "string" ? accepted.id : null) }
}

/**
 * The fingerprint of the booking data this document type is printed from, right now.
 * Throws if any of it cannot be read; callers treat that as "unknown", never as "changed".
 */
export async function computeContentFingerprint(supabase: Client, input: ContentFingerprintInput): Promise<string> {
  const { bookingId, docType } = input

  const [bookingRows, travellers, paxGroups, services, transport, source] = await Promise.all([
    rows(
      supabase
        .from("bookings")
        .select(
          "departure_date, duration_nights, no_of_adults, no_of_children, child_ages, primary_supplier_id, trip_start_date, trip_end_date, package_travel_date, customer_invoice_number, route:routes(name), customer:customers(title, first_name, last_name, email, phone)",
        )
        .eq("id", bookingId),
      "booking",
    ),
    // `*` on purpose: a column added later that is printed should flag a change without this file
    // being touched. Volatile and unprinted keys are removed by contentOf.
    rows(supabase.from("travellers").select("*").eq("booking_id", bookingId), "travellers"),
    rows(supabase.from("booking_pax_groups").select("*").eq("booking_id", bookingId), "pax groups"),
    rows(supabase.from("booking_services").select("*").eq("booking_id", bookingId), "services"),
    rows(supabase.from("booking_transport_requests").select("*").eq("booking_id", bookingId), "transport"),
    documentSource(supabase, input),
  ])

  const serviceIds = services.map((service) => String(service.id))
  const transportIds = transport.map((request) => String(request.id))

  const [units, rentals] = await Promise.all([
    serviceIds.length > 0
      ? rows(supabase.from("booking_service_units").select("*").in("service_id", serviceIds), "units")
      : Promise.resolve([] as Record<string, unknown>[]),
    transportIds.length > 0
      ? rows(
          supabase.from("booking_vehicle_rental_details").select("*").in("transport_request_id", transportIds),
          "rentals",
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ])

  // Units and rental details hang off a row whose id changes on save, so they are folded into it.
  const unitsByService = new Map<string, Record<string, unknown>[]>()
  for (const unit of units) {
    const key = String(unit.service_id)
    unitsByService.set(key, [...(unitsByService.get(key) ?? []), contentOf(unit, docType)])
  }
  const rentalByRequest = new Map<string, Record<string, unknown>>()
  for (const rental of rentals) rentalByRequest.set(String(rental.transport_request_id), contentOf(rental, docType))

  const snapshot = {
    docType,
    booking: bookingRows[0] ?? null,
    travellers: sortedByContent(travellers.map((traveller) => contentOf(traveller, docType))),
    paxGroups: sortedByContent(paxGroups.map((group) => contentOf(group, docType))),
    services: sortedByContent(
      services.map((service) => ({
        ...contentOf(service, docType),
        units: sortedByContent(unitsByService.get(String(service.id)) ?? []),
      })),
    ),
    transport: sortedByContent(
      transport.map((request) => ({
        ...contentOf(request, docType),
        rental: rentalByRequest.get(String(request.id)) ?? null,
      })),
    ),
    ...source,
  }

  return fingerprintOf(snapshot)
}
