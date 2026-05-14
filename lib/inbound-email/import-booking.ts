import { detectCountryInText, loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { buildEnquiryImportPayload } from "@/lib/import/enquiry-payload"
import { type ParsedDraft } from "@/lib/import/parseEmailDraft"
import {
  addJobNumberingMetadata,
  allocateJobNumberForBooking,
  getTrainProductReviewWarning,
} from "@/lib/job-numbering"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { createServiceClient } from "@/lib/supabase/server"
import { createRawEmailPreview } from "@/lib/inbound-email/html"
import type { Database, Json } from "@/lib/supabase/types"

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

async function findHotelSupplierId(
  supabase: ServiceClient,
  hotelOption: unknown,
): Promise<string | null> {
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

  if (existingCustomer) {
    customerId = existingCustomer.id
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

  const routeId = await findRouteId(supabase, payload.direction)
  const packageId = await findPackageId(supabase, payload.packageOption)
  const hotelSupplierId = await findHotelSupplierId(supabase, payload.hotelOption)
  const rawPreview = createRawEmailPreview(context.rawText)
  const jobNumberAllocation = await allocateJobNumberForBooking(supabase, {
    supplierId: payload.supplierId ?? null,
    parsedSupplier: parsed.trip.supplier,
    routeId,
    routeName: payload.direction,
    packageId,
    packageName: payload.packageOption ?? null,
    rawText: context.rawText,
  })
  const emailImportWarnings = jobNumberAllocation.resolution.needsReview
    ? Array.from(new Set([...context.warnings, getTrainProductReviewWarning()]))
    : context.warnings
  const extractedJson = addJobNumberingMetadata({
    ...payload.extractedJson,
    parsedFrom: "inbound_email",
    emailImport: {
      emailAccountId: context.emailAccountId,
      mailboxEmail: context.mailboxEmail,
      subject: context.subject,
      receivedAt: context.receivedAt,
      missingFields: context.missingFields,
      warnings: emailImportWarnings,
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
      packageId,
      hotelSupplierId,
    },
  }, jobNumberAllocation.resolution) as Json

  const bookingInsert: BookingInsert = {
    booking_number: jobNumberAllocation.bookingNumber,
    customer_id: customerId,
    purpose: payload.purpose,
    source: "email",
    stage: "enquiry",
    departure_date: payload.departureDate || null,
    route_id: routeId,
    package_id: packageId,
    hotel_supplier_id: hotelSupplierId,
    no_of_adults: payload.noOfAdults || 1,
    no_of_children: payload.noOfChildren || 0,
    no_of_suites: payload.noOfSuites || 1,
    raw_text: context.rawText,
    extracted_json: extractedJson,
    terms_accepted: true,
    email_import_needs_review: context.missingFields.length > 0 || emailImportWarnings.length > 0,
    email_import_missing_fields: context.missingFields,
    email_import_warnings: emailImportWarnings,
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

  const suiteTypes = payload.suiteTypes.filter(Boolean)
  if (suiteTypes.length > 0) {
    await supabase.from("booking_suites").insert(
      suiteTypes.map((suiteName, index) => ({
        booking_id: booking.id,
        suite_number: index + 1,
        suite_type_name: suiteName,
      })),
    )
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

  if (jobNumberAllocation.resolution.needsReview) {
    await supabase.from("audit_logs").insert({
      actor: "system",
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

  return {
    id: booking.id,
    bookingNumber: booking.booking_number,
    duplicateOfBookingId,
    rawPreview,
  }
}
