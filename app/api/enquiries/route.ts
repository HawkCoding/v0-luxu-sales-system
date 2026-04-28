import { NextResponse } from "next/server"
import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { createServiceClient } from "@/lib/supabase/server"

type ServiceClient = ReturnType<typeof createServiceClient>

function normalizeLookupValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
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

export async function POST(req: Request) {
  const body = await req.json()

  // Use the service-role client — this route is public (web form & paste import)
  // so there is no authenticated user session to rely on.
  const supabase = createServiceClient()

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

  // --- 5. Audit log ---
  await supabase.from("audit_logs").insert({
    actor: body.rawText ? "consultant" : "system",
    entity_type: "Booking",
    entity_id: booking.id,
    action: body.rawText ? "created_from_paste_import" : "created_from_web_form",
  })

  return NextResponse.json({
    bookingNumber: booking.booking_number,
    bookingId: booking.id,
    // Legacy field names kept so the public form still works
    jobNumber: booking.booking_number,
    jobId: booking.id,
    needsReview: false,
  })
}
