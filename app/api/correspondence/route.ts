import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateTime } from "@/lib/date-format"
import { getEmailFromAddress } from "@/lib/email/from"
import { sendEmail } from "@/lib/email/transport"
import type { PipelineStage } from "@/lib/types"

export const runtime = "nodejs"

function getPlainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const PIPELINE_STAGE_VALUES = [
  "enquiry",
  "quoted",
  "quote_sent",
  "accepted",
  "form_done",
  "deposit_requested",
  "payment_schedule",
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "trip_active",
  "closed",
  "lost",
] as const satisfies readonly PipelineStage[]

const recipientSchema = z.union([
  z.string().email().max(320),
  z.array(z.string().email().max(320)).max(20),
])

const correspondenceSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    channel: z.enum(["email", "sms", "phone"]).optional(),
    subject: z.string().trim().min(1).max(500),
    bodyHtml: z.string().max(200_000).optional(),
    kind: z.string().trim().min(1).max(80).optional(),
    quoteId: z.string().uuid().optional(),
    text: z.string().max(200_000).optional(),
    sentAt: z.string().datetime({ offset: true }).optional(),
    moveStage: z.enum(PIPELINE_STAGE_VALUES).optional(),
    to: recipientSchema.optional(),
    attachments: z
      .array(
        z.object({
          filename: z.string().trim().min(1).max(240),
          contentBase64: z.string().min(1).max(15_000_000),
          contentType: z.string().trim().min(1).max(120).optional(),
        }),
      )
      .max(5)
      .optional(),
  })
  .refine((value) => Boolean(value.bookingId ?? value.jobId), {
    message: "bookingId or jobId is required",
    path: ["bookingId"],
  })

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = correspondenceSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, profile } = auth.value
  const bookingId = (parsed.data.bookingId ?? parsed.data.jobId) as string

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("stage, customer:customers(email)")
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return jsonError("Booking not found", 404)
  }

  const customerRecord = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const recipient = parsed.data.to ?? customerRecord?.email

  const from = await getEmailFromAddress(supabase)
  const subject = parsed.data.subject.trim()
  const bodyHtml = parsed.data.bodyHtml?.trim() || null
  const text = parsed.data.text?.trim() || (bodyHtml ? getPlainTextFromHtml(bodyHtml) : null)
  const sendResult = await sendEmail({
    from,
    to: recipient ?? "",
    subject,
    html: bodyHtml,
    text,
    attachments: parsed.data.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.contentBase64,
      contentType: attachment.contentType,
    })),
  })

  const success = sendResult.success
  const now = new Date().toISOString()

  const { data: cor, error } = await supabase
    .from("correspondences")
    .insert({
      booking_id: bookingId,
      channel: parsed.data.channel ?? "email",
      kind: parsed.data.kind ?? null,
      subject,
      body_html: bodyHtml,
      status: success ? "sent" : "failed",
      sent_at: success ? parsed.data.sentAt ?? now : null,
      error: sendResult.error,
      provider_message_id: sendResult.providerMessageId,
    })
    .select(
      "id, booking_id, channel, kind, subject, body_html, status, sent_at, error, provider_message_id",
    )
    .single()

  if (error || !cor) return safeSupabaseError("correspondence:insert", error)

  if (success && parsed.data.quoteId) {
    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({ status: "sent", last_sent_at: parsed.data.sentAt ?? now })
      .eq("id", parsed.data.quoteId)
      .eq("booking_id", bookingId)

    if (quoteUpdateError) return safeSupabaseError("correspondence:update-quote", quoteUpdateError)
  }

  if (success && parsed.data.moveStage && booking.stage !== parsed.data.moveStage) {
    const stageUpdate: Record<string, string> = { stage: parsed.data.moveStage, updated_at: now }
    if (parsed.data.moveStage === "voucher_sent") stageUpdate.voucher_sent_at = now

    const { error: updateError } = await supabase
      .from("bookings")
      .update(stageUpdate)
      .eq("id", bookingId)

    if (updateError) return safeSupabaseError("correspondence:update-stage", updateError)

    if (parsed.data.moveStage === "voucher_sent") {
      const { error: documentError } = await supabase
        .from("documents")
        .update({ status: "sent" })
        .eq("booking_id", bookingId)
        .eq("kind", "voucher_pdf")

      if (documentError) return safeSupabaseError("correspondence:update-voucher-document", documentError)
    }

    await supabase.from("audit_logs").insert({
      actor: profile.actorName,
      actor_user_id: auth.value.user.id,
      entity_type: "Booking",
      entity_id: bookingId,
      action: "stage_change",
      before_json: { stage: booking.stage },
      after_json: { stage: parsed.data.moveStage },
    })
  }

  if (success) {
    await supabase.from("correspondences").insert({
      booking_id: bookingId,
      channel: "email",
      subject: `Follow-up: ${subject}`,
      body_html: "<p>Scheduled follow-up</p>",
      status: "scheduled",
      scheduled_at: new Date(Date.now() + 48 * 3600000).toISOString(),
    })
  }

  return Response.json({
    id: cor.id,
    jobId: cor.booking_id,
    bookingId: cor.booking_id,
    channel: cor.channel,
    kind: cor.kind,
    subject: cor.subject,
    bodyHtml: cor.body_html,
    status: cor.status,
    sentAt: cor.sent_at,
    sentAtDisplay: formatDisplayDateTime(cor.sent_at),
    error: cor.error,
    providerMessageId: cor.provider_message_id,
  })
}
