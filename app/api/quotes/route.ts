import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate } from "@/lib/date-format"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"

const lineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
})

const createQuoteSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    itineraryId: z.string().uuid().nullable().optional(),
    status: z.enum(["draft", "pricing_incomplete", "ready", "sent", "accepted"]).optional(),
    validityUntil: z.string().nullable().optional(),
    subtotal: z.number().nonnegative().optional(),
    vat: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    lineItems: z.array(lineItemSchema).optional(),
  })
  .refine((v) => Boolean(v.bookingId ?? v.jobId), {
    message: "bookingId or jobId is required",
    path: ["bookingId"],
  })

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

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

  const [{ data: booking, error: bookingError }, { data: existingQuotes, error: existingQuotesError }] = await Promise.all([
    supabase.from("bookings").select("booking_number").eq("id", bookingId).single(),
    supabase.from("quotes").select("quote_number").eq("booking_id", bookingId),
  ])

  if (bookingError && bookingError.code !== "PGRST116") {
    return safeSupabaseError("quotes:load-booking", bookingError)
  }
  if (!booking) return jsonError("Booking not found", 404)

  if (existingQuotesError) return safeSupabaseError("quotes:load-existing", existingQuotesError)

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      itinerary_id: body.itineraryId ?? null,
      status: body.status ?? "draft",
      validity_until: body.validityUntil ?? null,
      subtotal: body.subtotal ?? 0,
      vat: body.vat ?? 0,
      total: body.total ?? 0,
      quote_number: buildQuoteNumber(booking.booking_number, existingQuotes ?? []),
    })
    .select(
      "id, booking_id, itinerary_id, status, quote_number, parent_quote_id, validity_until, subtotal, vat, total",
    )
    .single()

  if (error || !quote) return safeSupabaseError("quotes:insert", error)

  const lineItems = body.lineItems ?? []
  if (lineItems.length > 0) {
    const { error: lineError } = await supabase.from("quote_line_items").insert(
      lineItems.map((li, idx) => ({
        quote_id: quote.id,
        description: li.description,
        qty: li.qty ?? 1,
        unit_price: li.unitPrice ?? 0,
        total: li.total ?? 0,
        sort_order: idx,
      })),
    )
    if (lineError) return safeSupabaseError("quotes:insert-line-items", lineError)
  }

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
    lineItems,
  })
}
