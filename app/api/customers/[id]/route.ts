import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { CUSTOMER_COLUMNS } from "@/lib/supabase/columns"
import { staleVersionResponse } from "@/lib/concurrency"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import {
  COMPLETED_REPEAT_BOOKING_STAGES,
  isCompletedRepeatBookingStage,
} from "@/lib/customer-repeat-status"

const allowedRoles = new Set(["admin", "manager", "consultant"])

const patchCustomerSchema = z.object({
  notes: z.string().max(5000),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().max(50).nullable(),
  fax: z.string().trim().max(50).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  // Billing identity for tax invoices. All optional so an existing customer can
  // be saved without them, and cleared by sending an empty string.
  company_name: z.string().trim().max(200).nullable().optional(),
  address_line1: z.string().trim().max(200).nullable().optional(),
  address_line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  vat_number: z.string().trim().max(50).nullable().optional(),
  date_of_birth: z.string().date().nullable().optional(),
  id_passport: z.string().trim().max(50).nullable().optional(),
  vip_status: z.boolean().optional(),
  preferences: z.string().trim().max(2000).nullable().optional(),
  communication_preferences: z.string().trim().max(1000).nullable().optional(),
  default_rate_type_id: z.string().uuid().nullable().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
})

/** Trim, then fold empty strings to null so blank inputs clear the column. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [
    { data: customer, error: customerError },
    { data: bookings, error: bookingsError },
    { data: linkedAccounts, error: linkedAccountsError },
  ] =
    await Promise.all([
      supabase.from("customers").select(CUSTOMER_COLUMNS).eq("id", id).single(),
      supabase
        .from("bookings")
        .select(
          "id, booking_number, stage, consultant, departure_date, created_at, route:routes(name, supplier:suppliers(id, name)), package:packages!bookings_package_id_fkey(name), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(id, name), extracted_json",
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_linked_accounts")
        .select(
          "id, customer_id, linked_customer_id, relationship, first_name, last_name, email, phone, is_mirror, created_at",
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: true }),
    ])

  if (customerError || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  if (bookingsError) {
    return NextResponse.json({ error: "Failed to load customer bookings" }, { status: 500 })
  }
  if (linkedAccountsError) {
    return NextResponse.json({ error: "Failed to load linked accounts" }, { status: 500 })
  }

  const linkedCustomerIds = Array.from(
    new Set(
      (linkedAccounts ?? [])
        .map((account) => account.linked_customer_id)
        .filter((linkedCustomerId): linkedCustomerId is string => Boolean(linkedCustomerId)),
    ),
  )
  const linkedCustomerNamesById = new Map<string, string>()

  if (linkedCustomerIds.length > 0) {
    const { data: linkedCustomers, error: linkedCustomersError } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .in("id", linkedCustomerIds)

    if (linkedCustomersError) {
      return NextResponse.json({ error: "Failed to load linked customer details" }, { status: 500 })
    }

    ;(linkedCustomers ?? []).forEach((linkedCustomer) => {
      linkedCustomerNamesById.set(
        linkedCustomer.id,
        `${linkedCustomer.first_name} ${linkedCustomer.last_name}`.trim(),
      )
    })
  }

  const isRepeatClient = (bookings ?? []).some((booking) =>
    isCompletedRepeatBookingStage(booking.stage),
  )

  const historicalSupplierIds = Array.from(
    new Set(
      (bookings ?? [])
        .map((booking) => {
          const routeInfo = booking.route as
            | { supplier?: { name?: string | null } | null }
            | null
          const hotelSupplier = booking.hotel_supplier as { name?: string | null } | null
          if (routeInfo?.supplier?.name || hotelSupplier?.name) return null

          const historicalSupplierId = (
            booking.extracted_json as { historical_import?: { supplier_id?: unknown } } | null
          )?.historical_import?.supplier_id
          if (typeof historicalSupplierId !== "string" || !historicalSupplierId.trim()) return null

          return historicalSupplierId
        })
        .filter((supplierId): supplierId is string => Boolean(supplierId)),
    ),
  )

  const supplierNamesById = new Map<string, string>()
  if (historicalSupplierIds.length > 0) {
    const { data: historicalSuppliers, error: historicalSuppliersError } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", historicalSupplierIds)

    if (historicalSuppliersError) {
      return NextResponse.json({ error: "Failed to load booking suppliers" }, { status: 500 })
    }

    ;(historicalSuppliers ?? []).forEach((supplier) => {
      supplierNamesById.set(supplier.id, supplier.name)
    })
  }

  return NextResponse.json({
    customer: {
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      fax: customer.fax,
      country: customer.country,
      province: customer.province,
      title: customer.title,
      companyName: customer.company_name,
      addressLine1: customer.address_line1,
      addressLine2: customer.address_line2,
      city: customer.city,
      postalCode: customer.postal_code,
      vatNumber: customer.vat_number,
      notes: customer.notes,
      dateOfBirth: customer.date_of_birth,
      idPassport: customer.id_passport,
      vipStatus: customer.vip_status,
      preferences: customer.preferences,
      communicationPreferences: customer.communication_preferences,
      defaultRateTypeId: customer.default_rate_type_id,
      firstTravelDate: customer.first_travel_date,
      firstTravelDateDisplay: formatDisplayDate(customer.first_travel_date),
      lastTravelDate: customer.last_travel_date,
      lastTravelDateDisplay: formatDisplayDate(customer.last_travel_date),
      isRepeatClient,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      createdAtDisplay: formatDisplayDateTime(customer.created_at),
      updatedAtDisplay: formatDisplayDateTime(customer.updated_at),
    },
    bookings: (bookings ?? []).map((booking) => {
      const routeInfo = booking.route as
        | { name?: string | null; supplier?: { id?: string; name?: string | null } | null }
        | null
      const packageInfo = booking.package as { name?: string | null } | null
      const hotelSupplier = booking.hotel_supplier as { id?: string; name?: string | null } | null
      const historicalSupplierId = (
        booking.extracted_json as { historical_import?: { supplier_id?: string } } | null
      )?.historical_import?.supplier_id
      const historicalSupplierName =
        typeof historicalSupplierId === "string"
          ? (supplierNamesById.get(historicalSupplierId) ?? null)
          : null

      return {
        id: booking.id,
        bookingNumber: booking.booking_number,
        stage: booking.stage,
        consultant: booking.consultant,
        departureDate: booking.departure_date,
        departureDateDisplay: formatDisplayDate(booking.departure_date),
        direction:
          routeInfo?.name ??
          ((booking.extracted_json as { historical_import?: { route?: string } } | null)
            ?.historical_import?.route ?? null),
        supplierName: routeInfo?.supplier?.name ?? hotelSupplier?.name ?? historicalSupplierName,
        packageName: packageInfo?.name ?? null,
        createdAt: booking.created_at,
        createdAtDisplay: formatDisplayDateTime(booking.created_at),
      }
    }),
    linkedAccounts: (linkedAccounts ?? []).map((linkedAccount) => {
      const linkedCustomerName = linkedAccount.linked_customer_id
        ? (linkedCustomerNamesById.get(linkedAccount.linked_customer_id) ?? null)
        : null
      return {
        id: linkedAccount.id,
        customerId: linkedAccount.customer_id,
        linkedCustomerId: linkedAccount.linked_customer_id,
        linkedCustomerName,
        relationship: linkedAccount.relationship,
        firstName: linkedAccount.first_name,
        lastName: linkedAccount.last_name,
        email: linkedAccount.email,
        phone: linkedAccount.phone,
        isMirror: linkedAccount.is_mirror,
        createdAt: linkedAccount.created_at,
      }
    }),
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: z.infer<typeof patchCustomerSchema>
  try {
    parsed = patchCustomerSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: existingCustomer, error: existingCustomerError } = await supabase
    .from("customers")
    .select("updated_at")
    .eq("id", id)
    .single()

  if (existingCustomerError || !existingCustomer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== existingCustomer.updated_at) {
    return staleVersionResponse("customer", existingCustomer.updated_at)
  }

  const normalizedNotes = parsed.notes.trim()
  const normalizedEmail = parsed.email.trim().toLowerCase()
  const normalizedPhone = parsed.phone?.trim()
  const normalizedProvince = parsed.province?.trim()
  const normalizedPreferences = parsed.preferences?.trim()
  const normalizedCommunicationPreferences = parsed.communication_preferences?.trim()

  let updateQuery = supabase
    .from("customers")
    .update({
      notes: normalizedNotes ? normalizedNotes : null,
      email: normalizedEmail,
      phone: normalizedPhone ? normalizedPhone : null,
      province: normalizedProvince ? normalizedProvince : null,
      date_of_birth: parsed.date_of_birth ?? null,
      ...(parsed.id_passport !== undefined ? { id_passport: blankToNull(parsed.id_passport) } : {}),
      vip_status: parsed.vip_status ?? false,
      preferences: normalizedPreferences ? normalizedPreferences : null,
      communication_preferences: normalizedCommunicationPreferences
        ? normalizedCommunicationPreferences
        : null,
      // Only write a billing field when the client sent it, so a partial patch
      // never wipes an address the edit form did not include.
      ...(parsed.fax !== undefined ? { fax: blankToNull(parsed.fax) } : {}),
      ...(parsed.company_name !== undefined
        ? { company_name: blankToNull(parsed.company_name) }
        : {}),
      ...(parsed.address_line1 !== undefined
        ? { address_line1: blankToNull(parsed.address_line1) }
        : {}),
      ...(parsed.address_line2 !== undefined
        ? { address_line2: blankToNull(parsed.address_line2) }
        : {}),
      ...(parsed.city !== undefined ? { city: blankToNull(parsed.city) } : {}),
      ...(parsed.postal_code !== undefined
        ? { postal_code: blankToNull(parsed.postal_code) }
        : {}),
      ...(parsed.vat_number !== undefined
        ? { vat_number: blankToNull(parsed.vat_number) }
        : {}),
      ...(parsed.default_rate_type_id !== undefined
        ? { default_rate_type_id: parsed.default_rate_type_id }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (parsed.expectedUpdatedAt) {
    updateQuery = updateQuery.eq("updated_at", parsed.expectedUpdatedAt)
  }

  const { data: updated, error: updateError } = await updateQuery
    .select(
      "id, notes, email, phone, fax, province, company_name, address_line1, address_line2, city, postal_code, vat_number, date_of_birth, id_passport, vip_status, preferences, communication_preferences, default_rate_type_id, first_travel_date, last_travel_date, updated_at",
    )
    .single()

  if (!updated && parsed.expectedUpdatedAt) {
    const { data: currentCustomer } = await supabase
      .from("customers")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle()

    return staleVersionResponse("customer", currentCustomer?.updated_at ?? existingCustomer.updated_at)
  }

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 })
  }

  const { data: completedBookings, error: completedBookingsError } = await supabase
    .from("bookings")
    .select("id")
    .eq("customer_id", id)
    .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)
    .limit(1)

  if (completedBookingsError) {
    return NextResponse.json({ error: "Failed to load customer repeat status" }, { status: 500 })
  }

  return NextResponse.json({
    notes: updated.notes,
    email: updated.email,
    phone: updated.phone,
    fax: updated.fax,
    province: updated.province,
    companyName: updated.company_name,
    addressLine1: updated.address_line1,
    addressLine2: updated.address_line2,
    city: updated.city,
    postalCode: updated.postal_code,
    vatNumber: updated.vat_number,
    dateOfBirth: updated.date_of_birth,
    idPassport: updated.id_passport,
    vipStatus: updated.vip_status,
    preferences: updated.preferences,
    communicationPreferences: updated.communication_preferences,
    defaultRateTypeId: updated.default_rate_type_id,
    firstTravelDate: updated.first_travel_date,
    firstTravelDateDisplay: formatDisplayDate(updated.first_travel_date),
    lastTravelDate: updated.last_travel_date,
    lastTravelDateDisplay: formatDisplayDate(updated.last_travel_date),
    isRepeatClient: (completedBookings ?? []).length > 0,
    updatedAt: updated.updated_at,
    updatedAtDisplay: formatDisplayDateTime(updated.updated_at),
  })
}