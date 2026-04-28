import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import type { PipelineStage } from "@/lib/types"

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
  const body = await req.json()
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: booking } = await supabase
    .from("bookings")
    .select("stage, booking_number")
    .eq("id", id)
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.stage) {
    const fromStage = booking.stage
    let actorName = user?.email ?? "System"

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, surname")
        .eq("user_id", user.id)
        .maybeSingle()

      const profileName = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim()
      if (profileName) actorName = profileName
    }

    // Record pipeline history
    await supabase.from("pipeline_history").insert({
      booking_id: id,
      from_stage: fromStage,
      to_stage: body.stage as PipelineStage,
      moved_by: actorName,
      moved_by_user_id: user?.id ?? null,
    })

    // Persist cancel reason when moving to lost
    const cancelReason =
      body.stage === "lost" && typeof body.cancelReason === "string" && body.cancelReason.trim()
        ? body.cancelReason.trim()
        : undefined

    if (cancelReason) {
      updates.cancel_reason = cancelReason
      updates.cancelled_at = new Date().toISOString()
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      actor: actorName,
      actor_user_id: user?.id ?? null,
      entity_type: "Booking",
      entity_id: id,
      action: "stage_change",
      before_json: { stage: fromStage },
      after_json: { stage: body.stage, ...(cancelReason ? { cancel_reason: cancelReason } : {}) },
    })

    updates.stage = body.stage
  }

  if (body.ownerUser) updates.consultant = body.ownerUser
  if (body.consultant) updates.consultant = body.consultant

  const { data: updated, error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

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
