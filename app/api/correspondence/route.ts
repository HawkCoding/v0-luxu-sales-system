import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDateTime } from "@/lib/date-format"

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = await createSessionClient()

  // Accept jobId (from existing components) or bookingId
  const bookingId = body.bookingId || body.jobId

  const success = Math.random() > 0.1
  const now = new Date().toISOString()

  const { data: cor, error } = await supabase
    .from("correspondences")
    .insert({
      booking_id: bookingId,
      channel: body.channel || "email",
      subject: body.subject,
      body_html: body.bodyHtml || null,
      status: success ? "sent" : "failed",
      sent_at: success ? now : null,
      error: success ? null : "SMTP connection timeout (mock)",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Move stage if requested and send was successful
  if (success && body.moveStage) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("stage")
      .eq("id", bookingId)
      .single()

    if (booking) {
      await supabase
        .from("bookings")
        .update({ stage: body.moveStage, updated_at: now })
        .eq("id", bookingId)

      await supabase.from("audit_logs").insert({
        actor: body.actor || "consultant",
        entity_type: "Booking",
        entity_id: bookingId,
        action: "stage_change",
        before_json: { stage: booking.stage },
        after_json: { stage: body.moveStage },
      })
    }
  }

  // Schedule follow-up correspondence
  if (success) {
    await supabase.from("correspondences").insert({
      booking_id: bookingId,
      channel: "email",
      subject: `Follow-up: ${body.subject}`,
      body_html: "<p>Scheduled follow-up</p>",
      status: "scheduled",
      scheduled_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    })
  }

  return NextResponse.json({
    id: cor.id,
    jobId: cor.booking_id,
    bookingId: cor.booking_id,
    channel: cor.channel,
    subject: cor.subject,
    bodyHtml: cor.body_html,
    status: cor.status,
    sentAt: cor.sent_at,
    sentAtDisplay: formatDisplayDateTime(cor.sent_at),
    error: cor.error,
  })
}
