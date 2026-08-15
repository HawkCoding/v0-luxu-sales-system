import { NextResponse } from "next/server"
import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

type QuoteStatus = Database["public"]["Enums"]["quote_status"]
const VOIDABLE_QUOTE_STATUSES: QuoteStatus[] = ["draft", "pricing_incomplete"]
/** Statuses that mean the customer is holding a live quote: deleting the services behind it would
 * leave a priced document with nothing to render on the voucher. expired/superseded/cancelled are
 * dead documents, so they don't block. */
const LIVE_QUOTE_STATUSES: QuoteStatus[] = ["sent", "accepted"]

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Reverses an auto-build: deletes only booking_services rows still origin='auto' (their units and
 * linked transport requests cascade via FK), leaving anything the consultant already edited
 * (origin='consultant') untouched. Voids the derived draft quote so nothing unpriced-by-a-human
 * is left one click from Send. Idempotent -- re-running when nothing is left to discard is a
 * harmless no-op -- and it re-enables auto-build to run again once the consultant fixes whatever
 * the enquiry got wrong (supplier, route, ...).
 *
 * Refuses with 409 when a quote is already sent or accepted: those services are what the customer
 * is holding a price for, and deleting them leaves a live quote with nothing behind it.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services-discard:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: services, error: servicesError } = await supabase
    .from("booking_services")
    .select("id, origin")
    .eq("booking_id", id)

  if (servicesError) return safeSupabaseError("services-discard:load-services", servicesError)

  const autoServiceIds = (services ?? []).filter((row) => row.origin === "auto").map((row) => row.id)
  const consultantEditedCount = (services ?? []).filter((row) => row.origin === "consultant").length

  if (autoServiceIds.length === 0) {
    return Response.json({ discarded: 0, warning: null })
  }

  // Checked after the no-op return above so re-running a completed discard stays idempotent rather
  // than starting to 409 the moment a quote goes out.
  const { data: liveQuotes, error: liveQuotesError } = await supabase
    .from("quotes")
    .select("id, quote_number, status")
    .eq("booking_id", id)
    .in("status", LIVE_QUOTE_STATUSES)

  if (liveQuotesError) return safeSupabaseError("services-discard:load-live-quotes", liveQuotesError)

  if (liveQuotes && liveQuotes.length > 0) {
    const numbers = liveQuotes.map((quote) => quote.quote_number).filter(Boolean).join(", ")
    const subject = numbers ? `Quote ${numbers}` : "A quote for this booking"
    return NextResponse.json(
      {
        error: `${subject} has already gone to the customer — cancel or supersede it before discarding the services it was priced from.`,
        code: "LIVE_QUOTE_EXISTS",
        quotes: liveQuotes.map((quote) => ({ id: quote.id, quoteNumber: quote.quote_number, status: quote.status })),
      },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase.from("booking_services").delete().in("id", autoServiceIds)
  if (deleteError) return safeSupabaseError("services-discard:delete-services", deleteError)

  const { data: voidableQuotes, error: quotesError } = await supabase
    .from("quotes")
    .select("id")
    .eq("booking_id", id)
    .in("status", VOIDABLE_QUOTE_STATUSES)

  if (quotesError) return safeSupabaseError("services-discard:load-quotes", quotesError)

  if (voidableQuotes && voidableQuotes.length > 0) {
    const { error: voidError } = await supabase
      .from("quotes")
      .update({ status: "cancelled" })
      .in(
        "id",
        voidableQuotes.map((quote) => quote.id),
      )
    if (voidError) return safeSupabaseError("services-discard:void-quotes", voidError)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "auto_build_discarded",
    meta: {
      discarded_service_ids: autoServiceIds,
      voided_quote_ids: (voidableQuotes ?? []).map((quote) => quote.id),
    },
  })

  return Response.json({
    discarded: autoServiceIds.length,
    warning:
      consultantEditedCount > 0
        ? `${consultantEditedCount} service${consultantEditedCount === 1 ? "" : "s"} you already edited ${
            consultantEditedCount === 1 ? "was" : "were"
          } kept`
        : null,
  })
}
