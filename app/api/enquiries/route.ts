import { NextResponse } from "next/server"
import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { buildPackageQuoteLineItems, calculateQuoteTotals } from "@/lib/quotes/build-from-package"
import { buildQuoteNumber } from "@/lib/quotes/quote-number"
import type { PackageDetail, QuoteLineItem } from "@/lib/types"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"
import { loadPackageDetail } from "../packages/[slug]/helpers"

type ServiceClient = ReturnType<typeof createServiceClient>
type TransportServiceType = "transfer" | "rental"
type TransportRequestInsert = {
  booking_id: string
  service_type: TransportServiceType
  supplier_id: string | null
  route_id: string | null
  suite_type_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  return_at: string | null
  passenger_count: number | null
  luggage_count: number | null
  flight_number: string | null
  notes: string | null
  sort_order: number
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
    const isOptional = leg.supplierKind === "hotel_property" || leg.supplierKind === "transfers"
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

  // --- 1. Upsert customer (match on email) ---
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle()

  let customerId: string

  if (existingCustomer) {
    customerId = existingCustomer.id
    // Update contact details in case they changed
    await supabase
      .from("customers")
      .update({
        first_name: normalizedCustomerFirstName,
        last_name: normalizedCustomerLastName,
        phone: body.contactNumber || null,
        country: normalizedCountry,
        title: body.title || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId)
  } else {
    const { data: newCustomer, error: customerError } = await supabase
      .from("customers")
      .insert({
        first_name: normalizedCustomerFirstName,
        last_name: normalizedCustomerLastName,
        email: normalizedEmail,
        phone: body.contactNumber || null,
        country: normalizedCountry,
        title: body.title || null,
      })
      .select("id")
      .single()

    if (customerError || !newCustomer) {
      return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
    }
    customerId = newCustomer.id
  }

  // --- 2. Insert booking ---
  const source = body.rawText ? "paste_import" : "web_form"
  const routeId = await findRouteId(supabase, body.direction)
  const packageId = await findPackageId(supabase, body.packageOption)
  const hotelSupplierId = await findHotelSupplierId(supabase, body.hotelOption)
  const existingExtractedJson =
    body.extractedJson && typeof body.extractedJson === "object" && !Array.isArray(body.extractedJson)
      ? body.extractedJson as Record<string, unknown>
      : {}
  const existingFormFields =
    existingExtractedJson.formFields && typeof existingExtractedJson.formFields === "object" && !Array.isArray(existingExtractedJson.formFields)
      ? existingExtractedJson.formFields as Record<string, unknown>
      : {}
  const extractedJson = {
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
    },
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      customer_id: customerId,
      assigned_salesperson_id: user?.id ?? null,
      owner_user_id: user?.id ?? null,
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
      extracted_json: extractedJson,
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
  const suiteTypes: string[] = Array.isArray(body.suiteTypes) ? body.suiteTypes : []
  if (suiteTypes.length > 0) {
    const suiteRows = suiteTypes.map((suiteName, idx) => ({
      booking_id: booking.id,
      suite_number: idx + 1,
      suite_type_name: suiteName,
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
  const transportRows: TransportRequestInsert[] = transportRequests
    .map((request: Record<string, unknown>, index: number): TransportRequestInsert | null => {
      const pickupPoint = normalizeNullableText(request.pickupPoint)
      const dropoffPoint = normalizeNullableText(request.dropoffPoint)
      if (!pickupPoint || !dropoffPoint) return null

      const serviceType = normalizeTransportServiceType(request.serviceType)
      return {
        booking_id: booking.id,
        service_type: serviceType,
        supplier_id: normalizeNullableText(request.supplierId),
        route_id: normalizeNullableText(request.routeId),
        suite_type_id: normalizeNullableText(request.suiteTypeId),
        pickup_point: pickupPoint,
        dropoff_point: dropoffPoint,
        pickup_at: normalizeNullableText(request.pickupAt),
        return_at: serviceType === "rental" ? normalizeNullableText(request.returnAt) : null,
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

  return NextResponse.json({
    bookingNumber: booking.booking_number,
    bookingId: booking.id,
    // Legacy field names kept so the public form still works
    jobNumber: booking.booking_number,
    jobId: booking.id,
    quoteId: draftQuote.quoteId,
    quoteWarning: draftQuote.warning,
    needsReview: false,
  })
}
