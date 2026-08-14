import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { bucketRoster } from "@/lib/packages/roster-pax"
import { fetchDefaultAgeBuckets } from "@/lib/pricing/age-buckets"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

type QuoteStatus = Database["public"]["Enums"]["quote_status"]
const LIVE_QUOTE_STATUSES: QuoteStatus[] = ["sent", "accepted"]

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Writes the captured guest roster into the pax the pricing engine reads
 * (bookings.no_of_adults / no_of_children / child_ages), aged at the trip start.
 *
 * Deliberately an explicit action rather than a derivation: pricing must never move because
 * somebody typed a guest's date of birth. Nothing is re-priced here either — a quote already
 * built from the old pax keeps its numbers, and the response says so when one is live.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, no_of_adults, no_of_children, child_ages, trip_start_date, departure_date")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("travellers-sync-pax:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: travellers, error: travellersError } = await supabase
    .from("travellers")
    .select("date_of_birth, is_child")
    .eq("booking_id", id)
    .order("sort_order")

  if (travellersError) return safeSupabaseError("travellers-sync-pax:load-travellers", travellersError)

  if (!travellers || travellers.length === 0) {
    return jsonError("Capture the guest list before applying it to the booking's passenger counts.", 400)
  }

  const buckets = await fetchDefaultAgeBuckets(supabase)
  const referenceDate =
    booking.trip_start_date ?? booking.departure_date ?? new Date().toISOString().slice(0, 10)

  const roster = bucketRoster(
    travellers.map((row) => ({ dateOfBirth: row.date_of_birth, isChild: row.is_child })),
    buckets,
    referenceDate,
  )

  // The rest of the app treats child_ages as exactly one age per child (enforced on
  // PATCH /api/jobs/[id]), so a child guest with no readable date of birth would write a pair of
  // columns that disagree. Refuse and name the gap instead of guessing an age.
  if (roster.noOfChildren !== roster.childAges.length) {
    const missing = roster.noOfChildren - roster.childAges.length
    return jsonError(
      `${missing} child guest${missing === 1 ? "" : "s"} ${missing === 1 ? "has" : "have"} no date of birth — add ${
        missing === 1 ? "it" : "them"
      } before applying the guest list to the passenger counts.`,
      400,
      { missingDatesOfBirth: missing },
    )
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      no_of_adults: roster.noOfAdults,
      no_of_children: roster.noOfChildren,
      child_ages: roster.childAges,
    })
    .eq("id", id)

  if (updateError) return safeSupabaseError("travellers-sync-pax:update-booking", updateError)

  const { data: liveQuotes } = await supabase
    .from("quotes")
    .select("quote_number")
    .eq("booking_id", id)
    .in("status", LIVE_QUOTE_STATUSES)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_pax_synced_from_roster",
    meta: {
      from: {
        no_of_adults: booking.no_of_adults,
        no_of_children: booking.no_of_children,
        child_ages: booking.child_ages ?? [],
      },
      to: {
        no_of_adults: roster.noOfAdults,
        no_of_children: roster.noOfChildren,
        child_ages: roster.childAges,
      },
      reference_date: referenceDate,
    },
  })

  const liveQuoteNumbers = (liveQuotes ?? []).map((quote) => quote.quote_number).filter(Boolean)

  return Response.json({
    pax: {
      noOfAdults: roster.noOfAdults,
      noOfChildren: roster.noOfChildren,
      childAges: roster.childAges,
    },
    totals: roster.totals,
    undatedCount: roster.undatedCount,
    referenceDate,
    warning:
      liveQuoteNumbers.length > 0
        ? `Quote ${liveQuoteNumbers.join(", ")} was priced from the previous passenger counts and has not been re-priced.`
        : null,
  })
}
