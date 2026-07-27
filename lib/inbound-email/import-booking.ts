import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"
import { type ParsedDraft } from "@/lib/import/parseEmailDraft"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { resolveSuitePhrases, unresolvedSuitePhrase } from "@/lib/suites/resolve-suite-phrase"
import { loadSupplierSuiteVocabulary } from "@/lib/suites/suite-vocabulary"
import { SUITE_TYPE_MISSING_FIELD } from "@/lib/suites/missing-fields"
import { createServiceClient } from "@/lib/supabase/server"
import { allocateJobNumberForBooking } from "@/lib/job-numbering"
import { createRawEmailPreview } from "@/lib/inbound-email/html"
import type { Database, Json } from "@/lib/supabase/types"
import { COMPLETED_REPEAT_BOOKING_STAGES } from "@/lib/customer-repeat-status"
import { resolveTrainSupplierId, findHotelSupplierId } from "@/lib/resolvers/supplier-resolver"
import { findRouteId } from "@/lib/resolvers/route-resolver"
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
        title: payload.title || null,
      })
      .select("id")
      .single()

    if (customerError || !newCustomer) {
      throw new Error(customerError?.message || "Failed to create customer")
    }

    customerId = newCustomer.id
  }

  const trainSupplierId = await resolveTrainSupplierId(supabase, parsed.trip.supplier)
  const routeId = await findRouteId(supabase, payload.direction, trainSupplierId)
  const hotelSupplierId = await findHotelSupplierId(supabase, payload.hotelOption)

  // Suite resolution needs the supplier's vocabulary, so it can only run once the train operator
  // is known. Without one, the raw wording is kept but nothing is resolved.
  const suiteVocabulary = trainSupplierId
    ? await loadSupplierSuiteVocabulary(supabase, trainSupplierId)
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
    },
  } satisfies Json

  // An unidentified suite is a reported gap, never a blocker: the booking is created either way
  // and quote build stays the only hard stop.
  const missingFieldsWithSuites =
    unresolvedSuiteCount > 0 && !context.missingFields.includes(SUITE_TYPE_MISSING_FIELD)
      ? [...context.missingFields, SUITE_TYPE_MISSING_FIELD]
      : context.missingFields

  const { bookingNumber: allocatedBookingNumber } = await allocateJobNumberForBooking(supabase)

  const bookingInsert: BookingInsert = {
    booking_number: allocatedBookingNumber,
    customer_id: customerId,
    is_repeat_client_at_creation: customerIsRepeatClient,
    purpose: payload.purpose,
    source: "email",
    stage: "enquiry",
    departure_date: payload.departureDate || null,
    route_id: routeId,
    hotel_supplier_id: hotelSupplierId,
    no_of_adults: payload.noOfAdults || 1,
    no_of_children: payload.noOfChildren || 0,
    no_of_suites: payload.noOfSuites || 1,
    raw_text: context.rawText,
    extracted_json: extractedJson,
    terms_accepted: true,
    email_import_needs_review:
      missingFieldsWithSuites.length > 0 || context.warnings.length > 0,
    email_import_missing_fields: missingFieldsWithSuites,
    email_import_warnings: context.warnings,
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
      trainSupplierId,
      hotelSupplierId,
      routeId,
      departureDate: payload.departureDate || null,
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
  }
}
