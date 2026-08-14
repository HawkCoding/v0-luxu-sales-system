import { z } from "zod"
import { writeAuditLog } from "@/lib/audit-write"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong, formatDisplayDateTime } from "@/lib/date-format"
import { getEmailFromAddress } from "@/lib/email/from"
import { resolveSalespersonSender, type ResolvedSenderReason } from "@/lib/email/resolve-sender"
import { isFallbackSendingUnavailable, sendEmail } from "@/lib/email/transport"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { validateTransition } from "@/lib/pipeline/validate-transition"
import { loadLibraryAttachments } from "@/lib/attachments/email-attachment-library"
import { ensureQuotePdf, QUOTE_BUCKET } from "@/lib/quotes/ensure-quote-pdf"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import type { Json } from "@/lib/supabase/types"
import type { PipelineStage } from "@/lib/types"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import {
  findMissingQuotedLegs,
  resolveAcceptedQuoteScope,
  scopeLegIdsFilter,
} from "@/lib/quotes/accepted-quote-scope"
import { loadLegReferenceRows, missingLegReferenceLabels } from "@/lib/voucher/leg-references"

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
    libraryAttachmentIds: z.array(z.string().uuid()).max(10).optional(),
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

function unconfiguredSenderMessage(reason: ResolvedSenderReason): string {
  switch (reason) {
    case "no-salesperson":
      return "This booking has no assigned salesperson, so there is no mailbox to send from. Assign a salesperson, then resend."
    case "lookup-failed":
      return "The sending mailbox could not be resolved. Contact an administrator."
    default:
      return "No email account is configured for this booking's salesperson. Add their SMTP credentials in Settings, then resend."
  }
}

function isVoucherSend(kind: string | null | undefined, moveStage: PipelineStage | undefined): boolean {
  return kind?.toLowerCase() === "voucher" || moveStage === "voucher_sent"
}

// These three "send & move stage" buttons (deposit invoice, reservation-form
// acknowledgement, voucher) call applyTransition directly instead of the
// gated PATCH /api/jobs/[id] route, so validateTransition's gates never ran
// for them — a booking could be moved forward with no invoice number, an
// incomplete customer record, or an unresolved email-import flag. quote_sent
// is deliberately excluded: it's the first outbound touch, before customer
// details are necessarily complete.
const PRE_SEND_GATED_STAGES = new Set<PipelineStage>(["accepted", "deposit_requested", "voucher_sent"])

// Only these gates are (re-)enforced pre-send: they depend solely on data
// that exists before this request, never on the send/transition this
// request itself performs — unlike e.g. "reservation form received" or
// "voucher correspondence sent", which these very sends are what satisfy.
const PRE_SEND_GATE_IDS = new Set(["customer_complete", "email_import_review", "invoice_number_required"])

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
      "id, booking_number, stage, source, raw_text, updated_at, customer_id, consultant, departure_date, duration_nights, invoice_balance, assigned_salesperson_id, customer_invoice_number, email_import_needs_review, email_import_review_resolved_at, reservation_form_received_at, customer:customers(email, title, first_name, last_name, phone, country)",
    )
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return jsonError("Booking not found", 404)
  }

  const customerRecord = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer

  if (
    parsed.data.moveStage &&
    booking.stage !== parsed.data.moveStage &&
    PRE_SEND_GATED_STAGES.has(parsed.data.moveStage)
  ) {
    const gateFailures = validateTransition({
      booking: {
        id: booking.id,
        stage: booking.stage as PipelineStage,
        source: booking.source,
        email_import_needs_review: booking.email_import_needs_review,
        email_import_review_resolved_at: booking.email_import_review_resolved_at,
        customer_invoice_number: booking.customer_invoice_number,
      },
      customer: customerRecord ?? null,
      targetStage: parsed.data.moveStage,
    }).filter((failure) => PRE_SEND_GATE_IDS.has(failure.gateId))

    if (gateFailures.length > 0) {
      return jsonError("Stage transition blocked", 400, { failures: gateFailures })
    }
  }

  if (isVoucherSend(parsed.data.kind, parsed.data.moveStage)) {
    // Scoped to the accepted quote, matching the generate and prepare-send gates — a service
    // the customer never bought must not hold up the voucher send.
    let legReferenceRows: Awaited<ReturnType<typeof loadLegReferenceRows>> = []
    let missingQuotedLegLabels: string[] = []
    try {
      const quoteScope = await resolveAcceptedQuoteScope(supabase, booking.id)
      missingQuotedLegLabels = await findMissingQuotedLegs(supabase, booking.id, quoteScope)
      legReferenceRows = await loadLegReferenceRows(supabase, booking.id, {
        legIds: scopeLegIdsFilter(quoteScope),
      })
    } catch (error) {
      return safeSupabaseError("correspondence:load-leg-references", error)
    }

    const readiness = checkVoucherReadiness({
      stage: booking.stage,
      invoiceBalance: booking.invoice_balance !== null ? Number(booking.invoice_balance) : null,
      departureDate: booking.departure_date,
      customerEmail: customerRecord?.email ?? null,
      missingLegReferenceLabels: missingLegReferenceLabels(legReferenceRows),
      missingQuotedLegLabels,
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

  // Nothing can deliver this email — say why now, before rendering a PDF and
  // failing on a socket error deep inside the transport.
  if (!sender.salespersonCredentialId && isFallbackSendingUnavailable()) {
    return jsonError(unconfiguredSenderMessage(sender.reason), 503)
  }

  const from = sender.fromAddress ?? (await getEmailFromAddress(supabase))
  const subject = parsed.data.subject.trim()
  const bodyHtml = parsed.data.bodyHtml?.trim() || null
  const text = parsed.data.text?.trim() || (bodyHtml ? getPlainTextFromHtml(bodyHtml) : null)

  const baseAttachments: NonNullable<typeof parsed.data.attachments> = parsed.data.attachments ?? []

  if (parsed.data.kind === "quote" && parsed.data.quoteId) {
    // A quote email must always carry its PDF — re-render on every send so the
    // attachment reflects the current layout and quote data.
    let storagePath: string
    let attachmentFilename: string
    try {
      const ensured = await ensureQuotePdf(supabase, parsed.data.quoteId, {
        actorName: profile.actorName,
        actorUserId: auth.value.user.id,
        force: true,
      })
      storagePath = ensured.storagePath
      attachmentFilename = ensured.attachmentFilename
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
    baseAttachments.unshift({
      filename: attachmentFilename,
      contentBase64: Buffer.from(arrayBuffer).toString("base64"),
      contentType: "application/pdf",
    })
  }

  // Library files the salesperson ticked in the send dialog (reservation
  // forms, fact sheets, ...). A missing file blocks the send rather than
  // quietly emailing without it.
  let libraryFilenames: string[] = []
  if (parsed.data.libraryAttachmentIds?.length) {
    try {
      const libraryAttachments = await loadLibraryAttachments(
        supabase,
        parsed.data.libraryAttachmentIds,
      )
      libraryFilenames = libraryAttachments.map((attachment) => attachment.filename)
      baseAttachments.push(...libraryAttachments)
    } catch (err) {
      console.error("correspondence:library-attachments", err)
      const message =
        err instanceof Error ? err.message : "Attachments could not be loaded — email not sent"
      return jsonError(message, 502)
    }
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

  // Sending the acknowledgement is the moment the reservation form is, in fact, received. The
  // client also PATCHes the booking after a successful send; this is the server-side backstop so
  // the pipeline gate at lib/pipeline/validate-transition.ts never depends on that second call
  // landing. Only ever fills a blank — it must not overwrite an earlier, hand-entered date.
  if (parsed.data.kind === "reservation_received" && !booking.reservation_form_received_at) {
    const { error: receivedStampError } = await supabase
      .from("bookings")
      .update({ reservation_form_received_at: parsed.data.sentAt ?? now })
      .eq("id", bookingId)
      .is("reservation_form_received_at", null)

    if (receivedStampError) {
      console.error("correspondence:stamp-reservation-form-received", receivedStampError)
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

  const auditedFilenames = [
    ...(parsed.data.attachments?.map((attachment) => attachment.filename) ?? []),
    ...libraryFilenames,
  ]
  if (auditedFilenames.length > 0) {
    await writeAuditLog(supabase, {
      actor: profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Booking",
      entityId: bookingId,
      action: "attachment_uploaded",
      meta: {
        correspondence_id: cor.id,
        attachment_count: auditedFilenames.length,
        filenames: auditedFilenames,
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
          assigned_salesperson_id: booking.assigned_salesperson_id,
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
    const customerName = formatCustomerSalutation(customerRecord) || "Valued Guest"
    const shared = await resolveSharedEmailTokens(supabase, booking.id)
    const followUp = await composeEmail(supabase, "follow_up", {
      tokens: {
        ...shared.tokens,
        customerName,
        jobNumber: booking.booking_number,
        lastSentDate: formatDisplayDateLong((parsed.data.sentAt ?? now).slice(0, 10)),
      },
      blocks: shared.blocks,
      senderProfileId: booking.assigned_salesperson_id ?? auth.value.user.id,
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
