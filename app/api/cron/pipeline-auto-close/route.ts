import { NextResponse } from "next/server"
import { formatDisplayDate } from "@/lib/date-format"
import { composeEmail } from "@/lib/templates/compose-email"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import type { PipelineStage, Source } from "@/lib/types"
import { firstRecord } from "@/lib/utils"

const THANK_YOU_CATCHUP_WINDOW_DAYS = 14

interface MaintenanceBooking {
  id: string
  booking_number: string
  stage: PipelineStage
  source: Source
  raw_text: string | null
  updated_at: string
  customer_id: string
  consultant: string | null
  departure_date: string | null
  duration_nights: number | null
  trip_end_date: string | null
  route_reversed: boolean | null
  customer: { first_name: string | null } | null
  route: {
    name: string | null
    direction_mode: string | null
    origin: { name: string | null } | { name: string | null }[] | null
    destination: { name: string | null } | { name: string | null }[] | null
  } | null
}

function resolveBookingRouteName(booking: MaintenanceBooking): string | null {
  const route = booking.route
  if (!route) return null
  const origin = firstRecord(route.origin)?.name
  const destination = firstRecord(route.destination)?.name
  if (route.direction_mode !== "round_trip" || !origin || !destination) return route.name
  return resolveDirectedRouteName(origin, destination, booking.route_reversed ?? false)
}

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateFromDatabaseDate(value: string): Date {
  const [year = "1970", month = "1", day = "1"] = value.split("-")
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = utcDateOnly(new Date())

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, stage, source, raw_text, updated_at, customer_id, consultant, departure_date, duration_nights, trip_end_date, route_reversed, customer:customers(first_name), route:routes(name, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name))",
    )
    .in("stage", ["voucher_sent", "trip_active"])
    .not("departure_date", "is", null)

  if (bookingsError) {
    return NextResponse.json({ error: bookingsError.message }, { status: 500 })
  }

  const maintenanceBookings = (bookings ?? []) as MaintenanceBooking[]
  const candidateIds = maintenanceBookings.map((booking) => booking.id)
  const { data: existingThankYous, error: thankYouError } =
    candidateIds.length > 0
      ? await supabase
          .from("correspondences")
          .select("booking_id")
          .eq("kind", "thank_you")
          .in("booking_id", candidateIds)
      : { data: [], error: null }

  if (thankYouError) {
    return NextResponse.json({ error: thankYouError.message }, { status: 500 })
  }

  const thankYouBookingIds = new Set((existingThankYous ?? []).map((row) => row.booking_id))
  let thankYousScheduled = 0
  let autoClosed = 0

  for (const booking of maintenanceBookings) {
    if (!booking.departure_date) continue

    // Prefer the derived trip end (covers hotel stays/rentals past the train's arrival);
    // fall back to departure + nights for bookings never re-saved since the field existed.
    const tripEndDate = booking.trip_end_date
      ? dateFromDatabaseDate(booking.trip_end_date)
      : addDays(dateFromDatabaseDate(booking.departure_date), booking.duration_nights ?? 0)
    const thankYouDueDate = addDays(tripEndDate, 3)
    const thankYouCatchupDeadline = addDays(tripEndDate, 3 + THANK_YOU_CATCHUP_WINDOW_DAYS)
    const closeDueDate = addDays(tripEndDate, 7)

    if (
      thankYouDueDate.getTime() <= today.getTime() &&
      today.getTime() <= thankYouCatchupDeadline.getTime() &&
      !thankYouBookingIds.has(booking.id)
    ) {
      // Draft from the editable thank_you template — sent later with one
      // click from the dashboard's scheduled-email queue.
      const composed = await composeEmail(supabase, "thank_you", {
        tokens: {
          customerName: booking.customer?.first_name ?? "Valued Guest",
          jobNumber: booking.booking_number,
          routeName: resolveBookingRouteName(booking) ?? "your journey",
          tripEndDate: formatDisplayDate(tripEndDate),
          consultantName: booking.consultant ?? "The Luxus team",
        },
      })
      if (!composed) {
        return NextResponse.json({ error: "Thank-you template could not be resolved" }, { status: 500 })
      }
      const { error: correspondenceError } = await supabase.from("correspondences").insert({
        booking_id: booking.id,
        channel: "email",
        kind: "thank_you",
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
        subject: composed.subject,
        body_html: composed.bodyHtml,
      })

      if (correspondenceError) {
        return NextResponse.json({ error: correspondenceError.message }, { status: 500 })
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        actor: "system_cron",
        actor_user_id: null,
        entity_type: "Booking",
        entity_id: booking.id,
        action: "thank_you_email_scheduled",
        meta_json: { trip_end_date: tripEndDate.toISOString().slice(0, 10) },
      })

      if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 })
      thankYousScheduled += 1
      thankYouBookingIds.add(booking.id)
    }

    if (closeDueDate < today) {
      const transition = await applyTransition(supabase, {
        booking: {
          id: booking.id,
          booking_number: booking.booking_number,
          stage: booking.stage,
          source: booking.source,
          raw_text: booking.raw_text,
          updated_at: booking.updated_at,
          customer_id: booking.customer_id,
          consultant: booking.consultant,
        },
        targetStage: "closed",
        actorName: "system_cron",
        actorUserId: null,
      })

      const { error: historyError } = await supabase.from("pipeline_history").insert({
        booking_id: booking.id,
        from_stage: booking.stage,
        to_stage: "closed",
        moved_by: "system_cron",
        moved_by_user_id: null,
      })

      if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 })

      const { error: auditError } = await supabase.from("audit_logs").insert({
        actor: "system_cron",
        actor_user_id: null,
        entity_type: "Booking",
        entity_id: booking.id,
        action: "stage_change_auto_close",
        before_json: { stage: booking.stage },
        after_json: { stage: transition.updated.stage },
      })

      if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 })
      autoClosed += 1
    }
  }

  return NextResponse.json({ thankYousScheduled, autoClosed })
}
