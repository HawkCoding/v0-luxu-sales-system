import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"
import { type ParsedDraft } from "@/lib/import/parseEmailDraft"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { resolveSuitePhrases, unresolvedSuitePhrase } from "@/lib/suites/resolve-suite-phrase"
import { loadSupplierSuiteVocabulary } from "@/lib/suites/suite-vocabulary"
import { buildReviewDecision, REVIEW_REASON } from "@/lib/inbound-email/review-reasons"
import { createServiceClient } from "@/lib/supabase/server"
import { allocateJobNumberForBooking } from "@/lib/job-numbering"
import { createRawEmailPreview } from "@/lib/inbound-email/html"
import type { Database, Json } from "@/lib/supabase/types"
import { COMPLETED_REPEAT_BOOKING_STAGES } from "@/lib/customer-repeat-status"
import { findHotelSupplierId, resolveStandaloneSupplier } from "@/lib/resolvers/supplier-resolver"
import { findRouteMatch } from "@/lib/resolvers/route-resolver"
import { autoBuildBookingServices } from "@/lib/auto-build/build-from-enquiry"
import { createDraftQuoteForBooking } from "@/lib/quotes/create-draft-quote"

type ServiceClient = ReturnType<typeof createServiceClient>
type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"]

export interface EmailImportContext {
  emailAccountId: string
  mailboxEmail: string
  subject: string
  receivedAt: string | null
  rawText: string
  missingFields: string[]
  warnings: string[]
}

export interface CreatedEmailBooking {
  id: string
  bookingNumber: string
  duplicateOfBookingId: string | null
  rawPreview: string
  /**
   * The final review decision, computed after DB resolution -- richer than the pre-resolution
   * `EmailImportContext.missingFields`/`warnings` the caller passed in, since it also accounts for
   * an unresolved supplier/route and a possible duplicate. Callers filing the message into an IMAP
   * folder or recording its sync status should use these, not the pre-resolution values, so a
   * booking flagged Needs Review here is filed and logged as Needs Review everywhere else too.
   */
  needsReview: boolean
  missingFields: string[]
  warnings: string[]
}

function fallbackEmail(firstName: string, surname: string): string {
  const base = [firstName, surname].filter(Boolean).join(".").toLowerCase().replace(/[^a-z0-9.]+/g, "")
  return `inbound-${base || "unknown"}-${Date.now()}@email-import.local`
}

async function findPossibleDuplicateBookingId(
  supabase: ServiceClient,
  parsed: ParsedDraft,
): Promise<string | null> {
  const since = new Date()
  since.setDate(since.getDate() - 14)

  if (parsed.customer.email) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("email", parsed.customer.email.toLowerCase().trim())
      .maybeSingle()

    if (customer) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id")
        .eq("customer_id", customer.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (booking) return booking.id
    }
  }

  const normalizedFirstName = normalizeFirstName(parsed.customer.firstName)
  const normalizedLastName = normalizeLastName(parsed.customer.surname)
  if (!normalizedFirstName || !normalizedLastName) return null

  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .ilike("first_name", normalizedFirstName)
    .ilike("last_name", normalizedLastName)

  const customerIds = (customers ?? []).map((customer) => customer.id)
  if (customerIds.length === 0) return null

  let query = supabase
    .from("bookings")
    .select("id")
    .in("customer_id", customerIds)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)

  if (parsed.trip.departureDate) {
    query = query.eq("departure_date", parsed.trip.departureDate)
  }

  const { data: booking } = await query.maybeSingle()
  return booking?.id ?? null
}

export async function createEmailBookingFromParsedDraft(
  parsed: ParsedDraft,
  context: EmailImportContext,
): Promise<CreatedEmailBooking> {
  const supabase = createServiceClient()
  const payload = buildEnquiryImportPayload(parsed)
  const countryAliasMap = await loadCountryAliasMap(supabase)
  const detectedCountryFromText =
    (!payload.country || payload.country.toLowerCase() === "other")
      ? detectCountryInText(context.rawText, countryAliasMap)
      : null
  const normalizedCountry = normalizeCountry(
    detectedCountryFromText ?? payload.country,
    countryAliasMap,
  )
  const normalizedFirstName = normalizeFirstName(payload.name || "Unknown")
  const normalizedLastName = normalizeLastName(payload.surname || "Unknown")
  const normalizedEmail = (payload.email || fallbackEmail(normalizedFirstName, normalizedLastName))
    .toLowerCase()
    .trim()
  const duplicateOfBookingId = await findPossibleDuplicateBookingId(supabase, parsed)

  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle()

  let customerId: string
  let customerIsRepeatClient = false

  if (existingCustomer) {
    customerId = existingCustomer.id
    const { data: priorCompletedBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("customer_id", customerId)
      .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)
      .limit(1)
    customerIsRepeatClient = (priorCompletedBookings ?? []).length > 0

    await supabase
      .from("customers")
      .update({
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        phone: payload.contactNumber || null,
        country: normalizedCountry,
        province: payload.province || null,
        title: payload.title || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
  } else {
    const { data: newCustomer, error: customerError } = await supabase
      .from("customers")
      .insert({
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        email: normalizedEmail,
        phone: payload.contactNumber || null,
        country: normalizedCountry,
        province: payload.province || null,
        title: payload.title || null,
      })
      .select("id")
      .single()

    if (customerError || !newCustomer) {
      throw new Error(customerError?.message || "Failed to create customer")
    }

    customerId = newCustomer.id
  }

  // The supplier this enquiry is FOR: a train operator on a journey, or the hotel itself on a
  // standalone stay (Kruger Shalati). The parser already decided which by matching the email
  // against the standalone pool, so the kind travels with the wording rather than being re-guessed.
  const primarySupplier = await resolveStandaloneSupplier(supabase, parsed.trip.supplier)
  const isStayImport = primarySupplier?.kind === "hotel_property"
  // A stay has no direction and no route -- its "route" is a meal plan chosen in Build Booking.
  const { routeId, reversed: routeReversed } = isStayImport
    ? { routeId: null, reversed: false }
    : await findRouteMatch(supabase, payload.direction, isStayImport ? null : primarySupplier?.id ?? null)
  // On a stay the hotel IS the booking, so it fills the hotel slot rather than being resolved from
  // a separate "hotel option" the form never asks for.
  const hotelSupplierId = isStayImport
    ? primarySupplier.id
    : await findHotelSupplierId(supabase, payload.hotelOption)
  const stayNights = isStayImport && payload.nights && payload.nights > 0 ? payload.nights : null

  // Suite resolution needs the supplier's vocabulary (room types on a stay, suite types on a
  // journey), so it can only run once the primary supplier is known. Without one, the raw wording
  // is kept but nothing is resolved.
  const suiteVocabulary = primarySupplier
    ? await loadSupplierSuiteVocabulary(supabase, primarySupplier.id)
    : null
  const suiteResolutions = suiteVocabulary
    ? resolveSuitePhrases(parsed.guests.suitePhrases, suiteVocabulary)
    : parsed.guests.suitePhrases.map((phrase) => unresolvedSuitePhrase(phrase))
  const unresolvedSuiteCount = suiteResolutions.filter((resolution) => !resolution.suiteTypeId).length
  const rawPreview = createRawEmailPreview(context.rawText)
  const extractedJson = {
    ...payload.extractedJson,
    parsedFrom: "inbound_email",
    emailImport: {
      emailAccountId: context.emailAccountId,
      mailboxEmail: context.mailboxEmail,
      subject: context.subject,
      receivedAt: context.receivedAt,
      missingFields: context.missingFields,
      warnings: context.warnings,
    },
    formFields: {
      ...payload.extractedJson.formFields,
      province: payload.province || null,
      packageOption: payload.packageOption || null,
      hotelOption: payload.hotelOption || null,
      flightBooking: payload.flightBooking || null,
      flightDepartureDate: payload.flightDepartureDate || null,
    },
    resolvedReferences: {
      routeId,
      hotelSupplierId,
      supplierId: primarySupplier?.id ?? null,
      supplierKind: primarySupplier?.kind ?? null,
    },
  } satisfies Json

  // The customer's wording was recognised (so validateDraft's raw-text check already passed) but
  // didn't match any active supplier or route row -- a distinct failure from "the email never
  // mentioned a supplier at all", and one auto-build silently no-ops on, so it must surface here
  // even though it's caught too late to have been part of the pre-resolution review metadata.
  const resolutionFailureReasons: string[] = []
  if (parsed.trip.supplier && !primarySupplier) {
    resolutionFailureReasons.push(REVIEW_REASON.supplierUnmatched)
  }
  if (!isStayImport && payload.direction && !routeId) {
    // Separated so the review screen says WHY: an unresolved operator can't be given a route at
    // all (findRouteMatch refuses to pick between operators), which is a different fix for the
    // consultant than wording that matches no route this operator files.
    resolutionFailureReasons.push(
      primarySupplier ? REVIEW_REASON.routeUnmatched : REVIEW_REASON.routeUnresolvedNoOperator,
    )
  }

  // An unidentified suite is a reported gap, never a blocker for creation: the booking is created
  // either way and quote build stays the only hard stop. Every reason -- including a possible
  // duplicate, which used to raise the flag silently -- goes through buildReviewDecision so the flag
  // can never be set without the banner having something to say.
  const {
    needsReview,
    missingFields: missingFieldsWithResolutionGaps,
    warnings: reviewWarnings,
  } = buildReviewDecision({
    missingFields: context.missingFields,
    warnings: context.warnings,
    hasUnresolvedSuites: unresolvedSuiteCount > 0,
    resolutionFailures: resolutionFailureReasons,
    duplicateOfBookingId,
  })

  const { bookingNumber: allocatedBookingNumber } = await allocateJobNumberForBooking(supabase)

  const bookingInsert: BookingInsert = {
    booking_number: allocatedBookingNumber,
    customer_id: customerId,
    is_repeat_client_at_creation: customerIsRepeatClient,
    purpose: payload.purpose,
    source: "email",
    stage: "enquiry",
    // Trip start either way: the departure date on a journey, the check-in date on a stay.
    departure_date: payload.departureDate || null,
    duration_nights: stayNights,
    route_id: routeId,
    hotel_supplier_id: hotelSupplierId,
    primary_supplier_id: primarySupplier?.id ?? null,
    // Never defaulted to 1. parseEmailDraft deliberately leaves an unstated count at 0 ("an
    // invented suite count silently manufactures a room nobody asked for") and the importer used
    // to override that honest 0 -- an out-of-office reply was stored as 1 adult + 1 suite with
    // zero booking_suites rows. 0 now survives to the review screen, where the missing-field flag
    // is the only claim made about it.
    no_of_adults: payload.noOfAdults || 0,
    no_of_children: payload.noOfChildren || 0,
    no_of_adults_original: payload.noOfAdults || 0,
    no_of_children_original: payload.noOfChildren || 0,
    no_of_suites: payload.noOfSuites || 0,
    child_ages: payload.childAges.length > 0 ? payload.childAges : null,
    raw_text: context.rawText,
    extracted_json: extractedJson,
    terms_accepted: payload.termsAccepted,
    hotel_phase: payload.hotelPhase || "none",
    extend_stay: payload.extendStay ?? false,
    additional_services: payload.additionalServices,
    additional_services_details: payload.additionalServicesDetails || null,
    // Parsed by parseEmailDraft and carried on the payload, but never written here -- the
    // discount a customer was promised on the form ("Promotion Code - GET 5% DISCOUNT")
    // was silently dropped on every imported enquiry, and no screen can put it back.
    promotion_code: payload.promotionCode || null,
    // Low confidence alone no longer forces a review -- it's still shown as a warning, but a
    // consultant glancing over a correctly-parsed enquiry shouldn't be blocked by a date format
    // guess. Review is reserved for things actually missing, unresolved, or a possible duplicate.
    email_import_needs_review: needsReview,
    email_import_missing_fields: missingFieldsWithResolutionGaps,
    email_import_warnings: reviewWarnings,
    email_import_duplicate_of_booking_id: duplicateOfBookingId,
    email_import_subject: context.subject,
    email_import_mailbox: context.mailboxEmail,
    email_import_received_at: context.receivedAt,
    email_import_raw_preview: rawPreview,
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert(bookingInsert)
    .select("id, booking_number")
    .single()

  if (bookingError || !booking) {
    throw new Error(bookingError?.message || "Failed to create booking")
  }

  // Whatever the customer typed into the form's "Additional Comments" box. It used to survive only
  // inside raw_text, because the parser folded it into the travel-services answer instead of
  // reading it. Best-effort and unattributed -- no human is present on this path, and a note must
  // never fail an import.
  if (payload.customerComments) {
    const { error: noteError } = await supabase.from("booking_notes").insert({
      booking_id: booking.id,
      author_id: null,
      body: `From enquiry form — Additional Comments:\n${payload.customerComments}`,
    })
    if (noteError) console.error("importBooking:customerComments", noteError)
  }

  // Resolve the customer's raw suite wording against this supplier's real vocabulary. Anything
  // uncertain is stored as null with its provenance rather than guessed -- and no alias is ever
  // recorded or promoted here, because there is no human in this path to learn from.
  if (suiteResolutions.length > 0) {
    await supabase.from("booking_suites").insert(
      suiteResolutions.map((resolution, index) => ({
        booking_id: booking.id,
        suite_number: index + 1,
        suite_type_id: resolution.suiteTypeId,
        suite_type_name:
          suiteVocabulary?.suiteTypes.find((entry) => entry.id === resolution.suiteTypeId)?.name
          ?? resolution.rawPhrase,
        bedroom_type_id: resolution.bedroomTypeId,
        bedroom_layout_id: resolution.bedroomLayoutId,
        bathroom_type_id: resolution.bathroomTypeId,
        source_phrase: resolution.rawPhrase,
        match_json: JSON.parse(
          JSON.stringify({
            score: resolution.score,
            source: resolution.source,
            unresolvedAxes: resolution.unresolvedAxes,
            axes: resolution.axes,
          }),
        ) as Json,
      })),
    )
  }

  // Auto-build the booking's services from what was just resolved -- never a guess of its own
  // (see lib/auto-build/build-from-enquiry.ts). No human is present on this path, so a failed
  // build must never fail the import that created the booking in the first place.
  try {
    const autoBuildResult = await autoBuildBookingServices(supabase, {
      bookingId: booking.id,
      primarySupplierId: primarySupplier?.id ?? null,
      primarySupplierKind: primarySupplier?.kind ?? null,
      hotelSupplierId,
      routeId,
      routeReversed,
      departureDate: payload.departureDate || null,
      nights: stayNights,
      hotelPhase: payload.hotelPhase ?? null,
    })
    if (autoBuildResult.servicesCreated > 0 || autoBuildResult.skipped.length > 0) {
      await supabase.from("audit_logs").insert({
        actor: "system",
        entity_type: "Booking",
        entity_id: booking.id,
        action: "booking_auto_built",
        meta_json: autoBuildResult as unknown as Json,
      })
    }

    await createDraftQuoteForBooking({
      supabase,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      travelDate: payload.departureDate || null,
    })
  } catch (error) {
    console.error("import-booking:autoBuild", error)
  }

  await supabase.from("audit_logs").insert({
    actor: "system",
    entity_type: "Booking",
    entity_id: booking.id,
    action: "created_from_inbound_email",
    meta_json: {
      mailbox: context.mailboxEmail,
      subject: context.subject,
      received_at: context.receivedAt,
    },
  })

  if (duplicateOfBookingId) {
    await supabase.from("audit_logs").insert({
      actor: "system",
      entity_type: "Booking",
      entity_id: booking.id,
      action: "possible_duplicate_email_import",
      meta_json: { duplicate_of_booking_id: duplicateOfBookingId },
    })
  }

  return {
    id: booking.id,
    bookingNumber: booking.booking_number,
    duplicateOfBookingId,
    rawPreview,
    needsReview,
    missingFields: missingFieldsWithResolutionGaps,
    warnings: reviewWarnings,
  }
}
