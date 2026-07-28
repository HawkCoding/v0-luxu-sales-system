import { safeSupabaseError } from "@/lib/api/responses"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import {
  AUDIT_LOG_COLUMNS,
  BOOKING_SUITE_COLUMNS,
  BOOKING_TRANSPORT_REQUEST_COLUMNS,
  BOOKING_WITH_ROUTE_COLUMNS,
  CORRESPONDENCE_COLUMNS,
  CUSTOMER_COLUMNS,
  DOCUMENT_COLUMNS,
  INVOICE_COLUMNS,
  ITINERARY_COLUMNS,
  PAYMENT_COLUMNS,
  QUOTE_COLUMNS,
  QUOTE_LINE_ITEM_COLUMNS,
  TRAVELLER_COLUMNS,
} from "@/lib/supabase/columns"
import type { Json } from "@/lib/supabase/types"
import { requireUser } from "@/lib/api/auth"
import { staleVersionResponse } from "@/lib/concurrency"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { CONSULTANTS } from "@/lib/types"
import type { PipelineStage } from "@/lib/types"
import { extractRoleFromJwt } from "@/lib/role-utils"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { validateTransition } from "@/lib/pipeline/validate-transition"
import { mapBookingTransportRequest } from "@/lib/suppliers"
import { getDefaultDepositPercentage } from "@/lib/pipeline/constants"
import { updateInvoiceNumber } from "@/lib/bookings/invoice-number"
import { clientInvoiceNumber } from "@/lib/invoices/invoice-status"

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
  manualConfirmations: z
    .object({
      createDepositInvoice: z.boolean().optional(),
      createInvoiceCorrespondence: z.boolean().optional(),
      finalPaymentReceived: z.boolean().optional(),
    })
    .optional(),
  lostContext: z
    .object({
      refundStatus: z.enum(["refunded", "not_refunded"]).nullable().optional(),
      refundAmount: z.number().nullable().optional(),
      refundReference: z.string().nullable().optional(),
      refundedAt: z.string().nullable().optional(),
    })
    .optional(),
  ownerUser: z.string().optional(),
  consultant: z.string().optional(),
  reservationFormReceived: z.boolean().optional(),
  assignedSalespersonId: z.string().uuid().nullable().optional(),
  customerId: z.string().optional(),
  customerInvoiceNumber: z.string().trim().max(120).nullable().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  parsedFieldEdits: z
    .object({
      noOfAdults: z.number().int().min(0).optional(),
      noOfChildren: z.number().int().min(0).optional(),
      noOfSuites: z.number().int().min(1).optional(),
      departureDate: z.string().nullable().optional(),
    })
    .optional(),
}).passthrough()

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value

  const { data: booking } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_ROUTE_COLUMNS)
    .eq("id", id)
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const role = profile.clearanceLevel
  if (role === "readonly") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (role === "consultant") {
    const isOwner = booking.owner_user_id === user.id || booking.assigned_salesperson_id === user.id
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [
    defaultDepositPercentage,
    { data: customer },
    { data: profiles },
    { data: outcomeReasonsData },
    { data: bookingSuites },
    { data: travellers },
    { data: transportRequestsData },
    { data: itinerariesData },
    { data: quotesData },
    { data: quoteLineItemsData },
    { data: paymentsData },
    { data: invoicesData },
    { data: documentsData },
    { data: correspondenceData },
    { data: auditData },
  ] = await Promise.all([
    getDefaultDepositPercentage(supabase),
    supabase.from("customers").select(CUSTOMER_COLUMNS).eq("id", booking.customer_id).single(),
    supabase.from("profiles").select("user_id, name, surname, email, clearance_level, is_active").order("name"),
    supabase.from("outcome_reasons").select("id, label, applies_to, active").eq("active", true).order("label"),
    supabase.from("booking_suites").select(BOOKING_SUITE_COLUMNS).eq("booking_id", id),
    supabase.from("travellers").select(TRAVELLER_COLUMNS).eq("booking_id", id).order("sort_order"),
    supabase
      .from("booking_transport_requests")
      .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
      .eq("booking_id", id)
      .order("sort_order"),
    supabase.from("itineraries").select(ITINERARY_COLUMNS).eq("booking_id", id).order("created_at"),
    supabase.from("quotes").select(QUOTE_COLUMNS).eq("booking_id", id).order("created_at"),
    supabase.from("quote_line_items").select(QUOTE_LINE_ITEM_COLUMNS).order("sort_order"),
    supabase.from("payments").select(PAYMENT_COLUMNS).eq("booking_id", id).order("received_at"),
    supabase.from("invoices").select(INVOICE_COLUMNS).eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select(DOCUMENT_COLUMNS).eq("booking_id", id).order("created_at"),
    supabase.from("correspondences").select(CORRESPONDENCE_COLUMNS).eq("booking_id", id).order("created_at"),
    supabase.from("audit_logs").select(AUDIT_LOG_COLUMNS).eq("entity_id", id).order("created_at", { ascending: false }),
  ])

  // Map booking → shape matching the existing Job interface so page components are unchanged
  const allProfiles = (profiles ?? []).map((p) => ({
    id: p.user_id,
    name: [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email,
    email: p.email,
    isActive: p.is_active ?? true,
  }))
  const salespeople = (profiles ?? [])
    .filter((p) => ["admin", "manager", "consultant"].includes(p.clearance_level) && (p.is_active ?? true))
    .map((p) => ({
      id: p.user_id,
      name: [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email,
      email: p.email,
      isActive: p.is_active ?? true,
    }))
  const assignedSalesperson = booking.assigned_salesperson_id
    ? salespeople.find((profile) => profile.id === booking.assigned_salesperson_id) ?? null
    : null
  const ownerProfile = booking.owner_user_id
    ? allProfiles.find((profile) => profile.id === booking.owner_user_id) ?? null
    : null

  const job = {
    id: booking.id,
    jobNumber: booking.booking_number,
    customerId: booking.customer_id,
    stage: booking.stage,
    purpose: booking.purpose,
    source: booking.source,
    ownerUser: booking.consultant ?? "consultant",
    ownerUserId: booking.owner_user_id ?? null,
    ownerName: ownerProfile?.name ?? null,
    consultant: booking.consultant,
    assignedSalespersonId: booking.assigned_salesperson_id ?? null,
    assignedSalespersonName: assignedSalesperson?.name ?? null,
    isRepeatClientAtCreation: booking.is_repeat_client_at_creation,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    createdAtDisplay: formatDisplayDateTime(booking.created_at),
    updatedAtDisplay: formatDisplayDateTime(booking.updated_at),
    cancelledAt: booking.cancelled_at ?? null,
    cancelledAtDisplay: formatDisplayDateTime(booking.cancelled_at),
    depositPaid: booking.deposit_paid ?? false,
    reservationFormReceivedAt: booking.reservation_form_received_at ?? null,
    invoiceBalance: booking.invoice_balance !== null ? Number(booking.invoice_balance) : null,
    outcome: (booking.outcome as string) ?? "Open",
    outcomeReasonId: booking.outcome_reason_id ?? null,
    outcomeNotes: booking.outcome_notes ?? null,
    outcomeSetAt: booking.outcome_set_at ?? null,
    outcomeSetAtDisplay: formatDisplayDateTime(booking.outcome_set_at),
    outcomeSetBy: booking.outcome_set_by ?? null,
    customerInvoiceNumber: (booking as Record<string, unknown>).customer_invoice_number as string | null ?? null,
    suggestedRefund: null as number | null,
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
      companyName: customer.company_name,
      addressLine1: customer.address_line1,
      addressLine2: customer.address_line2,
      city: customer.city,
      province: customer.province,
      postalCode: customer.postal_code,
      defaultRateTypeId: customer.default_rate_type_id,
      isRepeatClient: customer.is_repeat_client,
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
    quoteNumber: q.quote_number,
    parentQuoteId: q.parent_quote_id,
    validityUntil: q.validity_until ?? "",
    validityUntilDisplay: formatDisplayDate(q.validity_until),
    subtotal: q.subtotal,
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
        supplierDescription: li.supplier_description,
        qty: li.qty,
        unitPrice: li.unit_price,
        total: li.total,
        pricingSnapshot: li.pricing_snapshot,
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
    proofStoragePath: (p as Record<string, unknown>).proof_storage_path as string | null ?? null,
  }))

  const invoices = (invoicesData ?? []).map((invoice) => ({
    id: invoice.id,
    jobId: invoice.booking_id,
    quoteId: invoice.quote_id,
    kind: invoice.kind,
    status: invoice.status,
    // Customer-facing number (salesperson-entered, falling back to the internal
    // one) — the auto -INV number is never surfaced to the front end.
    invoiceNumber: clientInvoiceNumber(booking),
    depositPercentage: invoice.deposit_percentage,
    amount: invoice.amount,
    amountDisplay: new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: invoice.currency,
      maximumFractionDigits: 2,
    }).format(invoice.amount),
    currency: invoice.currency,
    dueDate: invoice.due_date,
    dueDateDisplay: formatDisplayDate(invoice.due_date),
    sentAt: invoice.sent_at,
    sentAtDisplay: formatDisplayDateTime(invoice.sent_at),
    createdAt: invoice.created_at,
    createdAtDisplay: formatDisplayDateTime(invoice.created_at),
  }))

  // Map documents
  const documentUploaderIds = Array.from(
    new Set(
      (documentsData ?? [])
        .map((d) => (d as { uploaded_by?: string | null }).uploaded_by)
        .filter((v): v is string => Boolean(v)),
    ),
  )
  let documentUploaderMap: Record<string, string> = {}
  if (documentUploaderIds.length > 0) {
    const { data: uploaderProfiles } = await supabase
      .from("profiles")
      .select("user_id, name, surname, email")
      .in("user_id", documentUploaderIds)
    documentUploaderMap = Object.fromEntries(
      (uploaderProfiles ?? []).map((p) => [
        p.user_id,
        [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email || "Unknown",
      ]),
    )
  }

  const documents = (documentsData ?? []).map((d) => {
    const uploadedBy = (d as { uploaded_by?: string | null }).uploaded_by ?? null
    const fileName = (d as { file_name?: string | null }).file_name ?? null
    return {
      id: d.id,
      jobId: d.booking_id,
      kind: d.kind,
      status: d.status,
      storagePath: d.storage_path,
      fileName,
      uploadedBy,
      uploadedByName: uploadedBy ? documentUploaderMap[uploadedBy] ?? null : null,
      paymentId: (d as { payment_id?: string | null }).payment_id ?? null,
      generatedAt: d.created_at,
      generatedAtDisplay: formatDisplayDateTime(d.created_at),
      urlOrBlobRef: d.storage_path ?? "",
    }
  })

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
    providerMessageId: c.provider_message_id,
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

  const depositInvoice = (invoicesData ?? []).find((inv) => inv.kind === "deposit")
  const totalPaid = (paymentsData ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  if (depositInvoice !== undefined) {
    job.suggestedRefund = Math.max(0, totalPaid - Number(depositInvoice.amount))
  }

  return NextResponse.json({
    job,
    customer: customerOut,
    enquiry,
    itineraries,
    quotes,
    payments,
    invoices,
    documents,
    correspondence,
    auditLogs,
    salespeople,
    outcomeReasons: (outcomeReasonsData ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      appliesTo: r.applies_to,
      active: r.active,
    })),
    settings: {
      defaultDepositPercentage,
    },
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
      "id, stage, booking_number, customer_id, consultant, assigned_salesperson_id, source, raw_text, email_import_needs_review, email_import_review_resolved_at, reservation_form_received_at, updated_at, departure_date, duration_nights, deposit_paid, invoice_balance, no_of_adults, no_of_children, no_of_suites, customer_invoice_number",
    )
    .eq("id", id)
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: patchActorProfile } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .maybeSingle()

  const patchActorRole = extractRoleFromJwt(user) ?? patchActorProfile?.clearance_level ?? null
  if (!["admin", "manager", "consultant"].includes(patchActorRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== booking.updated_at) {
    return staleVersionResponse("booking", booking.updated_at)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.reservationFormReceived !== undefined) {
    updates.reservation_form_received_at = body.reservationFormReceived
      ? new Date().toISOString()
      : null
  }

  if (body.resolveEmailImportReview === true) {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("clearance_level")
      .eq("user_id", user.id)
      .maybeSingle()

    const role = extractRoleFromJwt(user) ?? actorProfile?.clearance_level ?? null
    if (role !== "manager" && role !== "admin") {
      return NextResponse.json({ error: "Manager access required to clear import review" }, { status: 403 })
    }

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
    const lostContext = { ...body.lostContext }

    const [
      { data: customer },
      { data: quotes },
      { data: documents },
      { data: invoices },
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
      supabase.from("invoices").select("id, kind, status").eq("booking_id", id),
      supabase.from("correspondences").select("id, kind, subject, status").eq("booking_id", id),
      supabase.from("payments").select("amount").eq("booking_id", id),
    ])

    const validationBooking = {
      id: booking.id,
      stage: fromStage,
      source: booking.source,
      customer_invoice_number: booking.customer_invoice_number,
      email_import_needs_review:
        body.resolveEmailImportReview === true ? false : booking.email_import_needs_review,
      email_import_review_resolved_at:
        body.resolveEmailImportReview === true
          ? new Date().toISOString()
          : booking.email_import_review_resolved_at,
      reservation_form_received_at:
        body.reservationFormReceived !== undefined
          ? (updates.reservation_form_received_at as string | null)
          : booking.reservation_form_received_at,
    }
    const failures = validateTransition({
      booking: validationBooking,
      customer,
      targetStage,
      quotes: quotes ?? [],
      documents: documents ?? [],
      invoices: invoices ?? [],
      correspondences: correspondences ?? [],
      payments: payments ?? [],
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
      return NextResponse.json(
        { error: "Stage transition blocked", details: { failures, isManager } },
        { status: 400 },
      )
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
        departureDate: booking.departure_date,
        durationNights: booking.duration_nights,
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
      after_json: { stage: targetStage },
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

  if (body.assignedSalespersonId !== undefined) {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("name, surname, email, clearance_level")
      .eq("user_id", user.id)
      .maybeSingle()

    const role = extractRoleFromJwt(user) ?? actorProfile?.clearance_level ?? null
    const isManagerOrAdmin = role === "manager" || role === "admin"
    const canSelfAssign = isManagerOrAdmin || role === "consultant"

    // Self-assign + manager override: a salesperson may take an unassigned job or
    // release one they already own; assigning to anyone else, or taking a job
    // owned by another, requires a manager/admin. Read-only roles cannot assign.
    const currentOwner = booking.assigned_salesperson_id ?? null
    const target = body.assignedSalespersonId ?? null
    const isSelfAssign =
      canSelfAssign &&
      ((target === user.id && (currentOwner === null || currentOwner === user.id)) ||
        (target === null && currentOwner === user.id))

    if (!isManagerOrAdmin && !isSelfAssign) {
      return NextResponse.json(
        { error: "Manager access required to assign this job to another salesperson" },
        { status: 403 },
      )
    }

    if (body.assignedSalespersonId) {
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("user_id, clearance_level, is_active")
        .eq("user_id", body.assignedSalespersonId)
        .maybeSingle()

      if (
        !targetProfile ||
        !["admin", "manager", "consultant"].includes(targetProfile.clearance_level) ||
        targetProfile.is_active === false
      ) {
        return NextResponse.json({ error: "Assigned salesperson not found" }, { status: 404 })
      }
    }

    updates.assigned_salesperson_id = body.assignedSalespersonId

    await supabase.from("audit_logs").insert({
      actor: [actorProfile?.name, actorProfile?.surname].filter(Boolean).join(" ").trim() || actorProfile?.email || user.email || "System",
      actor_user_id: user.id,
      entity_type: "Booking",
      entity_id: id,
      action: "salesperson_reassigned",
      before_json: { assigned_salesperson_id: booking.assigned_salesperson_id },
      after_json: { assigned_salesperson_id: body.assignedSalespersonId },
    })
  }

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

  if (body.customerInvoiceNumber !== undefined) {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("name, surname, email")
      .eq("user_id", user.id)
      .maybeSingle()

    const actorName =
      [actorProfile?.name, actorProfile?.surname].filter(Boolean).join(" ").trim() ||
      actorProfile?.email ||
      user.email ||
      "System"

    const result = await updateInvoiceNumber(supabase, {
      bookingId: id,
      value: body.customerInvoiceNumber,
      actor: actorName,
      actorUserId: user.id,
    })
    if (!result.ok) {
      const status = result.notFound ? 404 : 500
      return NextResponse.json({ error: result.error }, { status })
    }
  }

  if (body.parsedFieldEdits) {
    const edits = body.parsedFieldEdits
    type ParsedFieldMap = [keyof typeof edits, string, unknown]
    const fieldMap: ParsedFieldMap[] = [
      ["noOfAdults", "no_of_adults", booking.no_of_adults],
      ["noOfChildren", "no_of_children", booking.no_of_children],
      ["noOfSuites", "no_of_suites", booking.no_of_suites],
      ["departureDate", "departure_date", booking.departure_date],
    ]

    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    for (const [camelKey, snakeKey, oldValue] of fieldMap) {
      const newValue = edits[camelKey]
      if (newValue !== undefined) {
        before[camelKey] = oldValue
        after[camelKey] = newValue
        updates[snakeKey] = newValue
      }
    }

    if (Object.keys(after).length > 0) {
      await supabase.from("audit_logs").insert({
        actor: user?.email ?? "System",
        actor_user_id: user?.id ?? null,
        entity_type: "Booking",
        entity_id: id,
        action: "enquiry_field_updated",
        before_json: before as Json,
        after_json: after as Json,
      })
    }
  }

  if (body.consultant !== undefined || body.ownerUser !== undefined) {
    const role = extractRoleFromJwt(user) ?? patchActorRole
    const isManagerOrAdmin = role === "manager" || role === "admin"
    const isConsultant = role === "consultant"
    if (!isManagerOrAdmin && !isConsultant) {
      return NextResponse.json({ error: "Insufficient permissions to change the consultant" }, { status: 403 })
    }
    const incoming = body.consultant ?? body.ownerUser ?? null
    if (isConsultant && incoming !== null && incoming !== "") {
      const validKeys: Set<string> = new Set(CONSULTANTS.map((c) => c.key))
      if (!validKeys.has(incoming)) {
        return NextResponse.json({ error: "Invalid consultant key" }, { status: 400 })
      }
    }
    // Both fields map to the same DB column; consultant takes precedence if both are sent.
    updates.consultant = incoming || null
  }

  if (stageUpdated && Object.keys(updates).length === 1) {
    return NextResponse.json({
      id: stageUpdated.id,
      jobNumber: stageUpdated.booking_number,
      stage: stageUpdated.stage,
      consultant: stageUpdated.consultant,
      assignedSalespersonId: booking.assigned_salesperson_id ?? null,
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

  if (error) return safeSupabaseError("jobs/[id]", error)

  return NextResponse.json({
    id: updated.id,
    jobNumber: updated.booking_number,
    stage: updated.stage,
    consultant: updated.consultant,
    assignedSalespersonId: updated.assigned_salesperson_id ?? null,
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
  if (error) return safeSupabaseError("jobs/[id]", error)

  return NextResponse.json({ ok: true })
}