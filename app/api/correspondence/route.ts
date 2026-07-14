import { z } from "zod"
import { writeAuditLog } from "@/lib/audit-write"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { getEmailFromAddress } from "@/lib/email/from"
import { resolveSalespersonSender } from "@/lib/email/resolve-sender"
import { sendEmail } from "@/lib/email/transport"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { ensureQuotePdf, QUOTE_BUCKET } from "@/lib/quotes/ensure-quote-pdf"
import { composeEmail } from "@/lib/templates/compose-email"
import type { Json } from "@/lib/supabase/types"
import type { PipelineStage } from "@/lib/types"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"

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
    voucherId: z.string().uuid().optional(),
    scheduledCorrespondenceId: z.string().uuid().optional(),
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

function correspondenceSentAuditAction(kind: string | null | undefined, moveStage: PipelineStage | undefined): string | null {
  if (kind === "quote") return "quote_sent"
  if (kind === "voucher" || moveStage === "voucher_sent") return "voucher_sent"
  if (kind === "invoice" && moveStage === "deposit_requested") return "deposit_invoice_sent"
  return null
}

function isVoucherSend(kind: string | null | undefined, moveStage: PipelineStage | undefined): boolean {
  return kind?.toLowerCase() === "voucher" || moveStage === "voucher_sent"
}

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
    .select(
      "id, booking_number, stage, source, raw_text, updated_at, customer_id, consultant, departure_date, duration_nights, invoice_balance, assigned_salesperson_id, customer:customers(email, first_name, last_name)",
    )
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return jsonError("Booking not found", 404)
  }

  const customerRecord = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  if (isVoucherSend(parsed.data.kind, parsed.data.moveStage)) {
    const readiness = checkVoucherReadiness({
      stage: booking.stage,
      invoiceBalance: booking.invoice_balance !== null ? Number(booking.invoice_balance) : null,
      departureDate: booking.departure_date,
      customerEmail: customerRecord?.email ?? null,
    })

    if (!readiness.ready) {
      return jsonError("Voucher cannot be sent", 400, { failures: readiness.failures })
    }
  }

  const recipient = parsed.data.to ?? customerRecord?.email

  // If this send fulfils a scheduled correspondence, verify it exists up front
  // so we never send the email and then fail to record it.
  if (parsed.data.scheduledCorrespondenceId) {
    const { data: scheduledRow } = await supabase
      .from("correspondences")
      .select("id, status")
      .eq("id", parsed.data.scheduledCorrespondenceId)
      .eq("booking_id", bookingId)
      .maybeSingle()

    if (!scheduledRow) {
      return jsonError("Scheduled correspondence not found", 404)
    }
    if (scheduledRow.status !== "scheduled") {
      return jsonError("Correspondence has already been processed", 409)
    }
  }

  // Send through the assigned salesperson's mailbox when configured;
  // fall back to the office-wide From address.
  const sender = await resolveSalespersonSender(supabase, booking.assigned_salesperson_id)
  const from = sender.fromAddress ?? (await getEmailFromAddress(supabase))
  const subject = parsed.data.subject.trim()
  const bodyHtml = parsed.data.bodyHtml?.trim() || null
  const text = parsed.data.text?.trim() || (bodyHtml ? getPlainTextFromHtml(bodyHtml) : null)

  const baseAttachments: NonNullable<typeof parsed.data.attachments> = parsed.data.attachments ?? []

  if (parsed.data.kind === "quote" && parsed.data.quoteId) {
    // A quote email must always carry its PDF — re-render on every send so the
    // attachment reflects the current layout and quote data.
    let storagePath: string
    try {
      const ensured = await ensureQuotePdf(supabase, parsed.data.quoteId, {
        actorName: profile.actorName,
        actorUserId: auth.value.user.id,
        force: true,
      })
      storagePath = ensured.storagePath
    } catch (err) {
      console.error("correspondence:quote-pdf-ensure", err)
      return jsonError("Quote PDF could not be generated — email not sent", 500)
    }

    const objectPath = storagePath.startsWith(`${QUOTE_BUCKET}/`)
      ? storagePath.slice(QUOTE_BUCKET.length + 1)
      : storagePath
    const { data: blob, error: dlError } = await supabase.storage.from(QUOTE_BUCKET).download(objectPath)
    if (dlError || !blob) {
      console.error("correspondence:quote-pdf-download", dlError)
      return jsonError("Quote PDF could not be attached — email not sent", 500)
    }

    const arrayBuffer = await blob.arrayBuffer()
    const filename = objectPath.split("/").pop() ?? "quote.pdf"
    baseAttachments.unshift({
      filename,
      contentBase64: Buffer.from(arrayBuffer).toString("base64"),
      contentType: "application/pdf",
    })
  }

  const sendResult = await sendEmail({
    from,
    to: recipient ?? "",
    subject,
    html: bodyHtml,
    text,
    salespersonCredentialId: sender.salespersonCredentialId,
    attachments: baseAttachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.contentBase64,
      contentType: attachment.contentType,
    })),
  })

  const success = sendResult.success
  const now = new Date().toISOString()

  const recipientsArray = recipient
    ? Array.isArray(recipient)
      ? recipient
      : [recipient]
    : null

  const correspondenceValues = {
    channel: parsed.data.channel ?? "email",
    kind: parsed.data.kind ?? null,
    subject,
    body_html: bodyHtml,
    status: success ? ("sent" as const) : ("failed" as const),
    sent_at: success ? parsed.data.sentAt ?? now : null,
    error: sendResult.error,
    provider_message_id: sendResult.providerMessageId,
    recipients: recipientsArray,
  }

  const correspondenceColumns =
    "id, booking_id, channel, kind, subject, body_html, status, sent_at, error, provider_message_id, recipients"

  // Fulfilling a scheduled correspondence updates that row in place instead
  // of inserting a duplicate.
  const { data: cor, error } = parsed.data.scheduledCorrespondenceId
    ? await supabase
        .from("correspondences")
        .update(correspondenceValues)
        .eq("id", parsed.data.scheduledCorrespondenceId)
        .eq("booking_id", bookingId)
        .select(correspondenceColumns)
        .single()
    : await supabase
        .from("correspondences")
        .insert({ booking_id: bookingId, ...correspondenceValues })
        .select(correspondenceColumns)
        .single()

  if (error || !cor) return safeSupabaseError("correspondence:insert", error)

  if (!success) {
    return Response.json(
      {
        error: sendResult.error ?? "Email send failed",
        correspondenceId: cor.id,
        status: cor.status,
      },
      { status: 502 },
    )
  }

  if (parsed.data.quoteId) {
    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({ status: "sent", last_sent_at: parsed.data.sentAt ?? now })
      .eq("id", parsed.data.quoteId)
      .eq("booking_id", bookingId)

    if (quoteUpdateError) return safeSupabaseError("correspondence:update-quote", quoteUpdateError)

    await writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Quote",
      entityId: parsed.data.quoteId,
      action: "quote_sent",
      after: { status: "sent", sent_at: parsed.data.sentAt ?? now } as Json,
    })
  }

  if (parsed.data.voucherId) {
    const { error: voucherUpdateError } = await supabase
      .from("vouchers")
      .update({ sent_at: parsed.data.sentAt ?? now })
      .eq("id", parsed.data.voucherId)
      .eq("booking_id", bookingId)

    if (voucherUpdateError) {
      console.error("correspondence:update-voucher", voucherUpdateError)
    }
  }

  const sentAction = correspondenceSentAuditAction(parsed.data.kind, parsed.data.moveStage)
  if (sentAction && sentAction !== "quote_sent") {
    await writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Booking",
      entityId: bookingId,
      action: sentAction,
      after: {
        correspondence_id: cor.id,
        kind: parsed.data.kind ?? null,
        subject,
        sent_at: cor.sent_at,
      },
    })
  }

  if ((parsed.data.attachments?.length ?? 0) > 0) {
    await writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Booking",
      entityId: bookingId,
      action: "attachment_uploaded",
      meta: {
        correspondence_id: cor.id,
        attachment_count: parsed.data.attachments?.length ?? 0,
        filenames: parsed.data.attachments?.map((attachment) => attachment.filename) ?? [],
      },
    })
  }

  if (parsed.data.moveStage && booking.stage !== parsed.data.moveStage) {
    const targetStage = parsed.data.moveStage
    const fromStage = booking.stage as PipelineStage

    const [quotesRes, documentsRes, correspondencesRes] = await Promise.all([
      supabase.from("quotes").select("id, status, total, created_at").eq("booking_id", bookingId),
      supabase.from("documents").select("id, kind, status").eq("booking_id", bookingId),
      supabase
        .from("correspondences")
        .select("id, kind, subject, status")
        .eq("booking_id", bookingId),
    ])

    if (quotesRes.error) return safeSupabaseError("correspondence:load-quotes", quotesRes.error)
    if (documentsRes.error) return safeSupabaseError("correspondence:load-documents", documentsRes.error)
    if (correspondencesRes.error) return safeSupabaseError("correspondence:load-correspondences", correspondencesRes.error)

    try {
      await applyTransition(supabase, {
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
        departureDate: booking.departure_date,
        durationNights: booking.duration_nights,
        targetStage,
        actorName: profile.actorName,
        actorUserId: auth.value.user.id,
        quotes: quotesRes.data ?? [],
        documents: documentsRes.data ?? [],
        correspondences: correspondencesRes.data ?? [],
      })
    } catch (transitionError) {
      return safeSupabaseError("correspondence:apply-transition", transitionError)
    }

    const { error: historyError } = await supabase.from("pipeline_history").insert({
      booking_id: bookingId,
      from_stage: fromStage,
      to_stage: targetStage,
      moved_by: profile.actorName,
      moved_by_user_id: auth.value.user.id,
    })
    if (historyError) return safeSupabaseError("correspondence:pipeline-history", historyError)

    const { error: auditError } = await writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Booking",
      entityId: bookingId,
      action: "stage_change",
      before: { stage: fromStage } as Json,
      after: { stage: targetStage } as Json,
    })
    if (auditError) return safeSupabaseError("correspondence:audit", auditError)
  }

  // Draft a scheduled follow-up 48h out — quote emails only, composed from the
  // editable follow_up template so the draft is a real, sendable email.
  if (parsed.data.kind === "quote") {
    const customerName =
      [customerRecord?.first_name, customerRecord?.last_name].filter(Boolean).join(" ").trim() ||
      "Valued Guest"
    const followUp = await composeEmail(supabase, "follow_up", {
      tokens: {
        customerName,
        jobNumber: booking.booking_number,
        lastSentDate: formatDisplayDate((parsed.data.sentAt ?? now).slice(0, 10)),
      },
    })

    if (followUp) {
      await supabase.from("correspondences").insert({
        booking_id: bookingId,
        channel: "email",
        kind: "quote_follow_up",
        subject: followUp.subject,
        body_html: followUp.bodyHtml,
        status: "scheduled",
        scheduled_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        recipients: recipientsArray,
      })
    }
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
    recipients: cor.recipients,
  })
}
