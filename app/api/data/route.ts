import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createSessionClient()

  const [
    { data: customers },
    { data: bookings },
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
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("*, route:routes(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("booking_suites").select("*"),
    supabase.from("payments").select("*").order("received_at", { ascending: false }),
    supabase.from("quotes").select("*").order("created_at", { ascending: false }),
    supabase.from("quote_line_items").select("*").order("sort_order", { ascending: true }),
    supabase.from("itineraries").select("*").order("created_at", { ascending: false }),
    supabase.from("documents").select("*").order("created_at", { ascending: false }),
    supabase.from("correspondences").select("*").order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }),
    supabase.from("pipeline_history").select("*").order("moved_at", { ascending: false }),
    supabase.from("templates").select("*").order("key", { ascending: true }),
  ])

  // Embed line items into each quote
  const quotesWithLines = (quotes ?? []).map((q) => ({
    id: q.id,
    bookingId: q.booking_id,
    itineraryId: q.itinerary_id,
    status: q.status,
    validityUntil: q.validity_until,
    subtotal: q.subtotal,
    vat: q.vat,
    total: q.total,
    lastSentAt: q.last_sent_at,
    overridePin: q.override_pin,
    overrideReason: q.override_reason,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    lineItems: (quoteLineItems ?? [])
      .filter((li) => li.quote_id === q.id)
      .map((li) => ({
        id: li.id,
        description: li.description,
        qty: li.qty,
        unitPrice: li.unit_price,
        total: li.total,
        sortOrder: li.sort_order,
      })),
  }))

  return NextResponse.json({
    customers: (customers ?? []).map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      country: c.country,
      title: c.title,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),

    bookings: (bookings ?? []).map((b) => ({
      id: b.id,
      bookingNumber: b.booking_number,
      customerId: b.customer_id,
      stage: b.stage,
      purpose: b.purpose,
      source: b.source,
      consultant: b.consultant,
      ownerUserId: b.owner_user_id,
      departureDate: b.departure_date,
      durationNights: b.duration_nights,
      noOfAdults: b.no_of_adults,
      noOfChildren: b.no_of_children,
      noOfSuites: b.no_of_suites,
      childAges: b.child_ages,
      routeId: b.route_id,
      direction:
        (b.route as { name?: string } | null)?.name ??
        ((b.extracted_json as { historical_import?: { route?: string } } | null)?.historical_import?.route ?? null),
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
    })),

    bookingSuites: (bookingSuites ?? []).map((s) => ({
      id: s.id,
      bookingId: s.booking_id,
      suiteNumber: s.suite_number,
      suiteTypeId: s.suite_type_id,
      suiteTypeName: s.suite_type_name,
    })),

    payments: (payments ?? []).map((p) => ({
      id: p.id,
      bookingId: p.booking_id,
      amount: p.amount,
      receivedAt: p.received_at,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      createdAt: p.created_at,
    })),

    quotes: quotesWithLines,

    itineraries: (itineraries ?? []).map((i) => ({
      id: i.id,
      bookingId: i.booking_id,
      name: i.name,
      notes: i.notes,
      acceptedAt: i.accepted_at,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    })),

    documents: (documents ?? []).map((d) => ({
      id: d.id,
      bookingId: d.booking_id,
      kind: d.kind,
      status: d.status,
      storagePath: d.storage_path,
      createdAt: d.created_at,
    })),

    correspondences: (correspondences ?? []).map((c) => ({
      id: c.id,
      bookingId: c.booking_id,
      channel: c.channel,
      subject: c.subject,
      bodyHtml: c.body_html,
      status: c.status,
      sentAt: c.sent_at,
      scheduledAt: c.scheduled_at,
      error: c.error,
      createdAt: c.created_at,
    })),

    auditLogs: (auditLogs ?? []).map((a) => ({
      id: a.id,
      actor: a.actor,
      actorUserId: a.actor_user_id,
      entityType: a.entity_type,
      entityId: a.entity_id,
      action: a.action,
      beforeJson: a.before_json ? JSON.stringify(a.before_json) : undefined,
      afterJson: a.after_json ? JSON.stringify(a.after_json) : undefined,
      metaJson: a.meta_json ? JSON.stringify(a.meta_json) : undefined,
      createdAt: a.created_at,
    })),

    pipelineHistory: (pipelineHistory ?? []).map((h) => ({
      id: h.id,
      bookingId: h.booking_id,
      fromStage: h.from_stage,
      toStage: h.to_stage,
      movedBy: h.moved_by,
      movedAt: h.moved_at,
    })),

    templates: (templates ?? []).map((t) => ({
      id: t.id,
      key: t.key,
      subject: t.subject,
      bodyHtml: t.body_html,
      version: t.version,
      active: t.active,
    })),

    rateCards: [],
  })
}
