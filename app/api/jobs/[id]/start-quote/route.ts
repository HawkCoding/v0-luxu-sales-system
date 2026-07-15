import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import { isoDateDaysFromNow, resolveValidityDays } from "@/lib/quotes/quote-validity"
import type { GateFailure } from "@/lib/pipeline/validate-transition"

const startQuoteSchema = z.object({
  validityUntil: z.string().nullable().optional(),
})

interface CustomerGateRow {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  country: string | null
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

function getCustomerCompleteFailure(customer: CustomerGateRow | null): GateFailure | null {
  const missing = [
    ["first name", customer?.first_name],
    ["last name", customer?.last_name],
    ["email", customer?.email],
    ["phone", customer?.phone],
    ["country", customer?.country],
  ]
    .filter(([, value]) => !hasText(value))
    .map(([label]) => label)

  if (missing.length === 0) return null

  return {
    gateId: "customer_complete",
    severity: "block",
    message: `Customer profile is missing ${missing.join(", ")}.`,
    fixHint: "Complete the customer profile before starting a quote.",
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown = {}
  try {
    const text = await req.text()
    raw = text ? JSON.parse(text) : {}
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = startQuoteSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)
  const body = parsed.data

  const { id } = await params
  const { supabase } = auth.value
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_number, customer_id, source, email_import_needs_review, email_import_review_resolved_at")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("jobs:start-quote-load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const [
    { data: customer, error: customerError },
    { data: existingQuotes, error: existingQuotesError },
    { data: validitySetting },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("first_name, last_name, email, phone, country")
      .eq("id", booking.customer_id)
      .maybeSingle(),
    supabase.from("quotes").select("quote_number").eq("booking_id", id),
    supabase.from("app_settings").select("value").eq("key", "quote_validity_days").maybeSingle(),
  ])

  if (customerError) return safeSupabaseError("jobs:start-quote-load-customer", customerError)
  if (existingQuotesError) return safeSupabaseError("jobs:start-quote-load-existing", existingQuotesError)

  const failures = [
    getCustomerCompleteFailure(customer),
    booking.source === "email" &&
    booking.email_import_needs_review === true &&
    booking.email_import_review_resolved_at === null
      ? {
          gateId: "email_import_review",
          severity: "block",
          message: "Email import review must be cleared before quote work starts.",
          fixHint: "Ask a manager to resolve the import review.",
        } satisfies GateFailure
      : null,
  ].filter((failure): failure is GateFailure => failure !== null)

  if (failures.length > 0) return Response.json({ failures }, { status: 422 })

  const computedValidityUntil = body.validityUntil ?? isoDateDaysFromNow(resolveValidityDays(validitySetting?.value))

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      booking_id: id,
      itinerary_id: null,
      status: "draft",
      validity_until: computedValidityUntil,
      subtotal: 0,
      vat: 0,
      total: 0,
      quote_number: buildQuoteNumber(booking.booking_number, existingQuotes ?? []),
    })
    .select("id, quote_number, status")
    .single()

  if (quoteError || !quote) return safeSupabaseError("jobs:start-quote-insert", quoteError)

  return Response.json({
    quote: {
      id: quote.id,
      quote_number: quote.quote_number,
      status: quote.status,
    },
  })
}
