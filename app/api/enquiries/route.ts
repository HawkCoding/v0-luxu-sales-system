import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { addJobNumberingMetadata, allocateJobNumberForBooking, type JobNumberAllocation } from "@/lib/job-numbering"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { buildPackageQuoteLineItems, calculateQuoteTotals } from "@/lib/quotes/build-from-package"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import type { PackageDetail, QuoteLineItem } from "@/lib/types"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"
import { COMPLETED_REPEAT_BOOKING_STAGES } from "@/lib/customer-repeat-status"
import { loadPackageDetail } from "../packages/[slug]/helpers"

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
}
type VehicleRentalDetailsInsert = {
  transport_request_id: string
  return_at: string | null
  return_cutoff_time: string | null
}

type SuiteSelection = {
  suiteTypeId: string | null
  suiteTypeName: string
}

function normalizeLookupValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
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

export function normalizeSuiteSelections(body: Record<string, unknown>): SuiteSelection[] {
  const structuredSelections = Array.isArray(body.suiteSelections)
    ? body.suiteSelections
        .map((selection: unknown): SuiteSelection | null => {
          if (!selection || typeof selection !== "object") return null

          const suiteTypeId = normalizeNullableText((selection as Record<string, unknown>).suiteTypeId)
          const suiteTypeName = normalizeNullableText((selection as Record<string, unknown>).suiteTypeName)
          if (!suiteTypeName) return null

          return { suiteTypeId, suiteTypeName }
        })
        .filter((selection: SuiteSelection | null): selection is SuiteSelection => Boolean(selection))
    : []

  if (structuredSelections.length > 0) {
    return structuredSelections
  }

  return Array.isArray(body.suiteTypes)
    ? body.suiteTypes
        .map((suiteName: unknown): SuiteSelection | null => {
          const suiteTypeName = normalizeNullableText(suiteName)
          return suiteTypeName ? { suiteTypeId: null, suiteTypeName } : null
        })
        .filter((selection: SuiteSelection | null): selection is SuiteSelection => Boolean(selection))
    : []
}

export async function resolveSuiteSelectionIds(
  supabase: ServiceClient,
  supplierId: unknown,
  selections: SuiteSelection[],
): Promise<SuiteSelection[]> {
  const normalizedSupplierId = normalizeNullableText(supplierId)
  if (!normalizedSupplierId || selections.length === 0) {
    return selections
  }

  const unresolvedNames = selections
    .filter((selection) => !selection.suiteTypeId)
    .map((selection) => selection.suiteTypeName)
  if (unresolvedNames.length === 0) {
    return selections
  }

  const { data: suiteTypes } = await supabase
    .from("suite_types")
    .select("id, name")
    .eq("supplier_id", normalizedSupplierId)
    .eq("active", true)

  const suiteTypeByName = new Map(
    (suiteTypes ?? []).map((suiteType) => [normalizeLookupValue(suiteType.name), suiteType.id]),
  )

  return selections.map((selection) => ({
    ...selection,
    suiteTypeId: selection.suiteTypeId ?? suiteTypeByName.get(normalizeLookupValue(selection.suiteTypeName)) ?? null,
  }))
}

function addDaysToDateString(value: string, days: number): string {
  const [year = "1970", month = "1", day = "1"] = value.split("-")
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function getDefaultQuoteValidityDate(): string {
  return addDaysToDateString(new Date().toISOString().slice(0, 10), 14)
}

async function findRouteId(supabase: ServiceClient, direction: unknown): Promise<string | null> {
  if (typeof direction !== "string" || !direction.trim()) return null

  const { data: exactRoute } = await supabase
    .from("routes")
    .select("id")
    .ilike("name", direction.trim())
    .maybeSingle()

  return exactRoute?.id ?? null
}

async function findPackageId(supabase: ServiceClient, packageOption: unknown): Promise<string | null> {
  if (typeof packageOption !== "string" || !packageOption.trim()) return null

  const normalizedOption = normalizeLookupValue(packageOption)
  const { data: packages } = await supabase
    .from("packages")
    .select("id, name")
    .eq("active", true)

  const match = (packages ?? []).find((item) => {
    const normalizedName = normalizeLookupValue(item.name)
    return normalizedName === normalizedOption || normalizedOption.includes(normalizedName) || normalizedName.includes(normalizedOption)
  })

  return match?.id ?? null
}

async function findPackageSlugById(supabase: ServiceClient, packageId: string): Promise<string | null> {
  const { data } = await supabase
    .from("packages")
    .select("slug")
    .eq("id", packageId)
    .maybeSingle()

  return data?.slug ?? null
}

async function findHotelSupplierId(supabase: ServiceClient, hotelOption: unknown): Promise<string | null> {
  if (typeof hotelOption !== "string" || !hotelOption.trim()) return null

  const normalizedOption = normalizeLookupValue(hotelOption)
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("kind", "hotel_property")
    .eq("active", true)

  const match = (suppliers ?? []).find((item) => {
    const normalizedName = normalizeLookupValue(item.name)
    return normalizedName === normalizedOption || normalizedOption.includes(normalizedName) || normalizedName.includes(normalizedOption)
  })

  return match?.id ?? null
}

function buildDefaultPackageSelections(packageDetail: PackageDetail, suiteTypeNames: string[]) {
  const normalizedSuiteTypeNames = suiteTypeNames.map(normalizeLookupValue).filter(Boolean)

  return packageDetail.legs.map((leg) => {
    const isOptional =
      leg.supplierKind === "hotel_property" ||
      leg.supplierKind === "transfers" ||
      leg.supplierKind === "vehicle_rental"
    const activeSuiteTypes = leg.suiteTypes.filter((suiteType) => suiteType.active)
    const matchedSuiteType = activeSuiteTypes.find((suiteType) =>
      normalizedSuiteTypeNames.includes(normalizeLookupValue(suiteType.name)),
    )

    return {
      legId: leg.id,
      selected: !isOptional,
      routeId: leg.routes.length === 1 ? leg.routes[0].id : undefined,
      suiteTypeId: matchedSuiteType?.id ?? (activeSuiteTypes.length === 1 ? activeSuiteTypes[0].id : undefined),
    }
  })
}

async function createDraftQuoteForBooking({
  supabase,
  bookingId,
  bookingNumber,
  packageId,
  travelDate,
  suiteTypes,
}: {
  supabase: ServiceClient
  bookingId: string
  bookingNumber: string
  packageId: string | null
  travelDate: string | null
  suiteTypes: string[]
}): Promise<{ quoteId: string | null; warning: string | null }> {
  let lineItems: QuoteLineItem[] = []
  let status: "draft" | "pricing_incomplete" = "pricing_incomplete"
  let noPackageMatch = true
  let warning: string | null = null

  if (packageId) {
    noPackageMatch = false
    const packageSlug = await findPackageSlugById(supabase, packageId)

    if (packageSlug) {
      const packageDetailResult = await loadPackageDetail(supabase, packageSlug)

      const packageDetail = "detail" in packageDetailResult ? packageDetailResult.detail : undefined

      if (packageDetail) {
        try {
          const built = await buildPackageQuoteLineItems({
            supabase,
            packageDetail,
            jobId: bookingId,
            travelDate: travelDate ?? new Date().toISOString().slice(0, 10),
            selections: buildDefaultPackageSelections(packageDetail, suiteTypes),
          })
          lineItems = built.lineItems
          status = lineItems.length > 0 ? "draft" : "pricing_incomplete"
        } catch (error) {
          warning = error instanceof Error ? error.message : "Package matched, but pricing could not be pre-filled."
        }
      } else {
        warning = "Package matched, but package details could not be loaded."
      }
    } else {
      warning = "Package matched, but package details could not be loaded."
    }
  } else {
    warning = "No package was matched from the enquiry."
  }

  const totals = calculateQuoteTotals(lineItems)
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      booking_id: bookingId,
      status,
      validity_until: getDefaultQuoteValidityDate(),
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      no_package_match: noPackageMatch,
      quote_number: buildQuoteNumber(bookingNumber, []),
    })
    .select("id")
    .single()

  if (quoteError || !quote) {
    return { quoteId: null, warning: "Booking was created, but the draft quote could not be created." }
  }

  if (lineItems.length > 0) {
    const { error: lineItemsError } = await supabase.from("quote_line_items").insert(
      lineItems.map((lineItem, index) => ({
        quote_id: quote.id,
        description: lineItem.description,
        qty: lineItem.qty,
        unit_price: lineItem.unitPrice,
        total: lineItem.total,
        sort_order: index,
      })),
    )

    if (lineItemsError) {
      warning = "Draft quote was created, but line items could not be saved."
    }
  }

  return { quoteId: quote.id, warning }
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
  else if (filter === "unassigned") query = query.is("owner_user_id", null)
  else if (filter === "my_enquiries") query = query.eq("owner_user_id", user.id)
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

export async function POST(req: Request) {
  const body = await req.json()

  // Use the service-role client — this route is public (web form & paste import)
  // so there is no authenticated user session to rely on.
  const supabase = createServiceClient()
  const sessionClient = await createSessionClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()

  const normalizedEmail = body.email?.toLowerCase().trim()
  const normalizedCustomerFirstName =
    typeof body.name === "string" ? normalizeFirstName(body.name) : body.name
  const normalizedCustomerLastName =
    typeof body.surname === "string" ? normalizeLastName(body.surname) : body.surname
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
  const linkedCustomerId =
    typeof body.linkedCustomerId === "string" && body.linkedCustomerId.trim().length > 0
      ? body.linkedCustomerId.trim()
      : null
  const { customerId, customerIsRepeatClient } = await resolveEnquiryCustomer(supabase, {
    normalizedEmail,
    firstName: normalizedCustomerFirstName,
    lastName: normalizedCustomerLastName,
    phone: body.contactNumber || null,
    country: normalizedCountry,
    title: body.title || null,
    nowIso: new Date().toISOString(),
    existingCustomerId: linkedCustomerId,
  })

  if (!customerId) {
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }

  // --- 2. Insert booking ---
  const source = body.rawText ? "paste_import" : "web_form"
  const routeId = await findRouteId(supabase, body.direction)
  const packageId = await findPackageId(supabase, body.packageOption)
  const hotelSupplierId = await findHotelSupplierId(supabase, body.hotelOption)
  let jobNumberAllocation: JobNumberAllocation
  try {
    jobNumberAllocation = await allocateJobNumberForBooking(supabase, {
      supplierId: normalizeNullableText(body.supplierId),
      parsedSupplier: normalizeNullableText(body.supplier),
      routeId,
      routeName: normalizeNullableText(body.direction),
      packageId,
      packageName: normalizeNullableText(body.packageOption),
      rawText: normalizeNullableText(body.rawText),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to allocate job number" },
      { status: 500 },
    )
  }
  const existingExtractedJson =
    body.extractedJson && typeof body.extractedJson === "object" && !Array.isArray(body.extractedJson)
      ? body.extractedJson as Record<string, unknown>
      : {}
  const existingFormFields =
    existingExtractedJson.formFields && typeof existingExtractedJson.formFields === "object" && !Array.isArray(existingExtractedJson.formFields)
      ? existingExtractedJson.formFields as Record<string, unknown>
      : {}
  const extractedJson = addJobNumberingMetadata({
    ...existingExtractedJson,
    formFields: {
      ...existingFormFields,
      province: body.province || null,
      packageOption: body.packageOption || null,
      hotelOption: body.hotelOption || null,
      flightBooking: body.flightBooking || null,
      flightDepartureDate: body.flightDepartureDate || null,
    },
    resolvedReferences: {
      routeId,
      packageId,
      hotelSupplierId,
      supplierId: normalizeNullableText(body.supplierId),
    },
  }, jobNumberAllocation.resolution)

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
      package_id: packageId,
      hotel_supplier_id: hotelSupplierId,
      no_of_adults: body.noOfAdults ?? 1,
      no_of_children: body.noOfChildren ?? 0,
      no_of_suites: body.noOfSuites ?? 1,
      child_ages: body.childAges || null,
      raw_text: body.rawText || null,
      extracted_json: extractedJson as Json,
      terms_accepted: body.termsAccepted ?? false,
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

  // --- 3. Insert booking_suites ---
  const suiteSelections = await resolveSuiteSelectionIds(
    supabase,
    body.supplierId,
    normalizeSuiteSelections(body),
  )
  const suiteTypes = suiteSelections.map((selection) => selection.suiteTypeName)
  if (suiteSelections.length > 0) {
    const suiteRows = suiteSelections.map((selection, idx) => ({
      booking_id: booking.id,
      suite_number: idx + 1,
      suite_type_id: selection.suiteTypeId,
      suite_type_name: selection.suiteTypeName,
    }))
    await supabase.from("booking_suites").insert(suiteRows)
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
  const adultTravellers: any[] = body.travellers || []
  const childTravellers: any[] = body.childTravellers || []

  adultTravellers.forEach((t: any, idx: number) => {
    travellerRows.push({
      booking_id: booking.id,
      first_name: typeof t.name === "string" ? normalizeFirstName(t.name) : t.name,
      last_name: typeof t.surname === "string" ? normalizeLastName(t.surname) : t.surname,
      prefix: t.prefix || null,
      id_passport: t.idPassport || null,
      date_of_birth: t.dateOfBirth || null,
      is_child: false,
      sort_order: idx,
    })
  })
  childTravellers.forEach((t: any, idx: number) => {
    travellerRows.push({
      booking_id: booking.id,
      first_name: typeof t.name === "string" ? normalizeFirstName(t.name) : t.name,
      last_name: typeof t.surname === "string" ? normalizeLastName(t.surname) : t.surname,
      prefix: t.prefix || null,
      id_passport: t.idPassport || null,
      date_of_birth: t.dateOfBirth || null,
      is_child: true,
      sort_order: idx,
    })
  })

  if (travellerRows.length > 0) {
    await supabase.from("travellers").insert(travellerRows)
  }

  const transportRequests = Array.isArray(body.transportRequests) ? body.transportRequests : []
  const rentalDetailRows: VehicleRentalDetailsInsert[] = []
  const transportRows: TransportRequestInsert[] = transportRequests
    .map((request: Record<string, unknown>, index: number): TransportRequestInsert | null => {
      const pickupPoint = normalizeNullableText(request.pickupPoint)
      const dropoffPoint = normalizeNullableText(request.dropoffPoint)
      if (!pickupPoint || !dropoffPoint) return null

      const serviceType = normalizeTransportServiceType(request.serviceType)
      const id = randomUUID()
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
        supplier_id: normalizeNullableText(request.supplierId),
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
    packageId,
    travelDate: body.departureDate || null,
    suiteTypes,
  })

  // --- 5. Audit log ---
  await supabase.from("audit_logs").insert({
    actor: user?.email ?? (body.rawText ? "consultant" : "system"),
    actor_user_id: user?.id ?? null,
    entity_type: "Booking",
    entity_id: booking.id,
    action: body.rawText ? "created_from_paste_import" : "created_from_web_form",
    meta_json: {
      draft_quote_id: draftQuote.quoteId,
      draft_quote_warning: draftQuote.warning,
      assigned_salesperson_id: user?.id ?? null,
    },
  })

  if (jobNumberAllocation.resolution.needsReview) {
    await supabase.from("audit_logs").insert({
      actor: user?.email ?? (body.rawText ? "consultant" : "system"),
      actor_user_id: user?.id ?? null,
      entity_type: "Booking",
      entity_id: booking.id,
      action: "job_number_product_needs_review",
      meta_json: {
        booking_number: booking.booking_number,
        reason: jobNumberAllocation.resolution.reason,
        sources: jobNumberAllocation.resolution.sources,
      },
    })
  }

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
    needsReview: jobNumberAllocation.resolution.needsReview,
  })
}

interface ResolveEnquiryCustomerInput {
  normalizedEmail: string
  firstName: string
  lastName: string
  phone: string | null
  country: string | null
  title: string | null
  nowIso: string
  existingCustomerId?: string | null
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
      return {
        customerId: presetCustomer.id,
        customerIsRepeatClient: (priorCompletedBookings ?? []).length > 0,
      }
    }
  }

  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("email", input.normalizedEmail)
    .maybeSingle()

  if (existingCustomer) {
    const { data: priorCompletedBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("customer_id", existingCustomer.id)
      .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)
      .limit(1)
    const customerIsRepeatClient = (priorCompletedBookings ?? []).length > 0

    await supabase
      .from("customers")
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        country: input.country,
        title: input.title,
        updated_at: input.nowIso,
      })
      .eq("id", existingCustomer.id)

    return { customerId: existingCustomer.id, customerIsRepeatClient }
  }

  const { data: newCustomer, error: customerError } = await supabase
    .from("customers")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.normalizedEmail,
      phone: input.phone,
      country: input.country,
      title: input.title,
    })
    .select("id")
    .single()

  if (customerError || !newCustomer) {
    return { customerId: null, customerIsRepeatClient: false }
  }

  return { customerId: newCustomer.id, customerIsRepeatClient: false }
}
