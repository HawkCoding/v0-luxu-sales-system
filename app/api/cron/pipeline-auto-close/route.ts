import { NextResponse } from "next/server"
import { renderThankYouEmail } from "@/lib/email-templates/thank-you"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { createServiceClient } from "@/lib/supabase/server"
import type { PipelineStage, Source } from "@/lib/types"

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
  customer: { first_name: string | null } | null
  route: { name: string | null } | null
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

function datesEqual(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime()
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
      "id, booking_number, stage, source, raw_text, updated_at, customer_id, consultant, departure_date, duration_nights, customer:customers(first_name), route:routes(name)",
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

    const tripEndDate = addDays(dateFromDatabaseDate(booking.departure_date), booking.duration_nights ?? 0)
    const thankYouDueDate = addDays(tripEndDate, 3)
    const closeDueDate = addDays(tripEndDate, 7)

    if (datesEqual(thankYouDueDate, today) && !thankYouBookingIds.has(booking.id)) {
      const rendered = renderThankYouEmail({
        customerFirstName: booking.customer?.first_name ?? "",
        routeName: booking.route?.name ?? "",
        tripEndDate: tripEndDate.toISOString().slice(0, 10),
        consultantName: booking.consultant ?? "The Luxus team",
      })
      const { error: correspondenceError } = await supabase.from("correspondences").insert({
        booking_id: booking.id,
        channel: "email",
        kind: "thank_you",
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
        subject: rendered.subject,
        body_html: rendered.bodyHtml,
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
