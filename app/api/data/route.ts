import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import {
  BOOKING_SUITE_COLUMNS,
  BOOKING_WITH_SUPPLIER_COLUMNS,
  CORRESPONDENCE_COLUMNS,
  CUSTOMER_COLUMNS,
  DOCUMENT_COLUMNS,
  ITINERARY_COLUMNS,
  PAYMENT_COLUMNS,
  PIPELINE_HISTORY_COLUMNS,
  QUOTE_COLUMNS,
  QUOTE_LINE_ITEM_COLUMNS,
  TEMPLATE_COLUMNS,
} from "@/lib/supabase/columns"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { getAuditCutoffDate } from "@/lib/audit"
import { getDefaultDepositPercentage } from "@/lib/pipeline/constants"
import { buildRepeatCustomerIdSet } from "@/lib/customer-repeat-status"

const ENTITIES = [
  "settings",
  "customers",
  "bookings",
  "bookingSuites",
  "payments",
  "quotes",
  "itineraries",
  "documents",
  "correspondences",
  "auditLogs",
  "pipelineHistory",
  "templates",
] as const

type Entity = (typeof ENTITIES)[number]

function isEntity(value: string): value is Entity {
  return (ENTITIES as readonly string[]).includes(value)
}

function addDaysToDateString(value: string, days: number): string {
  const [year = "1970", month = "1", day = "1"] = value.split("-")
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// GET /api/data?include=bookings,customers
// Without ?include this returns every entity (legacy full-dataset shape).
// With ?include only the requested entities are queried and returned, so pages
// pay only for the tables they actually render.
export async function GET(req: Request) {
  const supabase = await createSessionClient()

  const url = new URL(req.url)
  const includeParam = url.searchParams.get("include")
  const requested: ReadonlySet<Entity> = includeParam
    ? new Set(includeParam.split(",").map((e) => e.trim()).filter(isEntity))
    : new Set(ENTITIES)

  if (requested.size === 0) {
    return NextResponse.json({ error: "include lists no known entities" }, { status: 400 })
  }

  const want = (entity: Entity) => requested.has(entity)

  // Customer mapping needs bookings rows to compute the repeat-client flag.
  const needBookingRows = want("bookings") || want("customers")
  // Booking mapping resolves assigned-salesperson names from profiles.
  const needProfiles = want("bookings")

  const auditCutoff = getAuditCutoffDate().toISOString()
  const defaultDepositPercentage = want("settings") ? await getDefaultDepositPercentage(supabase) : null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("clearance_level")
        .eq("user_id", user.id)
        .single()
    : { data: null }
  const canReadAuditLogs = profile?.clearance_level === "admin" || profile?.clearance_level === "manager"

  const emptyResult = Promise.resolve({ data: [] })

  const [
    { data: customers },
    { data: bookings },
    { data: profiles },
    { data: bookingSuites },
    { data: payments },
    { data: quotes },
    { data: quoteLineItems },
    { data: itineraries },
    { data: documents },
    { data: correspondences },
    { data: auditLogs },
    { data: pipelineHistory },
    { data: templates },
  ] = await Promise.all([
    want("customers")
      ? supabase.from("customers").select(CUSTOMER_COLUMNS).order("created_at", { ascending: false })
      : emptyResult,
    needBookingRows
      ? supabase
          .from("bookings")
          .select(BOOKING_WITH_SUPPLIER_COLUMNS)
          .order("created_at", { ascending: false })
      : emptyResult,
    needProfiles
      ? supabase.from("profiles").select("user_id, name, surname, email, clearance_level, is_active")
      : emptyResult,
    want("bookingSuites") ? supabase.from("booking_suites").select(BOOKING_SUITE_COLUMNS) : emptyResult,
    want("payments")
      ? supabase.from("payments").select(PAYMENT_COLUMNS).order("received_at", { ascending: false })
      : emptyResult,
    want("quotes")
      ? supabase.from("quotes").select(QUOTE_COLUMNS).order("created_at", { ascending: false })
      : emptyResult,
    want("quotes")
      ? supabase.from("quote_line_items").select(QUOTE_LINE_ITEM_COLUMNS).order("sort_order", { ascending: true })
      : emptyResult,
    want("itineraries")
      ? supabase.from("itineraries").select(ITINERARY_COLUMNS).order("created_at", { ascending: false })
      : emptyResult,
    want("documents")
      ? supabase.from("documents").select(DOCUMENT_COLUMNS).order("created_at", { ascending: false })
      : emptyResult,
    want("correspondences")
      ? supabase.from("correspondences").select(CORRESPONDENCE_COLUMNS).order("created_at", { ascending: false })
      : emptyResult,
    want("auditLogs") && canReadAuditLogs
      ? supabase
          .from("audit_logs")
          .select("id, actor, actor_user_id, entity_type, entity_id, action, before_json, after_json, meta_json, created_at")
          .gte("created_at", auditCutoff)
          .order("created_at", { ascending: false })
          .limit(1000)
      : emptyResult,
    want("pipelineHistory")
      ? supabase.from("pipeline_history").select(PIPELINE_HISTORY_COLUMNS).order("moved_at", { ascending: false })
      : emptyResult,
    want("templates")
      ? supabase.from("templates").select(TEMPLATE_COLUMNS).order("key", { ascending: true })
      : emptyResult,
  ])

  const profileByUserId = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      {
        id: profile.user_id,
        name: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email,
        email: profile.email,
        clearanceLevel: profile.clearance_level,
        isActive: profile.is_active ?? true,
      },
    ]),
  )

  const repeatCustomerIds = buildRepeatCustomerIdSet(bookings ?? [])

  // Resolve supplier names for historically-imported bookings (which reference a
  // supplier id inside extracted_json rather than via a route/hotel relation).
  const historicalSupplierIds = want("bookings")
    ? Array.from(
        new Set(
          (bookings ?? [])
            .map(
              (b) =>
                (b.extracted_json as { historical_import?: { supplier_id?: string } } | null)
                  ?.historical_import?.supplier_id,
            )
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      )
    : []
  const supplierNamesById = new Map<string, string>()
  if (historicalSupplierIds.length > 0) {
    const { data: historicalSuppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", historicalSupplierIds)
    ;(historicalSuppliers ?? []).forEach((s) => supplierNamesById.set(s.id, s.name))
  }

  const response: Record<string, unknown> = {}

  if (want("settings")) {
    response.settings = { defaultDepositPercentage }
  }

  if (want("customers")) {
    response.customers = (customers ?? []).map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      country: c.country,
      province: c.province,
      title: c.title,
      notes: c.notes,
      dateOfBirth: c.date_of_birth,
      vipStatus: c.vip_status,
      preferences: c.preferences,
      communicationPreferences: c.communication_preferences,
      firstTravelDate: c.first_travel_date,
      firstTravelDateDisplay: formatDisplayDate(c.first_travel_date),
      lastTravelDate: c.last_travel_date,
      lastTravelDateDisplay: formatDisplayDate(c.last_travel_date),
      isRepeatClient: repeatCustomerIds.has(c.id),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      createdAtDisplay: formatDisplayDateTime(c.created_at),
      updatedAtDisplay: formatDisplayDateTime(c.updated_at),
    }))
  }

  if (want("bookings")) {
    response.bookings = (bookings ?? []).map((b) => ({
      id: b.id,
      bookingNumber: b.booking_number,
      customerId: b.customer_id,
      stage: b.stage,
      purpose: b.purpose,
      source: b.source,
      consultant: b.consultant,
      ownerUserId: b.owner_user_id,
      assignedSalespersonId: b.assigned_salesperson_id,
      isRepeatClientAtCreation: b.is_repeat_client_at_creation,
      assignedSalespersonName: b.assigned_salesperson_id
        ? profileByUserId.get(b.assigned_salesperson_id)?.name ?? null
        : null,
      departureDate: b.departure_date,
      departureDateDisplay: formatDisplayDate(b.departure_date),
      durationNights: b.duration_nights,
      tripEndDate:
        b.departure_date && b.duration_nights !== null
          ? addDaysToDateString(b.departure_date, b.duration_nights)
          : null,
      emailImportNeedsReview: b.email_import_needs_review,
      emailImportReviewResolvedAt: b.email_import_review_resolved_at,
      emailImportReviewResolvedAtDisplay: formatDisplayDateTime(b.email_import_review_resolved_at),
      emailImportMissingFields: b.email_import_missing_fields,
      emailImportWarnings: b.email_import_warnings,
      emailImportSourceMessageId: b.email_import_source_message_id,
      emailImportDuplicateOfBookingId: b.email_import_duplicate_of_booking_id,
      emailImportSubject: b.email_import_subject,
      emailImportMailbox: b.email_import_mailbox,
      emailImportReceivedAt: b.email_import_received_at,
      emailImportReceivedAtDisplay: formatDisplayDateTime(b.email_import_received_at),
      emailImportRawPreview: b.email_import_raw_preview,
      noOfAdults: b.no_of_adults,
      noOfChildren: b.no_of_children,
      noOfSuites: b.no_of_suites,
      childAges: b.child_ages,
      routeId: b.route_id,
      direction:
        (b.route as { name?: string } | null)?.name ??
        ((b.extracted_json as { historical_import?: { route?: string } } | null)?.historical_import?.route ?? null),
      supplierName:
        (b.route as { supplier?: { name?: string | null } | null } | null)?.supplier?.name ??
        (b.hotel_supplier as { name?: string | null } | null)?.name ??
        ((b.extracted_json as { historical_import?: { supplier_id?: string } } | null)?.historical_import
          ?.supplier_id
          ? (supplierNamesById.get(
              (b.extracted_json as { historical_import?: { supplier_id?: string } }).historical_import!
                .supplier_id!,
            ) ?? null)
          : null),
      rawText: b.raw_text,
      extractedJson: b.extracted_json,
      termsAccepted: b.terms_accepted,
      additionalServices: b.additional_services,
      additionalServicesDetails: b.additional_services_details,
      promotionCode: b.promotion_code,
      extendStay: b.extend_stay,
      extraNights: b.extra_nights,
      hotelPhase: b.hotel_phase,
      hotelSupplierId: b.hotel_supplier_id,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      createdAtDisplay: formatDisplayDateTime(b.created_at),
      updatedAtDisplay: formatDisplayDateTime(b.updated_at),
      quoteSentAt: b.quote_sent_at,
      acceptedAt: b.accepted_at,
      depositRequestedAt: b.deposit_requested_at,
      depositPaidAt: b.deposit_paid_at,
      finalPaidAt: b.final_paid_at,
      voucherSentAt: b.voucher_sent_at,
      closedAt: b.closed_at,
      depositPaid: b.deposit_paid,
      invoiceBalance: b.invoice_balance,
      cancelledAt: b.cancelled_at,
      cancelledAtDisplay: formatDisplayDateTime(b.cancelled_at),
      refundStatus: b.refund_status,
      refundAmount: b.refund_amount,
      refundReference: b.refund_reference,
      refundedAt: b.refunded_at,
      outcome: b.outcome ?? "Open",
      outcomeReasonId: b.outcome_reason_id,
      outcomeNotes: b.outcome_notes,
      outcomeSetAt: b.outcome_set_at,
      outcomeSetAtDisplay: formatDisplayDateTime(b.outcome_set_at),
      outcomeSetBy: b.outcome_set_by,
    }))
  }

  if (want("bookingSuites")) {
    response.bookingSuites = (bookingSuites ?? []).map((s) => ({
      id: s.id,
      bookingId: s.booking_id,
      suiteNumber: s.suite_number,
      suiteTypeId: s.suite_type_id,
      suiteTypeName: s.suite_type_name,
    }))
  }

  if (want("payments")) {
    response.payments = (payments ?? []).map((p) => ({
      id: p.id,
      bookingId: p.booking_id,
      amount: p.amount,
      receivedAt: p.received_at,
      receivedAtDisplay: formatDisplayDateTime(p.received_at),
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      createdAt: p.created_at,
      createdAtDisplay: formatDisplayDateTime(p.created_at),
    }))
  }

  if (want("quotes")) {
    response.quotes = (quotes ?? []).map((q) => ({
      id: q.id,
      bookingId: q.booking_id,
      itineraryId: q.itinerary_id,
      status: q.status,
      quoteNumber: q.quote_number,
      parentQuoteId: q.parent_quote_id,
      validityUntil: q.validity_until,
      validityUntilDisplay: formatDisplayDate(q.validity_until),
      subtotal: q.subtotal,
      total: q.total,
      lastSentAt: q.last_sent_at,
      lastSentAtDisplay: formatDisplayDateTime(q.last_sent_at),
      overridePin: q.override_pin,
      overrideReason: q.override_reason,
      noPackageMatch: q.no_package_match,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
      createdAtDisplay: formatDisplayDateTime(q.created_at),
      updatedAtDisplay: formatDisplayDateTime(q.updated_at),
      lineItems: (quoteLineItems ?? [])
        .filter((li) => li.quote_id === q.id)
        .map((li) => ({
          id: li.id,
          description: li.description,
          supplierDescription: li.supplier_description,
          qty: li.qty,
          unitPrice: li.unit_price,
          total: li.total,
          pricingSnapshot: li.pricing_snapshot,
          sortOrder: li.sort_order,
        })),
    }))
  }

  if (want("itineraries")) {
    response.itineraries = (itineraries ?? []).map((i) => ({
      id: i.id,
      bookingId: i.booking_id,
      name: i.name,
      notes: i.notes,
      acceptedAt: i.accepted_at,
      acceptedAtDisplay: formatDisplayDateTime(i.accepted_at),
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      createdAtDisplay: formatDisplayDateTime(i.created_at),
      updatedAtDisplay: formatDisplayDateTime(i.updated_at),
    }))
  }

  if (want("documents")) {
    response.documents = (documents ?? []).map((d) => ({
      id: d.id,
      bookingId: d.booking_id,
      kind: d.kind,
      status: d.status,
      storagePath: d.storage_path,
      createdAt: d.created_at,
      createdAtDisplay: formatDisplayDateTime(d.created_at),
    }))
  }

  if (want("correspondences")) {
    response.correspondences = (correspondences ?? []).map((c) => ({
      id: c.id,
      bookingId: c.booking_id,
      channel: c.channel,
      kind: c.kind,
      subject: c.subject,
      bodyHtml: c.body_html,
      status: c.status,
      sentAt: c.sent_at,
      sentAtDisplay: formatDisplayDateTime(c.sent_at),
      scheduledAt: c.scheduled_at,
      scheduledAtDisplay: formatDisplayDateTime(c.scheduled_at),
      error: c.error,
      providerMessageId: c.provider_message_id,
      createdAt: c.created_at,
      createdAtDisplay: formatDisplayDateTime(c.created_at),
    }))
  }

  if (want("auditLogs")) {
    response.auditLogs = (auditLogs ?? []).map((a) => ({
      id: a.id,
      actor: a.actor,
      actorUserId: a.actor_user_id ?? undefined,
      entityType: a.entity_type,
      entityId: a.entity_id,
      action: a.action,
      beforeJson: a.before_json ? JSON.stringify(a.before_json) : undefined,
      afterJson: a.after_json ? JSON.stringify(a.after_json) : undefined,
      metaJson: a.meta_json ? JSON.stringify(a.meta_json) : undefined,
      createdAt: a.created_at,
      createdAtDisplay: formatDisplayDateTime(a.created_at),
    }))
  }

  if (want("pipelineHistory")) {
    response.pipelineHistory = (pipelineHistory ?? []).map((h) => ({
      id: h.id,
      bookingId: h.booking_id,
      fromStage: h.from_stage,
      toStage: h.to_stage,
      movedBy: h.moved_by,
      movedAt: h.moved_at,
      movedAtDisplay: formatDisplayDateTime(h.moved_at),
    }))
  }

  if (want("templates")) {
    response.templates = (templates ?? []).map((t) => ({
      id: t.id,
      key: t.key,
      subject: t.subject,
      bodyHtml: t.body_html,
      version: t.version,
      active: t.active,
      isSystem: t.is_system,
    }))
  }

  if (!includeParam) {
    response.rateCards = []
  }

  return NextResponse.json(response)
}
