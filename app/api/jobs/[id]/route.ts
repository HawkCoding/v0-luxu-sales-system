import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { staleVersionResponse } from "@/lib/concurrency"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import type { PipelineStage } from "@/lib/types"
import { extractRoleFromJwt } from "@/lib/role-utils"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { validateTransition } from "@/lib/pipeline/validate-transition"
import { mapBookingTransportRequest } from "@/lib/suppliers"

const pipelineStageSchema = z.enum([
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
])

const patchJobSchema = z.object({
  resolveEmailImportReview: z.boolean().optional(),
  stage: pipelineStageSchema.optional(),
  override: z.boolean().optional(),
  overrideReason: z.string().optional(),
  closedReopenReason: z.string().optional(),
  cancelReason: z.string().optional(),
  manualConfirmations: z
    .object({
      createDepositInvoice: z.boolean().optional(),
      depositReceived: z.boolean().optional(),
      finalPaymentReceived: z.boolean().optional(),
    })
    .optional(),
  lostContext: z
    .object({
      cancelReason: z.string().nullable().optional(),
      refundStatus: z.enum(["refunded", "not_refunded"]).nullable().optional(),
      refundAmount: z.number().nullable().optional(),
      refundReference: z.string().nullable().optional(),
      refundedAt: z.string().nullable().optional(),
    })
    .optional(),
  ownerUser: z.string().optional(),
  consultant: z.string().optional(),
  customerId: z.string().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).passthrough()

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()

  const { data: booking } = await supabase
    .from("bookings")
    .select("*, route:routes(id, name)")
    .eq("id", id)
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [
    { data: customer },
    { data: bookingSuites },
    { data: travellers },
    { data: transportRequestsData },
    { data: itinerariesData },
    { data: quotesData },
    { data: quoteLineItemsData },
    { data: paymentsData },
    { data: documentsData },
    { data: correspondenceData },
    { data: auditData },
  ] = await Promise.all([
    supabase.from("customers").select("*").eq("id", booking.customer_id).single(),
    supabase.from("booking_suites").select("*").eq("booking_id", id),
    supabase.from("travellers").select("*").eq("booking_id", id).order("sort_order"),
    supabase.from("booking_transport_requests").select("*").eq("booking_id", id).order("sort_order"),
    supabase.from("itineraries").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("quotes").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("quote_line_items").select("*").order("sort_order"),
    supabase.from("payments").select("*").eq("booking_id", id).order("received_at"),
    supabase.from("documents").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("correspondences").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
  ])

  // Map booking → shape matching the existing Job interface so page components are unchanged
  const job = {
    id: booking.id,
    jobNumber: booking.booking_number,
    customerId: booking.customer_id,
    stage: booking.stage,
    purpose: booking.purpose,
    source: booking.source,
    ownerUser: booking.consultant ?? "consultant",
    consultant: booking.consultant,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    createdAtDisplay: formatDisplayDateTime(booking.created_at),
    updatedAtDisplay: formatDisplayDateTime(booking.updated_at),
    cancelReason: booking.cancel_reason ?? null,
    cancelledAt: booking.cancelled_at ?? null,
    cancelledAtDisplay: formatDisplayDateTime(booking.cancelled_at),
  }

  // Map customer
  const customerOut = customer
    ? {
        id: customer.id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        country: customer.country,
        title: customer.title,
        createdAt: customer.created_at,
        createdAtDisplay: formatDisplayDateTime(customer.created_at),
      }
    : null

  // Construct synthetic Enquiry object from booking + related tables for backward compat
  const adultTravellers = (travellers ?? []).filter((t) => !t.is_child)
  const childTravellers = (travellers ?? []).filter((t) => t.is_child)
  const suiteTypeNames = (bookingSuites ?? []).map((s) => s.suite_type_name ?? "").filter(Boolean)

  const enquiry = {
    id: booking.id,
    jobId: booking.id,
    source: booking.source,
    purpose: booking.purpose,
    rawText: booking.raw_text ?? undefined,
    extractedJson: booking.extracted_json ?? undefined,
    emailImportNeedsReview: booking.email_import_needs_review,
    emailImportMissingFields: booking.email_import_missing_fields,
    emailImportWarnings: booking.email_import_warnings,
    emailImportDuplicateOfBookingId: booking.email_import_duplicate_of_booking_id,
    emailImportSubject: booking.email_import_subject,
    emailImportMailbox: booking.email_import_mailbox,
    emailImportReceivedAt: booking.email_import_received_at,
    emailImportReceivedAtDisplay: formatDisplayDateTime(booking.email_import_received_at),
    emailImportRawPreview: booking.email_import_raw_preview,
    title: customer?.title ?? "",
    name: customer?.first_name ?? "",
    surname: customer?.last_name ?? "",
    contactNumber: customer?.phone ?? "",
    email: customer?.email ?? "",
    country: customer?.country ?? "",
    direction: (booking.route as { name?: string } | null)?.name ?? "",
    departureDate: booking.departure_date ?? "",
    departureDateDisplay: formatDisplayDate(booking.departure_date),
    noOfSuites: booking.no_of_suites,
    noOfAdults: booking.no_of_adults,
    noOfChildren: booking.no_of_children,
    childAges: booking.child_ages ?? [],
    suiteTypes: suiteTypeNames,
    extendStay: booking.extend_stay ? "Yes" : undefined,
    extraNights: booking.extra_nights ?? undefined,
    additionalServices: booking.additional_services ? "Yes" : undefined,
    additionalServicesDetails: booking.additional_services_details ?? undefined,
    promotionCode: booking.promotion_code ?? undefined,
    transportRequests: (transportRequestsData ?? []).map(mapBookingTransportRequest),
    termsAccepted: booking.terms_accepted,
    createdAt: booking.created_at,
    createdAtDisplay: formatDisplayDateTime(booking.created_at),
    travellers: adultTravellers.map((t) => ({
      prefix: t.prefix ?? "",
      name: t.first_name,
      surname: t.last_name,
      idPassport: t.id_passport ?? "",
      dateOfBirth: t.date_of_birth ?? "",
      dateOfBirthDisplay: formatDisplayDate(t.date_of_birth),
    })),
    childTravellers: childTravellers.map((t) => ({
      prefix: t.prefix ?? "",
      name: t.first_name,
      surname: t.last_name,
      idPassport: t.id_passport ?? "",
      dateOfBirth: t.date_of_birth ?? "",
      dateOfBirthDisplay: formatDisplayDate(t.date_of_birth),
    })),
  }

  // Map itineraries
  const itineraries = (itinerariesData ?? []).map((i) => ({
    id: i.id,
    jobId: i.booking_id,
    name: i.name,
    notes: i.notes ?? "",
    acceptedAt: i.accepted_at ?? undefined,
    acceptedAtDisplay: formatDisplayDateTime(i.accepted_at),
  }))

  // Map quotes with embedded line items
  const quotes = (quotesData ?? []).map((q) => ({
    id: q.id,
    itineraryId: q.itinerary_id ?? "",
    jobId: q.booking_id,
    status: q.status,
    validityUntil: q.validity_until ?? "",
    validityUntilDisplay: formatDisplayDate(q.validity_until),
    subtotal: q.subtotal,
    vat: q.vat,
    total: q.total,
    updatedAt: q.updated_at,
    updatedAtDisplay: formatDisplayDateTime(q.updated_at),
    lastSentAt: q.last_sent_at ?? undefined,
    lastSentAtDisplay: formatDisplayDateTime(q.last_sent_at),
    overridePin: q.override_pin ?? undefined,
    overrideReason: q.override_reason ?? undefined,
    lineItems: (quoteLineItemsData ?? [])
      .filter((li) => li.quote_id === q.id)
      .map((li) => ({
        description: li.description,
        qty: li.qty,
        unitPrice: li.unit_price,
        total: li.total,
      })),
  }))

  // Map payments
  const payments = (paymentsData ?? []).map((p) => ({
    id: p.id,
    jobId: p.booking_id,
    amount: p.amount,
    receivedAt: p.received_at,
    receivedAtDisplay: formatDisplayDateTime(p.received_at),
    method: p.method ?? "",
    reference: p.reference ?? "",
    notes: p.notes ?? "",
  }))

  // Map documents
  const documents = (documentsData ?? []).map((d) => ({
    id: d.id,
    jobId: d.booking_id,
    kind: d.kind,
    status: d.status,
    storagePath: d.storage_path,
    generatedAt: d.created_at,
    generatedAtDisplay: formatDisplayDateTime(d.created_at),
    urlOrBlobRef: d.storage_path ?? "",
  }))

  // Map correspondence
  const correspondence = (correspondenceData ?? []).map((c) => ({
    id: c.id,
    jobId: c.booking_id,
    channel: c.channel,
    kind: c.kind,
    subject: c.subject,
    bodyHtml: c.body_html ?? "",
    status: c.status,
    sentAt: c.sent_at ?? undefined,
    sentAtDisplay: formatDisplayDateTime(c.sent_at),
    scheduledAt: c.scheduled_at ?? undefined,
    scheduledAtDisplay: formatDisplayDateTime(c.scheduled_at),
    error: c.error ?? undefined,
  }))

  // Map audit logs
  const auditLogs = (auditData ?? []).map((a) => ({
    id: a.id,
    actor: a.actor,
    entityType: a.entity_type,
    entityId: a.entity_id,
    action: a.action,
    beforeJson: a.before_json ? JSON.stringify(a.before_json) : undefined,
    afterJson: a.after_json ? JSON.stringify(a.after_json) : undefined,
    metaJson: a.meta_json ? JSON.stringify(a.meta_json) : undefined,
    createdAt: a.created_at,
    createdAtDisplay: formatDisplayDateTime(a.created_at),
  }))

  return NextResponse.json({
    job,
    customer: customerOut,
    enquiry,
    itineraries,
    quotes,
    payments,
    documents,
    correspondence,
    auditLogs,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: z.infer<typeof patchJobSchema>
  try {
    body = patchJobSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, stage, booking_number, customer_id, consultant, source, raw_text, email_import_needs_review, email_import_review_resolved_at, updated_at",
    )
    .eq("id", id)
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== booking.updated_at) {
    return staleVersionResponse("booking", booking.updated_at)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.resolveEmailImportReview === true) {
    updates.email_import_needs_review = false
    updates.email_import_review_resolved_at = new Date().toISOString()
    updates.email_import_review_resolved_by = user?.id ?? null

    await supabase.from("audit_logs").insert({
      actor: user?.email ?? "System",
      actor_user_id: user?.id ?? null,
      entity_type: "Booking",
      entity_id: id,
      action: "email_import_review_resolved",
      before_json: { email_import_needs_review: booking.email_import_needs_review },
      after_json: { email_import_needs_review: false },
    })
  }

  let stageUpdated:
    | {
        id: string
        booking_number: string
        stage: string
        consultant: string | null
        cancel_reason: string | null
        cancelled_at: string | null
        updated_at: string
      }
    | null = null

  if (body.stage) {
    const fromStage = booking.stage as PipelineStage
    const targetStage = body.stage as PipelineStage
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, surname, clearance_level")
      .eq("user_id", user.id)
      .maybeSingle()

    const profileName = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim()
    const actorName = profileName || user.email || "System"
    const role = extractRoleFromJwt(user) ?? profile?.clearance_level ?? null
    const isManager = role === "manager" || role === "admin"
    const overrideReason = body.overrideReason?.trim() ?? ""
    const lostContext = {
      ...body.lostContext,
      cancelReason: body.lostContext?.cancelReason ?? body.cancelReason ?? null,
    }

    const [
      { data: customer },
      { data: quotes },
      { data: documents },
      { data: correspondences },
      { data: payments },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("first_name, last_name, email, phone, country")
        .eq("id", booking.customer_id)
        .maybeSingle(),
      supabase
        .from("quotes")
        .select("id, status, total, created_at")
        .eq("booking_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("documents").select("id, kind, status").eq("booking_id", id),
      supabase.from("correspondences").select("id, kind, subject, status").eq("booking_id", id),
      supabase.from("payments").select("amount").eq("booking_id", id),
    ])

    const validationBooking = {
      id: booking.id,
      stage: fromStage,
      source: booking.source,
      email_import_needs_review:
        body.resolveEmailImportReview === true ? false : booking.email_import_needs_review,
      email_import_review_resolved_at:
        body.resolveEmailImportReview === true
          ? new Date().toISOString()
          : booking.email_import_review_resolved_at,
    }
    const failures = validateTransition({
      booking: validationBooking,
      customer,
      targetStage,
      quotes: quotes ?? [],
      documents: documents ?? [],
      correspondences: correspondences ?? [],
      manualConfirmations: body.manualConfirmations,
      lostContext,
    })

    if (body.override === true) {
      if (!isManager) {
        return NextResponse.json({ error: "Manager access required for override" }, { status: 403 })
      }
      if (!overrideReason) {
        return NextResponse.json({ error: "Override reason is required" }, { status: 400 })
      }
    } else if (failures.length > 0) {
      return NextResponse.json({ failures, isManager }, { status: 422 })
    }

    if (fromStage === "closed" && targetStage !== "closed" && !body.closedReopenReason?.trim()) {
      return NextResponse.json({ error: "Reason required when reopening a closed booking" }, { status: 400 })
    }

    try {
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
        targetStage,
        actorName,
        actorUserId: user.id,
        expectedUpdatedAt: body.expectedUpdatedAt,
        manualConfirmations: body.manualConfirmations,
        lostContext,
        quotes: quotes ?? [],
        documents: documents ?? [],
        correspondences: correspondences ?? [],
      })

      stageUpdated = transition.updated
      if (body.expectedUpdatedAt) {
        body.expectedUpdatedAt = transition.updated.updated_at
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Stage update failed" },
        { status: 500 },
      )
    }

    const historyInsert = await supabase.from("pipeline_history").insert({
      booking_id: id,
      from_stage: fromStage,
      to_stage: targetStage,
      moved_by: actorName,
      moved_by_user_id: user.id,
    })
    if (historyInsert.error) return NextResponse.json({ error: historyInsert.error.message }, { status: 500 })

    const stageAudit = await supabase.from("audit_logs").insert({
      actor: actorName,
      actor_user_id: user.id,
      entity_type: "Booking",
      entity_id: id,
      action: "stage_change",
      before_json: { stage: fromStage },
      after_json: {
        stage: targetStage,
        ...(lostContext.cancelReason ? { cancel_reason: lostContext.cancelReason } : {}),
      },
      meta_json: {
        payments_seen: payments?.length ?? 0,
        manual_confirmations: body.manualConfirmations ?? null,
      } as Json,
    })
    if (stageAudit.error) return NextResponse.json({ error: stageAudit.error.message }, { status: 500 })

    if (body.override === true) {
      const overrideAudit = await supabase.from("audit_logs").insert({
        actor: actorName,
        actor_user_id: user.id,
        entity_type: "Booking",
        entity_id: id,
        action: "stage_change_override",
        before_json: { stage: fromStage, gates_failed: failures.map((failure) => failure.gateId) },
        after_json: { stage: targetStage },
        override_reason: overrideReason,
        overridden_by: user.id,
        meta_json: {
          failures: failures.map((failure) => ({
            gateId: failure.gateId,
            message: failure.message,
            fixHint: failure.fixHint,
            severity: failure.severity,
            autoFixable: failure.autoFixable ?? null,
          })),
        } as Json,
      })
      if (overrideAudit.error) return NextResponse.json({ error: overrideAudit.error.message }, { status: 500 })
    }

    if (fromStage === "closed" && targetStage !== "closed") {
      const reopenAudit = await supabase.from("audit_logs").insert({
        actor: actorName,
        actor_user_id: user.id,
        entity_type: "Booking",
        entity_id: id,
        action: "closed_booking_reopened",
        before_json: { stage: fromStage },
        after_json: { stage: targetStage },
        meta_json: { reason: body.closedReopenReason?.trim() },
      })
      if (reopenAudit.error) return NextResponse.json({ error: reopenAudit.error.message }, { status: 500 })
    }
  }

  if (body.ownerUser) updates.consultant = body.ownerUser
  if (body.consultant) updates.consultant = body.consultant

  if (typeof body.customerId === "string" && body.customerId.trim() && body.customerId !== booking.customer_id) {
    const { data: targetCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", body.customerId)
      .maybeSingle()

    if (!targetCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    updates.customer_id = targetCustomer.id

    await supabase.from("audit_logs").insert({
      actor: user?.email ?? "System",
      actor_user_id: user?.id ?? null,
      entity_type: "Booking",
      entity_id: id,
      action: "customer_reassigned",
      before_json: { customer_id: booking.customer_id },
      after_json: { customer_id: targetCustomer.id },
    })
  }

  if (stageUpdated && Object.keys(updates).length === 1) {
    return NextResponse.json({
      id: stageUpdated.id,
      jobNumber: stageUpdated.booking_number,
      stage: stageUpdated.stage,
      consultant: stageUpdated.consultant,
      cancelReason: stageUpdated.cancel_reason ?? null,
      cancelledAt: stageUpdated.cancelled_at ?? null,
      updatedAt: stageUpdated.updated_at,
      updatedAtDisplay: formatDisplayDateTime(stageUpdated.updated_at),
    })
  }

  if (stageUpdated) {
    updates.updated_at = new Date().toISOString()
  }

  let updateQuery = supabase
    .from("bookings")
    .update(updates)
    .eq("id", id)

  if (body.expectedUpdatedAt) {
    updateQuery = updateQuery.eq("updated_at", body.expectedUpdatedAt)
  }

  const { data: updated, error } = await updateQuery
    .select()
    .single()

  if (!updated && body.expectedUpdatedAt) {
    const { data: current } = await supabase
      .from("bookings")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle()

    return staleVersionResponse("booking", current?.updated_at ?? booking.updated_at)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id: updated.id,
    jobNumber: updated.booking_number,
    stage: updated.stage,
    consultant: updated.consultant,
    cancelReason: updated.cancel_reason ?? null,
    cancelledAt: updated.cancelled_at ?? null,
    updatedAt: updated.updated_at,
    updatedAtDisplay: formatDisplayDateTime(updated.updated_at),
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_number, source, stage")
    .eq("id", id)
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (booking.source !== "email" || booking.stage !== "enquiry") {
    return NextResponse.json(
      { error: "Only email-imported enquiries can be rejected from this action" },
      { status: 400 },
    )
  }

  await supabase.from("audit_logs").insert({
    actor: user.email ?? "System",
    actor_user_id: user.id,
    entity_type: "Booking",
    entity_id: id,
    action: "email_import_rejected_deleted",
    meta_json: { booking_number: booking.booking_number },
  })

  const { error } = await supabase.from("bookings").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
