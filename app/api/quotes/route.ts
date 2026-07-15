import { z } from "zod"
import { writeAuditLog } from "@/lib/audit-write"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate } from "@/lib/date-format"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import { calculateQuoteTotals, roundMoney } from "@/lib/quotes/pricing-engine"
import { isoDateDaysFromNow, resolveValidityDays } from "@/lib/quotes/quote-validity"
import { syncBookingRoute } from "@/lib/quotes/resolve-primary-route"
import type { Json } from "@/lib/supabase/types"
import type { QuoteLineItem } from "@/lib/types"

const lineItemSchema = z.object({
  description: z.string().min(1),
  supplierDescription: z.string().nullable().optional(),
  qty: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  pricingSnapshot: z.unknown().nullable().optional(),
})

const createQuoteSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    status: z.enum(["draft", "pricing_incomplete", "ready", "sent", "accepted"]).optional(),
    validityUntil: z.string().nullable().optional(),
    subtotal: z.number().nonnegative().optional(),
    vat: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    lineItems: z.array(lineItemSchema).optional(),
    overrideReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => Boolean(v.bookingId ?? v.jobId), {
    message: "bookingId or jobId is required",
    path: ["bookingId"],
  })

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, profile, user } = auth.value

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = createQuoteSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const body = parsed.data
  const bookingId = (body.bookingId ?? body.jobId) as string
  const lineItems = body.lineItems ?? []
  const normalizedLineItems: QuoteLineItem[] = lineItems.map((li) => ({
    description: li.description,
    supplierDescription: li.supplierDescription ?? null,
    qty: li.qty ?? 1,
    unitPrice: li.unitPrice ?? 0,
    total: roundMoney((li.unitPrice ?? 0) * (li.qty ?? 1)),
    pricingSnapshot: (li.pricingSnapshot ?? null) as QuoteLineItem["pricingSnapshot"],
  }))
  const calculatedTotals = calculateQuoteTotals(normalizedLineItems)

  const [{ data: booking, error: bookingError }, { data: existingQuotes, error: existingQuotesError }, { data: validitySetting }] = await Promise.all([
    supabase.from("bookings").select("booking_number").eq("id", bookingId).single(),
    supabase.from("quotes").select("quote_number").eq("booking_id", bookingId),
    supabase.from("app_settings").select("value").eq("key", "quote_validity_days").maybeSingle(),
  ])

  if (bookingError && bookingError.code !== "PGRST116") {
    return safeSupabaseError("quotes:load-booking", bookingError)
  }
  if (!booking) return jsonError("Booking not found", 404)

  if (existingQuotesError) return safeSupabaseError("quotes:load-existing", existingQuotesError)

  const computedValidityUntil: string | null =
    body.validityUntil ?? isoDateDaysFromNow(resolveValidityDays(validitySetting?.value))

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      status: body.status ?? "draft",
      validity_until: computedValidityUntil,
      subtotal: lineItems.length > 0 ? calculatedTotals.subtotal : (body.subtotal ?? 0),
      vat: lineItems.length > 0 ? calculatedTotals.vat : (body.vat ?? 0),
      total: lineItems.length > 0 ? calculatedTotals.total : (body.total ?? 0),
      override_reason: body.overrideReason ?? null,
      quote_number: buildQuoteNumber(booking.booking_number, existingQuotes ?? []),
    })
    .select(
      "id, booking_id, itinerary_id, status, quote_number, parent_quote_id, validity_until, subtotal, vat, total",
    )
    .single()

  if (error || !quote) return safeSupabaseError("quotes:insert", error)

  if (normalizedLineItems.length > 0) {
    const { error: lineError } = await supabase.from("quote_line_items").insert(
      normalizedLineItems.map((li, idx) => ({
        quote_id: quote.id,
        description: li.description,
        supplier_description: li.supplierDescription ?? null,
        qty: li.qty ?? 1,
        unit_price: li.unitPrice ?? 0,
        total: li.total ?? 0,
        sort_order: idx,
        pricing_snapshot: li.pricingSnapshot as Json,
      })),
    )
    if (lineError) return safeSupabaseError("quotes:insert-line-items", lineError)

    const { error: routeSyncError } = await syncBookingRoute(supabase, bookingId, normalizedLineItems)
    if (routeSyncError) return jsonError(routeSyncError, 500)
  }

  const auditResult = await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Quote",
    entityId: quote.id,
    action: "quote_generated",
    after: {
      booking_id: quote.booking_id,
      quote_number: quote.quote_number,
      status: quote.status,
      total: quote.total,
    },
    meta: { line_item_count: normalizedLineItems.length },
  })
  if (auditResult.error) return safeSupabaseError("quotes:audit-generated", auditResult.error)

  return Response.json({
    id: quote.id,
    jobId: quote.booking_id,
    bookingId: quote.booking_id,
    itineraryId: quote.itinerary_id,
    status: quote.status,
    quoteNumber: quote.quote_number,
    parentQuoteId: quote.parent_quote_id,
    validityUntil: quote.validity_until,
    validityUntilDisplay: formatDisplayDate(quote.validity_until),
    subtotal: quote.subtotal,
    vat: quote.vat,
    total: quote.total,
    lineItems: normalizedLineItems,
  })
}
