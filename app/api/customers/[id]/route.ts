import { NextResponse } from "next/server"
import { z } from "zod"
import type { PostgrestError } from "@supabase/supabase-js"
import { createSessionClient } from "@/lib/supabase/server"
import { CUSTOMER_COLUMNS } from "@/lib/supabase/columns"
import { detectFieldConflicts, fieldConflictResponse, staleVersionResponse } from "@/lib/concurrency"
import { mapPostgrestError, safeSupabaseError } from "@/lib/api/responses"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { PHONE_VALIDATION_MESSAGE, isPlausiblePhone } from "@/lib/phone-format"
import {
  COMPLETED_REPEAT_BOOKING_STAGES,
  isCompletedRepeatBookingStage,
} from "@/lib/customer-repeat-status"

const allowedRoles = new Set(["admin", "manager", "consultant"])

const patchCustomerSchema = z.object({
  notes: z.string().max(5000),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z
    .string()
    .max(50)
    .nullable()
    .refine((value) => value === null || value.trim() === "" || isPlausiblePhone(value), {
      message: PHONE_VALIDATION_MESSAGE,
    }),
  fax: z.string().trim().max(50).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
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
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  // Values the client loaded for the fields it's changing, so the server can
  // tell an unrelated sibling write from a real edit conflict.
  baseline: z.record(z.string(), z.unknown()).optional(),
})

const CUSTOMER_PATCH_SELECT =
  "id, notes, email, phone, fax, country, province, company_name, address_line1, address_line2, city, postal_code, vat_number, date_of_birth, id_passport, vip_status, preferences, communication_preferences, first_travel_date, last_travel_date, updated_at"

interface CustomerPatchRow {
  id: string
  notes: string | null
  email: string
  phone: string | null
  fax: string | null
  country: string | null
  province: string | null
  company_name: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postal_code: string | null
  vat_number: string | null
  date_of_birth: string | null
  id_passport: string | null
  vip_status: boolean
  preferences: string | null
  communication_preferences: string | null
  first_travel_date: string | null
  last_travel_date: string | null
  updated_at: string
}

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
          "id, booking_number, stage, consultant, departure_date, created_at, route:routes(name, supplier:suppliers(id, name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(id, name), extracted_json",
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

  let current = await supabase.from("customers").select(CUSTOMER_PATCH_SELECT).eq("id", id).maybeSingle()

  if (current.error || !current.data) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  const normalizedNotes = parsed.notes.trim()
  const normalizedEmail = parsed.email.trim().toLowerCase()
  const normalizedPhone = parsed.phone?.trim()
  const normalizedProvince = parsed.province?.trim()
  const normalizedPreferences = parsed.preferences?.trim()
  const normalizedCommunicationPreferences = parsed.communication_preferences?.trim()

  // Someone else's email, not a stale row: this is a distinct, actionable
  // conflict (see linked-account flow), not "modified by another user".
  if (normalizedEmail !== current.data.email) {
    const { data: emailOwner } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .ilike("email", normalizedEmail)
      .neq("id", id)
      .maybeSingle()

    if (emailOwner) {
      return NextResponse.json(
        {
          error: "That email already belongs to another customer.",
          code: "DUPLICATE_EMAIL",
          existingCustomer: {
            id: emailOwner.id,
            firstName: emailOwner.first_name,
            lastName: emailOwner.last_name,
          },
        },
        { status: 409 },
      )
    }
  }

  const patchValues: {
    notes: string | null
    email: string
    phone: string | null
    country?: string | null
    province?: string | null
    date_of_birth?: string | null
    id_passport?: string | null
    vip_status?: boolean
    preferences?: string | null
    communication_preferences?: string | null
    fax?: string | null
    company_name?: string | null
    address_line1?: string | null
    address_line2?: string | null
    city?: string | null
    postal_code?: string | null
    vat_number?: string | null
  } = {
    notes: normalizedNotes ? normalizedNotes : null,
    email: normalizedEmail,
    phone: normalizedPhone ? normalizedPhone : null,
    // Only write a field when the client actually sent it, so a partial patch
    // never wipes a value the edit form did not include. Sending null or ""
    // still clears the column — that's how the UI clears a field.
    ...(parsed.country !== undefined ? { country: blankToNull(parsed.country) } : {}),
    ...(parsed.province !== undefined ? { province: normalizedProvince ? normalizedProvince : null } : {}),
    ...(parsed.date_of_birth !== undefined ? { date_of_birth: parsed.date_of_birth } : {}),
    ...(parsed.id_passport !== undefined ? { id_passport: blankToNull(parsed.id_passport) } : {}),
    ...(parsed.vip_status !== undefined ? { vip_status: parsed.vip_status } : {}),
    ...(parsed.preferences !== undefined
      ? { preferences: normalizedPreferences ? normalizedPreferences : null }
      : {}),
    ...(parsed.communication_preferences !== undefined
      ? {
          communication_preferences: normalizedCommunicationPreferences
            ? normalizedCommunicationPreferences
            : null,
        }
      : {}),
    ...(parsed.fax !== undefined ? { fax: blankToNull(parsed.fax) } : {}),
    ...(parsed.company_name !== undefined ? { company_name: blankToNull(parsed.company_name) } : {}),
    ...(parsed.address_line1 !== undefined
      ? { address_line1: blankToNull(parsed.address_line1) }
      : {}),
    ...(parsed.address_line2 !== undefined
      ? { address_line2: blankToNull(parsed.address_line2) }
      : {}),
    ...(parsed.city !== undefined ? { city: blankToNull(parsed.city) } : {}),
    ...(parsed.postal_code !== undefined ? { postal_code: blankToNull(parsed.postal_code) } : {}),
    ...(parsed.vat_number !== undefined ? { vat_number: blankToNull(parsed.vat_number) } : {}),
  }

  const hasVersionCheck = Boolean(parsed.expectedUpdatedAt) || Boolean(parsed.baseline)

  let updated: CustomerPatchRow | null = null
  let updateError: PostgrestError | null = null

  if (!hasVersionCheck) {
    const result = await supabase
      .from("customers")
      .update({ ...patchValues, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(CUSTOMER_PATCH_SELECT)
      .maybeSingle()
    updated = result.data
    updateError = result.error
  } else {
    // Bounded CAS retry: a sibling write between our read and write (e.g. a
    // traveller save touching this same customer row) shouldn't fail the
    // user's edit unless it actually touched a field they're also changing.
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (parsed.baseline) {
        const conflicts = detectFieldConflicts(patchValues, parsed.baseline, current.data as Record<string, unknown>)
        if (conflicts.length > 0) {
          return fieldConflictResponse("customer", conflicts, current.data.updated_at)
        }
      } else if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== current.data.updated_at) {
        return staleVersionResponse("customer", current.data.updated_at)
      }

      const result = await supabase
        .from("customers")
        .update({ ...patchValues, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("updated_at", current.data.updated_at)
        .select(CUSTOMER_PATCH_SELECT)
        .maybeSingle()

      if (result.error) {
        updateError = result.error
        break
      }

      if (result.data) {
        updated = result.data
        break
      }

      if (attempt === 2) {
        const { data: latest } = await supabase
          .from("customers")
          .select("updated_at")
          .eq("id", id)
          .maybeSingle()
        return staleVersionResponse("customer", latest?.updated_at ?? current.data.updated_at)
      }

      current = await supabase.from("customers").select(CUSTOMER_PATCH_SELECT).eq("id", id).maybeSingle()
      if (current.error || !current.data) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 })
      }
    }
  }

  if (updateError) {
    return (
      mapPostgrestError("customers/[id]", updateError) ??
      safeSupabaseError("customers/[id]", updateError, "Failed to update customer")
    )
  }

  if (!updated) {
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
    country: updated.country,
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
    firstTravelDate: updated.first_travel_date,
    firstTravelDateDisplay: formatDisplayDate(updated.first_travel_date),
    lastTravelDate: updated.last_travel_date,
    lastTravelDateDisplay: formatDisplayDate(updated.last_travel_date),
    isRepeatClient: (completedBookings ?? []).length > 0,
    updatedAt: updated.updated_at,
    updatedAtDisplay: formatDisplayDateTime(updated.updated_at),
  })
}