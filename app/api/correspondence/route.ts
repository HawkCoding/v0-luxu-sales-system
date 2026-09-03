import { z } from "zod"
import { writeAuditLog } from "@/lib/audit-write"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDateLong, formatDisplayDateTime } from "@/lib/date-format"
import { getEmailFromAddress } from "@/lib/email/from"
import { resolveSalespersonSender, type ResolvedSenderReason } from "@/lib/email/resolve-sender"
import { isFallbackSendingUnavailable, sendEmail } from "@/lib/email/transport"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { staleVersionResponse } from "@/lib/concurrency"
import {
  applyGatedTransition,
  decideGatedTransition,
  loadTransitionContext,
} from "@/lib/pipeline/run-gated-transition"
import type { GateFailure } from "@/lib/pipeline/validate-transition"
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
import { loadQuoteConfig, overridesFromQuoteRow } from "@/lib/quotes/load-quote-config"
import type { PricingSnapshot } from "@/lib/types"

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
    /** Same three fields PATCH /api/jobs/[id] takes, so a send-and-move can clear a `confirm`
     * gate or record a deliberate bypass instead of being the way around the gates entirely. */
    manualConfirmations: z.object({ finalPaymentReceived: z.boolean().optional() }).optional(),
    override: z.boolean().optional(),
    overrideReason: z.string().trim().min(1).max(500).optional(),
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

// A "send & move stage" request is gated twice, because the two halves ask different questions.
//
// Pre-send (this set) are the gates whose evidence must already exist — nothing this request does
// can satisfy them. Checking them first means an email is never sent for a move that is about to be
// refused. `deposit_received_confirmation` is the one that matters most and was missing entirely:
// QA was refused `deposit_paid` by PATCH /api/jobs/[id] for having no payment on file, then made
// the identical move through this route a second later, because this route only gated three target
// stages and only five gate ids.
//
// Everything else — "the voucher email was sent", "the invoice was sent" — is satisfied *by* this
// very request, so it can only be judged after the correspondence row exists. That is the full
// validateTransition run further down, which is now the real enforcement point.
const PRE_SEND_GATE_IDS = new Set([
  "customer_complete",
  "email_import_review",
  "invoice_number_required",
  "quote_sent_required",
  "quote_sent_or_accepted",
  // The gate QA got past. A payment on file is not something an email can conjure, so it belongs
  // here — and `deposit_paid` was not even in the old target-stage list, which is why the move
  // went through with none.
  "deposit_received_confirmation",
])

// quote_sent is the first outbound touch: the quote gates cannot hold before the send that is
// itself the sending of the quote, and customer details need not be complete yet. Applied to both
// checks — an exemption that held only pre-send would just move the same wrong block later.
const QUOTE_SEND_EXEMPT_GATE_IDS = new Set([
  "customer_complete",
  "quote_sent_required",
  "quote_sent_or_accepted",
])

function gatesFor(failures: GateFailure[], targetStage: PipelineStage): GateFailure[] {
  if (targetStage !== "quote_sent") return failures
  return failures.filter((failure) => !QUOTE_SEND_EXEMPT_GATE_IDS.has(failure.gateId))
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
      "id, booking_number, stage, source, raw_text, updated_at, customer_id, consultant, departure_date, duration_nights, invoice_balance, assigned_salesperson_id, customer_invoice_number, email_import_needs_review, email_import_review_resolved_at, reservation_form_received_at, revision_reset_at, customer:customers(email, title, first_name, last_name, phone, country)",
    )
    .eq("id", bookingId)
    .single()

  if (bookingError || !booking) {
    return jsonError("Booking not found", 404)
  }

  const customerRecord = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer

  const movingStage = Boolean(parsed.data.moveStage && booking.stage !== parsed.data.moveStage)
  const transitionBooking = {
    id: booking.id,
    stage: booking.stage as PipelineStage,
    source: booking.source,
    email_import_needs_review: booking.email_import_needs_review,
    email_import_review_resolved_at: booking.email_import_review_resolved_at,
    customer_invoice_number: booking.customer_invoice_number,
    reservation_form_received_at: booking.reservation_form_received_at,
    revision_reset_at: booking.revision_reset_at,
  }

  if (movingStage && parsed.data.moveStage) {
    // The full evidence set, not just quotes: the gate that refuses `deposit_paid` without a
    // recorded payment reads `payments`, which this route never loaded, so it could never fire.
    const gateContext = await loadTransitionContext(supabase, {
      bookingId,
      customerId: booking.customer_id,
      fromStage: booking.stage as PipelineStage,
      targetStage: parsed.data.moveStage,
    })

    const preSendDecision = decideGatedTransition({
      booking: transitionBooking,
      customer: customerRecord ?? null,
      targetStage: parsed.data.moveStage,
      context: gateContext,
      manualConfirmations: parsed.data.manualConfirmations,
      override: parsed.data.override,
    })
    const gateFailures = gatesFor(preSendDecision.failures, parsed.data.moveStage).filter((failure) =>
      PRE_SEND_GATE_IDS.has(failure.gateId),
    )

    if (gateFailures.length > 0 && parsed.data.override !== true) {
      return jsonError("Stage transition blocked", 400, { failures: gateFailures, canOverride: true })
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

  // A quote whose lines are not all priced totals as though the unpriced ones were zero
  // (calculateQuoteTotals sums item.total unconditionally). The consultant's screen says so
  // loudly, but the client document does not — so the send is refused rather than mailing a
  // total that is quietly short. Rendering a PDF or an email preview stays allowed: those are
  // the consultant checking their own work, and neither reaches the customer.
  if (parsed.data.kind === "quote" && parsed.data.quoteId) {
    const { data: quoteRow, error: quoteStatusError } = await supabase
      .from("quotes")
      .select("status, journey_class, rate_audience, show_train_only_note")
      .eq("id", parsed.data.quoteId)
      .maybeSingle()

    if (quoteStatusError) return safeSupabaseError("correspondence:load-quote-status", quoteStatusError)
    if (!quoteRow) return jsonError("Quote not found", 404)
    if (quoteRow.status === "pricing_incomplete") {
      return jsonError(
        "This quote still has unpriced lines — price them before sending, or the total will be short.",
        409,
      )
    }

    // A train whose journey length or rate audience can't be resolved (e.g. a Rovos route with no
    // duration_days recorded) must not silently pick a side — the send is refused until a
    // consultant sets it explicitly on the quote's config panel, or the missing data is filled in.
    const { data: configLineItems, error: configLineItemsError } = await supabase
      .from("quote_line_items")
      .select("pricing_snapshot")
      .eq("quote_id", parsed.data.quoteId)
      // Ordered because the primary-supplier fallbacks are "first leg in array order".
      .order("sort_order", { ascending: true })

    if (configLineItemsError) {
      return safeSupabaseError("correspondence:load-quote-config", configLineItemsError)
    }

    const quoteConfig = await loadQuoteConfig(supabase, {
      lineItems: (configLineItems ?? []).map((li) => ({
        pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null,
      })),
      overrides: overridesFromQuoteRow(quoteRow),
      bookingId,
    })

    if (quoteConfig.unresolved.length > 0) {
      return jsonError("This quote needs configuration before it can be sent", 409, {
        failures: quoteConfig.unresolved,
      })
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

  // `recipients` stays the intended customer address — scheduled follow-ups
  // resend from it — while the stored subject carries the test-mode prefix so
  // a redirected send is never mistaken for one the customer received.
  const correspondenceValues = {
    channel: parsed.data.channel ?? "email",
    kind: parsed.data.kind ?? null,
    subject: sendResult.effectiveSubject ?? subject,
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
  let reservationFormReceivedAt = booking.reservation_form_received_at
  if (parsed.data.kind === "reservation_received" && !booking.reservation_form_received_at) {
    const { error: receivedStampError } = await supabase
      .from("bookings")
      .update({ reservation_form_received_at: parsed.data.sentAt ?? now })
      .eq("id", bookingId)
      .is("reservation_form_received_at", null)

    if (receivedStampError) {
      console.error("correspondence:stamp-reservation-form-received", receivedStampError)
    } else {
      // Carried into the gate check below: sending the acknowledgement is the moment the form is
      // received, so the `reservation_form_received` gate must judge the booking as it now is, not
      // as it was when this request started.
      reservationFormReceivedAt = parsed.data.sentAt ?? now
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

    // Re-loaded now that the correspondence row exists: the gates this send is what satisfies
    // ("the voucher email was sent", "the invoice was sent") can only see it from here.
    const context = await loadTransitionContext(supabase, {
      bookingId,
      customerId: booking.customer_id,
      fromStage,
      targetStage,
    })

    // applyTransition guards the write on this stamp, and the send above may already have bumped it
    // (the reservation-form backstop writes to the booking), so the version it gets has to be
    // re-read here rather than carried over from the load at the top of the request.
    const versionRes = await supabase.from("bookings").select("updated_at").eq("id", bookingId).maybeSingle()
    if (versionRes.error) return safeSupabaseError("correspondence:load-booking-version", versionRes.error)

    const decision = decideGatedTransition({
      booking: { ...transitionBooking, reservation_form_received_at: reservationFormReceivedAt },
      customer: customerRecord ?? null,
      targetStage,
      context,
      manualConfirmations: parsed.data.manualConfirmations,
      override: parsed.data.override,
    })

    if (decision.overriding && !parsed.data.overrideReason?.trim()) {
      return jsonError("Override reason is required", 400)
    }

    // The email is already out — it was the point of the request — so a blocked move reports both
    // facts rather than pretending the send didn't happen. The stage simply stays where it was.
    const blockingFailures = gatesFor(decision.failures, targetStage)
    if (decision.blocked && blockingFailures.length > 0) {
      return jsonError("Stage transition blocked", 400, {
        failures: blockingFailures,
        canOverride: decision.canOverride,
        correspondenceId: cor.id,
        emailSent: true,
      })
    }

    const result = await applyGatedTransition(supabase, {
      booking: {
        id: booking.id,
        booking_number: booking.booking_number,
        stage: booking.stage,
        source: booking.source,
        raw_text: booking.raw_text,
        updated_at: versionRes.data?.updated_at ?? booking.updated_at,
        customer_id: booking.customer_id,
        consultant: booking.consultant,
        assigned_salesperson_id: booking.assigned_salesperson_id,
      },
      departureDate: booking.departure_date,
      durationNights: booking.duration_nights,
      targetStage,
      actorName: profile.actorName,
      actorUserId: auth.value.user.id,
      decision,
      context,
      overrideReason: parsed.data.overrideReason?.trim(),
      manualConfirmations: parsed.data.manualConfirmations,
    })

    if (!result.ok) {
      if (result.reason === "stale") return staleVersionResponse("booking", result.currentUpdatedAt)
      return safeSupabaseError(`correspondence:transition-${result.step}`, result.error)
    }
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
      templateSupplierId: shared.primarySupplierId,
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
