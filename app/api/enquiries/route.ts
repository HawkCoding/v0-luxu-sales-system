import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { allocateJobNumberForBooking, type JobNumberAllocation } from "@/lib/job-numbering"
import { isAuthorizedWebhookRequest } from "@/lib/api/webhook-secret"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import {
  legacySuiteNamesToUnits,
  resolveEnquirySuiteUnits,
  unitAxisValue,
  type IncomingSuiteUnit,
} from "@/lib/suites/enquiry-suite-units"
import {
  promoteSuiteAliases,
  recordSuiteAliasCorrections,
  type SuiteAliasWrite,
} from "@/lib/suites/suite-alias-store"
import { withSuiteTypeMissingField } from "@/lib/suites/missing-fields"
import { REVIEW_REASON } from "@/lib/inbound-email/review-reasons"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { COMPLETED_REPEAT_BOOKING_STAGES } from "@/lib/customer-repeat-status"
import { findHotelSupplierId, resolveTrainSupplierId } from "@/lib/resolvers/supplier-resolver"
import { autoBuildBookingServices } from "@/lib/auto-build/build-from-enquiry"
import { createDraftQuoteForBooking } from "@/lib/quotes/create-draft-quote"
import { findRouteMatch } from "@/lib/resolvers/route-resolver"

// Mirrors "create:enquiry" in lib/role-context.tsx.
const ENQUIRY_CREATE_ROLES: readonly string[] = ["admin", "manager", "consultant"]

type ServiceClient = ReturnType<typeof createServiceClient>
type TransportServiceType = "transfer" | "rental"
type TransportRequestInsert = {
  id: string
  booking_id: string
  service_type: TransportServiceType
  supplier_id: string | null
  route_id: string | null
  suite_type_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  passenger_count: number | null
  luggage_count: number | null
  flight_number: string | null
  notes: string | null
  sort_order: number
  pricing_basis: "per_vehicle" | "per_person"
}
type VehicleRentalDetailsInsert = {
  transport_request_id: string
  return_at: string | null
  return_cutoff_time: string | null
}

function normalizeTransportServiceType(value: unknown): TransportServiceType {
  return value === "rental" ? "rental" : "transfer"
}

function normalizeNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

const enquiryFilterSchema = z
  .enum(["needs_review", "complete", "unassigned", "my_enquiries", "possible_duplicates"])
  .optional()

const ENQUIRY_SELECT =
  "id, booking_number, customer_id, stage, purpose, source, consultant, owner_user_id, assigned_salesperson_id, departure_date, duration_nights, email_import_needs_review, email_import_review_resolved_at, email_import_missing_fields, email_import_warnings, email_import_source_message_id, email_import_duplicate_of_booking_id, email_import_subject, email_import_mailbox, email_import_received_at, email_import_raw_preview, no_of_adults, no_of_children, no_of_suites, child_ages, route_id, extracted_json, additional_services, additional_services_details, created_at, updated_at, route:routes(id, name), customer:customers(id, first_name, last_name, email, title)"

export async function GET(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)

  // Lightweight badge count: ?count=true returns just the open-enquiry total
  // so the app shell doesn't need the full enquiry list (or /api/data).
  if (url.searchParams.get("count") === "true") {
    const { count, error: countError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("stage", "enquiry")
    if (countError) return NextResponse.json({ error: "Failed to count enquiries" }, { status: 500 })
    return NextResponse.json({ count: count ?? 0 })
  }

  const filterResult = enquiryFilterSchema.safeParse(url.searchParams.get("filter") ?? undefined)
  if (!filterResult.success) {
    return NextResponse.json({ error: "Invalid filter value" }, { status: 400 })
  }
  const filter = filterResult.data

  let query = supabase
    .from("bookings")
    .select(ENQUIRY_SELECT)
    .eq("stage", "enquiry")
    .order("created_at", { ascending: false })

  if (filter === "needs_review") query = query.eq("email_import_needs_review", true)
  else if (filter === "complete") query = query.eq("email_import_needs_review", false)
  else if (filter === "unassigned") query = query.is("assigned_salesperson_id", null)
  else if (filter === "my_enquiries") query = query.eq("assigned_salesperson_id", user.id)
  else if (filter === "possible_duplicates")
    query = query.not("email_import_duplicate_of_booking_id", "is", null)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: "Failed to load enquiries" }, { status: 500 })

  const allRows = rows ?? []
  const filtered =
    filter === "complete"
      ? allRows.filter((b) => ((b.email_import_missing_fields as string[] | null) ?? []).length === 0)
      : allRows

  type CustomerRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; title: string | null }
  type RouteRow = { id: string; name: string }

  const enquiries = filtered.map((b) => {
    const cust = b.customer as CustomerRow | null
    const route = b.route as RouteRow | null
    return {
      id: b.id,
      bookingNumber: b.booking_number,
      customerId: b.customer_id,
      stage: b.stage,
      purpose: b.purpose,
      source: b.source,
      consultant: b.consultant,
      ownerUserId: b.owner_user_id,
      assignedSalespersonId: b.assigned_salesperson_id,
      departureDate: b.departure_date,
      departureDateDisplay: formatDisplayDate(b.departure_date),
      durationNights: b.duration_nights,
      emailImportNeedsReview: b.email_import_needs_review,
      emailImportReviewResolvedAt: b.email_import_review_resolved_at,
      emailImportMissingFields: (b.email_import_missing_fields as string[] | null) ?? [],
      emailImportWarnings: (b.email_import_warnings as string[] | null) ?? [],
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
        route?.name ??
        ((b.extracted_json as { historical_import?: { route?: string } } | null)?.historical_import?.route ?? null),
      extractedJson: b.extracted_json,
      additionalServices: b.additional_services,
      additionalServicesDetails: b.additional_services_details,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      createdAtDisplay: formatDisplayDateTime(b.created_at),
      updatedAtDisplay: formatDisplayDateTime(b.updated_at),
      customer: cust
        ? {
            id: cust.id,
            firstName: cust.first_name,
            lastName: cust.last_name,
            email: cust.email,
            title: cust.title,
          }
        : null,
    }
  })

  return NextResponse.json({ enquiries })
}

// A lenient UUID: invalid values become null instead of rejecting the whole
// enquiry — losing a customer enquiry over a malformed reference id is worse
// than dropping the reference.
const lenientUuid = z.string().uuid().nullish().catch(null)

const travellerInputSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  surname: z.string().trim().max(120).nullish(),
  prefix: z.string().trim().max(40).nullish(),
  idPassport: z.string().trim().max(80).nullish(),
  dateOfBirth: z.string().trim().max(40).nullish(),
})

const transportRequestInputSchema = z.object({
  serviceType: z.string().trim().max(20).nullish(),
  pickupPoint: z.string().trim().max(500).nullish(),
  dropoffPoint: z.string().trim().max(500).nullish(),
  supplierId: lenientUuid,
  routeId: lenientUuid,
  suiteTypeId: lenientUuid,
  pickupAt: z.string().trim().max(60).nullish(),
  returnAt: z.string().trim().max(60).nullish(),
  passengerCount: z.number().int().min(0).max(1000).nullish().catch(null),
  luggageCount: z.number().int().min(0).max(1000).nullish().catch(null),
  flightNumber: z.string().trim().max(40).nullish(),
  notes: z.string().max(2000).nullish(),
  rentalDetails: z
    .object({
      returnAt: z.string().trim().max(60).nullish(),
      returnCutoffTime: z.string().trim().max(40).nullish(),
    })
    .nullish(),
})

// Lead sources a consultant may stamp on an enquiry they captured themselves. The three
// mechanical sources -- web_form, paste_import, email -- are decided by the intake path, never
// by the caller: `email` in particular gates the reject-import DELETE below, and `web_form` is
// what the public form must always be recorded as.
const STAFF_SELECTABLE_SOURCES = [
  "phone_call",
  "walk_in",
  "referral",
  "advertisement",
  "social_media",
  "travel_agent",
] as const

const enquiryBodySchema = z.object({
  email: z.string().trim().max(255).nullish(),
  source: z.enum(STAFF_SELECTABLE_SOURCES).nullish().catch(null),
  name: z.string().trim().max(120).nullish(),
  surname: z.string().trim().max(120).nullish(),
  title: z.string().trim().max(40).nullish(),
  contactNumber: z.string().trim().max(100).nullish(),
  country: z.string().trim().max(120).nullish(),
  province: z.string().trim().max(120).nullish(),
  rawText: z.string().max(100_000).nullish(),
  // Free text typed on the review screen; saved as the booking's first internal note.
  notes: z.string().trim().max(5000).nullish(),
  // Only honoured for authenticated sessions — see POST below.
  linkedCustomerId: z.string().uuid().nullish().catch(null),
  direction: z.string().trim().max(255).nullish(),
  packageOption: z.string().trim().max(255).nullish(),
  hotelOption: z.string().trim().max(255).nullish(),
  hotelPhase: z.enum(["pre", "post", "none"]).nullish().catch(null),
  supplierId: lenientUuid,
  supplier: z.string().trim().max(255).nullish(),
  purpose: z.enum(["quote", "availability", "reservation"]).nullish().catch(null),
  departureDate: z.string().trim().max(40).nullish(),
  noOfAdults: z.number().int().min(0).max(500).nullish().catch(null),
  noOfChildren: z.number().int().min(0).max(500).nullish().catch(null),
  noOfSuites: z.number().int().min(0).max(500).nullish().catch(null),
  childAges: z.array(z.coerce.number().int().min(0).max(30)).max(50).nullish().catch(null),
  termsAccepted: z.boolean().nullish().catch(null),
  extendStay: z.union([z.string().max(10), z.boolean()]).nullish().catch(null),
  extraNights: z.union([z.number(), z.string().max(10)]).nullish().catch(null),
  additionalServices: z.union([z.boolean(), z.string().max(255)]).nullish().catch(null),
  additionalServicesDetails: z.string().max(5000).nullish(),
  promotionCode: z.string().trim().max(100).nullish(),
  flightBooking: z.string().trim().max(255).nullish(),
  flightDepartureDate: z.string().trim().max(40).nullish(),
  extractedJson: z.record(z.unknown()).nullish(),
  suiteUnits: z
    .array(
      z.object({
        suiteNumber: z.number().int().min(1).max(500).nullish().catch(null),
        rawPhrase: z.string().trim().max(500).nullish(),
        suiteTypeId: lenientUuid,
        suiteTypeName: z.string().trim().max(255).nullish(),
        bedroomTypeId: lenientUuid,
        bedroomLayoutId: lenientUuid,
        bathroomTypeId: lenientUuid,
        editedAxes: z
          .array(z.enum(["suiteType", "bedroomType", "bedroomLayout", "bathroomType"]))
          .max(4)
          .nullish()
          .catch(null),
        match: z.unknown().nullish(),
      }),
    )
    .max(50)
    .nullish(),
  // Legacy name-only shape, still sent by the public website form.
  suiteTypes: z.array(z.string().max(255)).max(50).nullish(),
  travellers: z.array(travellerInputSchema).max(100).nullish(),
  childTravellers: z.array(travellerInputSchema).max(100).nullish(),
  transportRequests: z.array(transportRequestInputSchema).max(50).nullish(),
})

interface EnquiryFormFieldEdits {
  province?: string | null
  packageOption?: string | null
  hotelOption?: string | null
  flightBooking?: string | null
  flightDepartureDate?: string | null
  direction?: string | null
  supplier?: string | null
}

/**
 * Folds the values the caller actually submitted back into the parser's raw-wording snapshot.
 *
 * The review modal edits the structured draft (`trip.route`, `customer.province`, …) but never
 * `formFields`, and `app/api/jobs/[id]/route.ts` falls back to `formFields` whenever a value could
 * not be resolved to a foreign key. Without this merge a consultant's correction to a route that
 * matches no `routes` row read back as the ORIGINALLY PARSED wording, so the edit looked lost.
 * `raw_text` still holds the customer's own words verbatim.
 */
export function mergeEnquiryFormFields(
  existing: unknown,
  edits: EnquiryFormFieldEdits,
): Record<string, unknown> {
  const existingFormFields =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {}

  return {
    ...existingFormFields,
    province: edits.province || null,
    packageOption: edits.packageOption || null,
    hotelOption: edits.hotelOption || null,
    flightBooking: edits.flightBooking || null,
    flightDepartureDate: edits.flightDepartureDate || null,
    direction:
      edits.direction ||
      (typeof existingFormFields.direction === "string" ? existingFormFields.direction : null),
    // Only the public web form sends free-text `supplier` -- the review modal resolves a supplier
    // id instead -- so a paste import must not blank the parsed supplier wording.
    ...(edits.supplier ? { supplier: edits.supplier } : {}),
  }
}

export async function POST(req: Request) {
  // Callers are either logged-in staff (paste import / internal forms) or the
  // public website form, which must present the shared webhook secret.
  const sessionClient = await createSessionClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()
  const isWebhookCaller = isAuthorizedWebhookRequest(req, process.env.ENQUIRY_WEBHOOK_SECRET)

  if (!user && !isWebhookCaller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Staff sessions need "create:enquiry" (see lib/role-context.tsx) — this route
  // writes a customer, a booking and a draft quote, so read-only accounts must
  // not reach it. The webhook path has no session and is authorised by secret.
  if (user && !isWebhookCaller) {
    const { data: profile } = await sessionClient
      .from("profiles")
      .select("clearance_level")
      .eq("user_id", user.id)
      .single()

    if (!profile || !ENQUIRY_CREATE_ROLES.includes(profile.clearance_level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedBody = enquiryBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsedBody.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const body = parsedBody.data

  // Every field above is nullish + .catch(), so an empty body parses clean. Without this an
  // errored client (or a bare curl) mints a booking, a nameless customer and a draft quote that
  // nobody can trace back to a person. Any one identifying detail is enough to keep the enquiry.
  const hasIdentifyingDetail = [
    body.email,
    body.name,
    body.surname,
    body.contactNumber,
    body.rawText,
  ].some((value) => typeof value === "string" && value.trim().length > 0)
  if (!hasIdentifyingDetail && !body.linkedCustomerId) {
    return NextResponse.json(
      { error: "An enquiry needs at least a name, email, contact number or the original text" },
      { status: 400 },
    )
  }

  // Mirrors the defaults the booking insert applies below. A booking with nobody travelling
  // can't be priced (lib/packages/passenger-totals.ts divides by the pax count) and the dialog
  // already blocks it -- the API has to agree.
  const effectiveAdults = body.noOfAdults ?? 1
  const effectiveChildren = body.noOfChildren ?? 0
  if (effectiveAdults + effectiveChildren < 1) {
    return NextResponse.json(
      { error: "An enquiry needs at least one traveller" },
      { status: 400 },
    )
  }

  // Service-role client: the public web form has no user session, and staff
  // sessions may lack RLS access to every table this intake touches.
  const supabase = createServiceClient()

  const normalizedEmail = typeof body.email === "string" ? body.email.toLowerCase().trim() : undefined
  const normalizedCustomerFirstName =
    typeof body.name === "string" ? normalizeFirstName(body.name) : null
  const normalizedCustomerLastName =
    typeof body.surname === "string" ? normalizeLastName(body.surname) : null
  const countryAliasMap = await loadCountryAliasMap(supabase)

  const submittedCountry = typeof body.country === "string" ? body.country : null
  const submittedRawText = typeof body.rawText === "string" ? body.rawText : null
  const detectedCountryFromText =
    (!submittedCountry || submittedCountry.toLowerCase() === "other") && submittedRawText
      ? detectCountryInText(submittedRawText, countryAliasMap)
      : null
  const normalizedCountry = normalizeCountry(
    detectedCountryFromText ?? submittedCountry,
    countryAliasMap,
  )

  // --- 1. Upsert customer (match on email, or use linkedCustomerId when set) ---
  // linkedCustomerId lets a caller attach the enquiry to an existing customer,
  // so it is only honoured for authenticated staff sessions — never for the
  // public web form, which could otherwise write into arbitrary customer records.
  const linkedCustomerId =
    user && typeof body.linkedCustomerId === "string" && body.linkedCustomerId.trim().length > 0
      ? body.linkedCustomerId.trim()
      : null
  const { customerId, customerIsRepeatClient } = await resolveEnquiryCustomer(supabase, {
    normalizedEmail,
    firstName: normalizedCustomerFirstName,
    lastName: normalizedCustomerLastName,
    phone: body.contactNumber || null,
    country: normalizedCountry,
    province: body.province || null,
    title: body.title || null,
    nowIso: new Date().toISOString(),
    existingCustomerId: linkedCustomerId,
  })

  if (!customerId) {
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }

  // --- 2. Insert booking ---
  // Two shapes arrive here: structured units from the review modal, and the public web form's
  // legacy name-only `suiteTypes`. Both become units so one code path handles them.
  const incomingSuiteUnits: IncomingSuiteUnit[] = Array.isArray(body.suiteUnits) && body.suiteUnits.length > 0
    ? (body.suiteUnits as IncomingSuiteUnit[])
    : legacySuiteNamesToUnits(Array.isArray(body.suiteTypes) ? body.suiteTypes : [])
  // Gaps worth flagging that the parser can't fabricate its way out of.
  const suiteReviewMissingFields: string[] = []
  if (!body.noOfSuites) suiteReviewMissingFields.push(REVIEW_REASON.numberOfSuites)
  if (!normalizeNullableText(body.direction)) suiteReviewMissingFields.push(REVIEW_REASON.direction)

  // A consultant typing an enquiry they took over the phone is not a web form submission --
  // recording it as one is what made lead-source reporting wrong. An authenticated staff session
  // may therefore stamp the real lead source; the public webhook never can, so the form it owns
  // stays web_form and a paste import stays paste_import.
  const source = user && body.source ? body.source : body.rawText ? "paste_import" : "web_form"
  // body.supplier is free text (the web form can't know internal supplier UUIDs); resolve it the
  // same never-guess way findHotelSupplierId already resolves body.hotelOption below, rather than
  // silently dropping every request that arrives without a client-resolved id.
  const trainSupplierId = body.supplierId ?? (await resolveTrainSupplierId(supabase, body.supplier))
  const { routeId, reversed: routeReversed } = await findRouteMatch(supabase, body.direction, trainSupplierId)
  const hotelSupplierId = await findHotelSupplierId(supabase, body.hotelOption)
  let jobNumberAllocation: JobNumberAllocation
  try {
    jobNumberAllocation = await allocateJobNumberForBooking(supabase)
  } catch (error) {
    console.error("enquiries:allocateJobNumber", error)
    return NextResponse.json({ error: "Failed to allocate job number" }, { status: 500 })
  }
  const existingExtractedJson =
    body.extractedJson && typeof body.extractedJson === "object" && !Array.isArray(body.extractedJson)
      ? body.extractedJson as Record<string, unknown>
      : {}
  const extractedJson = {
    ...existingExtractedJson,
    formFields: mergeEnquiryFormFields(existingExtractedJson.formFields, body),
    resolvedReferences: {
      routeId,
      hotelSupplierId,
      supplierId: trainSupplierId,
    },
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      booking_number: jobNumberAllocation.bookingNumber,
      customer_id: customerId,
      assigned_salesperson_id: user?.id ?? null,
      // owner_user_id is the immutable original creator; reassignment uses assigned_salesperson_id.
      owner_user_id: user?.id ?? null,
      is_repeat_client_at_creation: customerIsRepeatClient,
      purpose: body.purpose || "quote",
      source,
      stage: "enquiry",
      departure_date: body.departureDate || null,
      route_id: routeId,
      hotel_supplier_id: hotelSupplierId,
      no_of_adults: body.noOfAdults ?? 1,
      no_of_children: body.noOfChildren ?? 0,
      no_of_adults_original: body.noOfAdults ?? 1,
      no_of_children_original: body.noOfChildren ?? 0,
      no_of_suites: body.noOfSuites ?? 1,
      child_ages: body.childAges || null,
      raw_text: body.rawText || null,
      extracted_json: extractedJson as Json,
      terms_accepted: body.termsAccepted ?? false,
      hotel_phase: body.hotelPhase || "none",
      extend_stay: body.extendStay === "yes" || body.extendStay === true || false,
      extra_nights: body.extraNights ? Number(body.extraNights) : null,
      additional_services: !!(body.additionalServices),
      additional_services_details: body.additionalServicesDetails || null,
      promotion_code: body.promotionCode || null,
    })
    .select("id, booking_number")
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 })
  }

  // Whatever the consultant typed into "Additional Notes" on the review screen. It used to be
  // dropped on save. Best-effort, like every other write below: a note must never fail an enquiry.
  const enquiryNote = body.notes?.trim()
  if (enquiryNote) {
    const { error: noteError } = await supabase.from("booking_notes").insert({
      booking_id: booking.id,
      author_id: user?.id ?? null,
      body: enquiryNote,
    })
    if (noteError) console.error("enquiries:bookingNote", noteError)
  }

  // --- 3. Insert booking_suites ---
  // Client ids are re-validated server-side against the supplier's real vocabulary, and any unit
  // that arrived unresolved but carries raw wording is resolved here.
  const { units: resolvedSuiteUnits, vocabulary: suiteVocabulary } = await resolveEnquirySuiteUnits(
    supabase,
    trainSupplierId,
    incomingSuiteUnits,
  )
  const unresolvedSuiteCount = resolvedSuiteUnits.filter((unit) => !unit.suiteTypeId).length

  if (resolvedSuiteUnits.length > 0) {
    await supabase.from("booking_suites").insert(
      resolvedSuiteUnits.map((unit) => ({
        booking_id: booking.id,
        suite_number: unit.suiteNumber,
        suite_type_id: unit.suiteTypeId,
        // Fall back to the customer's own wording so the row still says what was asked for.
        suite_type_name: unit.suiteTypeName ?? unit.rawPhrase,
        bedroom_type_id: unit.bedroomTypeId,
        bedroom_layout_id: unit.bedroomLayoutId,
        bathroom_type_id: unit.bathroomTypeId,
        source_phrase: unit.rawPhrase || null,
        match_json: unit.matchJson,
      })),
    )
  }

  // Report an unidentified suite on the booking. This never blocks: quote build is the hard gate.
  if (unresolvedSuiteCount > 0 || suiteReviewMissingFields.length > 0) {
    const missingFields = withSuiteTypeMissingField(suiteReviewMissingFields, unresolvedSuiteCount > 0)
    if (missingFields.length > 0) {
      await supabase
        .from("bookings")
        .update({
          email_import_needs_review: true,
          email_import_missing_fields: missingFields,
        })
        .eq("id", booking.id)
    }
  }

  // Alias learning (service-role only, best-effort — a failed write must never fail an enquiry).
  //
  // "service-role only" is literal: suite_vocab_aliases has RLS on with no INSERT/UPDATE policy
  // for `authenticated`, so passing the request's session client here meant every learned alias
  // was rejected by RLS and swallowed by the store's best-effort contract — the self-confirming
  // alias loop never learned anything. The caller is already authorised above.
  if (suiteVocabulary) {
    const supplierIdForAliases = suiteVocabulary.supplierId
    const aliasClient = createServiceClient()
    try {
      const corrections: SuiteAliasWrite[] = []
      for (const unit of resolvedSuiteUnits) {
        if (!unit.rawPhrase) continue
        for (const axis of unit.editedAxes) {
          const targetId = unitAxisValue(axis, unit)
          if (targetId) {
            corrections.push({ supplierId: supplierIdForAliases, phrase: unit.rawPhrase, axis, targetId })
          }
        }
      }
      if (corrections.length > 0) {
        await recordSuiteAliasCorrections(aliasClient, corrections, user?.id ?? null)
        await supabase.from("audit_logs").insert({
          actor: user?.email ?? "system",
          actor_user_id: user?.id ?? null,
          entity_type: "Booking",
          entity_id: booking.id,
          action: "suite_alias_learned",
          meta_json: { corrections: corrections.map(({ phrase, axis, targetId }) => ({ phrase, axis, targetId })) },
        })
      }

      // A suggestion that came from an unconfirmed alias and survived untouched is now trusted.
      for (const unit of resolvedSuiteUnits) {
        if (!unit.rawPhrase || unit.aliasAcceptedAxes.length === 0) continue
        await promoteSuiteAliases(aliasClient, supplierIdForAliases, unit.rawPhrase, unit.aliasAcceptedAxes)
      }
    } catch (error) {
      console.error("enquiries:suiteAliasLearning", error)
    }
  }

  // Auto-build the booking's services from what intake already resolved -- never a guess of its
  // own (see lib/auto-build/build-from-enquiry.ts). A failed build must never fail the enquiry
  // it came from, same contract as alias learning above.
  try {
    const autoBuildResult = await autoBuildBookingServices(supabase, {
      bookingId: booking.id,
      trainSupplierId,
      hotelSupplierId,
      routeId,
      routeReversed,
      departureDate: body.departureDate || null,
      hotelPhase: body.hotelPhase ?? null,
    })
    if (autoBuildResult.servicesCreated > 0 || autoBuildResult.skipped.length > 0) {
      await supabase.from("audit_logs").insert({
        actor: user?.email ?? (body.rawText ? "consultant" : "system"),
        actor_user_id: user?.id ?? null,
        entity_type: "Booking",
        entity_id: booking.id,
        action: "booking_auto_built",
        meta_json: autoBuildResult as unknown as Json,
      })
    }
  } catch (error) {
    console.error("enquiries:autoBuild", error)
  }

  // --- 4. Insert travellers (if provided) ---
  type TravellerInsert = {
    booking_id: string
    first_name: string
    last_name: string
    prefix: string | null
    id_passport: string | null
    date_of_birth: string | null
    is_child: boolean
    sort_order: number
  }
  const travellerRows: TravellerInsert[] = []
  // Travellers arrive from an external webhook payload; shape is validated at the Zod boundary above
  type TravellerInput = Record<string, unknown>
  const adultTravellers: TravellerInput[] = Array.isArray(body.travellers) ? (body.travellers as TravellerInput[]) : []
  const childTravellers: TravellerInput[] = Array.isArray(body.childTravellers) ? (body.childTravellers as TravellerInput[]) : []

  adultTravellers.forEach((t, idx) => {
    travellerRows.push({
      booking_id: booking.id,
      first_name: typeof t.name === "string" ? normalizeFirstName(t.name) : (t.name as string),
      last_name: typeof t.surname === "string" ? normalizeLastName(t.surname) : (t.surname as string),
      prefix: typeof t.prefix === "string" ? t.prefix : null,
      id_passport: typeof t.idPassport === "string" ? t.idPassport : null,
      date_of_birth: typeof t.dateOfBirth === "string" ? t.dateOfBirth : null,
      is_child: false,
      sort_order: idx,
    })
  })
  childTravellers.forEach((t, idx) => {
    travellerRows.push({
      booking_id: booking.id,
      first_name: typeof t.name === "string" ? normalizeFirstName(t.name) : (t.name as string),
      last_name: typeof t.surname === "string" ? normalizeLastName(t.surname) : (t.surname as string),
      prefix: typeof t.prefix === "string" ? t.prefix : null,
      id_passport: typeof t.idPassport === "string" ? t.idPassport : null,
      date_of_birth: typeof t.dateOfBirth === "string" ? t.dateOfBirth : null,
      is_child: true,
      sort_order: idx,
    })
  })

  if (travellerRows.length > 0) {
    await supabase.from("travellers").insert(travellerRows)
  }

  const transportRequests = Array.isArray(body.transportRequests) ? body.transportRequests : []
  const rentalDetailRows: VehicleRentalDetailsInsert[] = []

  // Explicit resolution mirrors what the DB trigger (stamp_transport_request_pricing_basis)
  // would do anyway for a NULL value -- doing it here keeps this insert type-safe without
  // relying on trigger behaviour the caller can't see. Rentals are always per_vehicle.
  const transportSupplierIds = Array.from(
    new Set(
      transportRequests
        .map((request: Record<string, unknown>) => normalizeNullableText(request.supplierId))
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const transferBasisBySupplierId = new Map<string, "per_vehicle" | "per_person">()
  if (transportSupplierIds.length > 0) {
    const { data: transportSuppliers } = await supabase
      .from("suppliers")
      .select("id, transfer_pricing_basis")
      .in("id", transportSupplierIds)
    for (const row of transportSuppliers ?? []) {
      transferBasisBySupplierId.set(row.id, row.transfer_pricing_basis)
    }
  }

  const transportRows: TransportRequestInsert[] = transportRequests
    .map((request: Record<string, unknown>, index: number): TransportRequestInsert | null => {
      const pickupPoint = normalizeNullableText(request.pickupPoint)
      const dropoffPoint = normalizeNullableText(request.dropoffPoint)
      if (!pickupPoint || !dropoffPoint) return null

      const serviceType = normalizeTransportServiceType(request.serviceType)
      const id = randomUUID()
      const supplierId = normalizeNullableText(request.supplierId)
      const rentalDetails =
        request.rentalDetails && typeof request.rentalDetails === "object" && !Array.isArray(request.rentalDetails)
          ? request.rentalDetails as Record<string, unknown>
          : {}
      if (serviceType === "rental") {
        rentalDetailRows.push({
          transport_request_id: id,
          return_at: normalizeNullableText(rentalDetails.returnAt) ?? normalizeNullableText(request.returnAt),
          return_cutoff_time: normalizeNullableText(rentalDetails.returnCutoffTime),
        })
      }

      return {
        id,
        booking_id: booking.id,
        service_type: serviceType,
        supplier_id: supplierId,
        route_id: normalizeNullableText(request.routeId),
        suite_type_id: normalizeNullableText(request.suiteTypeId),
        pickup_point: pickupPoint,
        dropoff_point: dropoffPoint,
        pickup_at: normalizeNullableText(request.pickupAt),
        passenger_count: normalizeNullableNumber(request.passengerCount),
        luggage_count: normalizeNullableNumber(request.luggageCount),
        flight_number: normalizeNullableText(request.flightNumber),
        notes: normalizeNullableText(request.notes),
        sort_order: index,
        pricing_basis:
          serviceType === "transfer" && supplierId
            ? transferBasisBySupplierId.get(supplierId) ?? "per_vehicle"
            : "per_vehicle",
      }
    })
    .filter((row: TransportRequestInsert | null): row is TransportRequestInsert => Boolean(row))

  if (transportRows.length > 0) {
    await supabase.from("booking_transport_requests").insert(transportRows)
  }
  if (rentalDetailRows.length > 0) {
    await supabase.from("booking_vehicle_rental_details").insert(rentalDetailRows)
  }

  const draftQuote = await createDraftQuoteForBooking({
    supabase,
    bookingId: booking.id,
    bookingNumber: booking.booking_number,
    travelDate: body.departureDate || null,
  })

  // --- 5. Audit log ---
  await supabase.from("audit_logs").insert({
    actor: user?.email ?? (body.rawText ? "consultant" : "system"),
    actor_user_id: user?.id ?? null,
    entity_type: "Booking",
    entity_id: booking.id,
    action: `created_from_${source}`,
    meta_json: {
      draft_quote_id: draftQuote.quoteId,
      draft_quote_warning: draftQuote.warning,
      assigned_salesperson_id: user?.id ?? null,
    },
  })

  return NextResponse.json({
    bookingNumber: booking.booking_number,
    bookingId: booking.id,
    // Legacy field names kept so the public form still works
    jobNumber: booking.booking_number,
    jobId: booking.id,
    quoteId: draftQuote.quoteId,
    quoteWarning: draftQuote.warning,
    customerId,
    customerIsRepeatClient,
  })
}

interface ResolveEnquiryCustomerInput {
  normalizedEmail: string | undefined
  firstName: string | null
  lastName: string | null
  phone: string | null
  country: string | null
  title: string | null
  province: string | null
  nowIso: string
  existingCustomerId?: string | null
}

/**
 * Writes the corrections an intake carries onto a customer that already exists.
 *
 * Only what this enquiry actually carries: an intake without a country must not null out the
 * country an existing customer already has, which `customer_complete` then blocks every forward
 * stage move on.
 */
async function applyCustomerIntakeUpdates(
  supabase: ServiceClient,
  customerId: string,
  input: ResolveEnquiryCustomerInput,
): Promise<void> {
  await supabase
    .from("customers")
    .update({
      first_name: input.firstName ?? undefined,
      last_name: input.lastName ?? undefined,
      phone: input.phone ?? undefined,
      country: input.country ?? undefined,
      province: input.province ?? undefined,
      title: input.title ?? undefined,
      updated_at: input.nowIso,
    })
    .eq("id", customerId)
}

export async function resolveEnquiryCustomer(
  supabase: ServiceClient,
  input: ResolveEnquiryCustomerInput,
): Promise<{ customerId: string | null; customerIsRepeatClient: boolean }> {
  if (input.existingCustomerId) {
    const { data: presetCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", input.existingCustomerId)
      .maybeSingle()

    if (presetCustomer) {
      const { data: priorCompletedBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("customer_id", presetCustomer.id)
        .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)
        .limit(1)
      // The review modal prefills this customer's details and lets the consultant correct them.
      // Returning here without writing them back threw every one of those corrections away.
      await applyCustomerIntakeUpdates(supabase, presetCustomer.id, input)
      return {
        customerId: presetCustomer.id,
        customerIsRepeatClient: (priorCompletedBookings ?? []).length > 0,
      }
    }
  }

  const { data: existingCustomer } = input.normalizedEmail
    ? await supabase
        .from("customers")
        .select("id")
        .eq("email", input.normalizedEmail)
        .maybeSingle()
    : { data: null }

  if (existingCustomer) {
    const { data: priorCompletedBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("customer_id", existingCustomer.id)
      .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)
      .limit(1)
    const customerIsRepeatClient = (priorCompletedBookings ?? []).length > 0

    await applyCustomerIntakeUpdates(supabase, existingCustomer.id, input)

    return { customerId: existingCustomer.id, customerIsRepeatClient }
  }

  const { data: newCustomer, error: customerError } = await supabase
    .from("customers")
    .insert({
      first_name: input.firstName ?? "",
      last_name: input.lastName ?? "",
      email: input.normalizedEmail ?? "",
      phone: input.phone,
      country: input.country,
      province: input.province,
      title: input.title,
    })
    .select("id")
    .single()

  if (customerError || !newCustomer) {
    return { customerId: null, customerIsRepeatClient: false }
  }

  return { customerId: newCustomer.id, customerIsRepeatClient: false }
}
