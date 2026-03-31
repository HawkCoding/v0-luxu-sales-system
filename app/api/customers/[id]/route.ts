import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"

const allowedRoles = new Set(["admin", "manager"])

const patchCustomerSchema = z.object({
  notes: z.string().max(5000),
  email: z.string().email().max(255),
  phone: z.string().max(50).nullable(),
})

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
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("bookings")
        .select(
          "id, booking_number, stage, consultant, departure_date, created_at, route:routes(name), package:packages(name, supplier:suppliers(id, name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(id, name), extracted_json",
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

  const historicalSupplierIds = Array.from(
    new Set(
      (bookings ?? [])
        .map((booking) => {
          const packageInfo = booking.package as
            | { supplier?: { name?: string | null } | null }
            | null
          const hotelSupplier = booking.hotel_supplier as { name?: string | null } | null
          if (packageInfo?.supplier?.name || hotelSupplier?.name) return null

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
      country: customer.country,
      title: customer.title,
      notes: customer.notes,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      createdAtDisplay: formatDisplayDateTime(customer.created_at),
      updatedAtDisplay: formatDisplayDateTime(customer.updated_at),
    },
    bookings: (bookings ?? []).map((booking) => {
      const packageInfo = booking.package as
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
          (booking.route as { name?: string } | null)?.name ??
          ((booking.extracted_json as { historical_import?: { route?: string } } | null)
            ?.historical_import?.route ?? null),
        supplierName: packageInfo?.supplier?.name ?? hotelSupplier?.name ?? historicalSupplierName,
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

  const normalizedNotes = parsed.notes.trim()
  const normalizedEmail = parsed.email.trim()
  const normalizedPhone = parsed.phone?.trim()

  const { data: updated, error: updateError } = await supabase
    .from("customers")
    .update({
      notes: normalizedNotes ? normalizedNotes : null,
      email: normalizedEmail,
      phone: normalizedPhone ? normalizedPhone : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, notes, email, phone, updated_at")
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 })
  }

  return NextResponse.json({
    notes: updated.notes,
    email: updated.email,
    phone: updated.phone,
    updatedAt: updated.updated_at,
    updatedAtDisplay: formatDisplayDateTime(updated.updated_at),
  })
}
