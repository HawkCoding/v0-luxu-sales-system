import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { importRowSchema, payloadSchema } from "./schemas"

const allowedRoles = new Set(["admin", "manager"])

type NormalizedImportRow = z.infer<typeof importRowSchema>

interface BookingImportRow {
  sourceRowId: string | null
  customerId: string
}

function collectHistoricalImportSourceRowIds(
  bookingRows: Array<{ extracted_json: unknown }>,
): Set<string> {
  const sourceRowIds = new Set<string>()

  for (const booking of bookingRows) {
    const extractedJson = booking.extracted_json
    if (!extractedJson || typeof extractedJson !== "object") {
      continue
    }

    const historicalImport = (extractedJson as { historical_import?: unknown }).historical_import
    if (!historicalImport || typeof historicalImport !== "object") {
      continue
    }

    const sourceRowId = (historicalImport as { source_row_id?: unknown }).source_row_id
    if (typeof sourceRowId === "string" && sourceRowId.length > 0) {
      sourceRowIds.add(sourceRowId)
    }
  }

  return sourceRowIds
}

function customerSignature(row: Pick<NormalizedImportRow, "title" | "first_name" | "last_name" | "email" | "phone" | "country">): string {
  return JSON.stringify({
    title: row.title ?? null,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    country: row.country ?? null,
  })
}

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level, name, surname, email")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let parsed: z.infer<typeof payloadSchema>
  try {
    parsed = payloadSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const normalizedRows = parsed.rows.map((row) => ({
    source_row_id: row.source_row_id?.trim() || null,
    title: row.title || null,
    first_name: row.first_name.trim(),
    last_name: row.last_name.trim(),
    email: row.email.trim().toLowerCase(),
    phone: row.phone?.trim() || null,
    country: row.country?.trim() || null,
  }))

  const uniqueEmails = Array.from(new Set(normalizedRows.map((row) => row.email)))
  const { data: existingRows, error: existingError } = await supabase
    .from("customers")
    .select("id, email")
    .in("email", uniqueEmails)

  if (existingError)
    return NextResponse.json({ error: "Failed to check existing customers" }, { status: 500 })

  const customerIdsByEmail = new Map((existingRows ?? []).map((row) => [row.email.toLowerCase(), row.id]))
  const customerRowsByEmail = new Map<string, typeof normalizedRows[number]>()
  const conflictingCustomerRows = new Set<string>()

  normalizedRows.forEach((row) => {
    const previous = customerRowsByEmail.get(row.email)
    if (!previous) {
      customerRowsByEmail.set(row.email, row)
      return
    }
    if (customerSignature(previous) !== customerSignature(row)) conflictingCustomerRows.add(row.email)
  })

  const customersToInsert = Array.from(customerRowsByEmail.values()).filter((row) => !customerIdsByEmail.has(row.email))
  const actorLabel =
    [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email || "system"

  async function writeImportAudit(createdCustomers: number, matchedCustomers: number, importedBookings: number) {
    await supabase.from("audit_logs").insert({
      actor: actorLabel,
      entity_type: "Customer",
      entity_id: "bulk_import_historical_bookings",
      action: "bulk_imported_customers_and_history",
      meta_json: {
        mode: "supplier_csv",
        requested_rows: normalizedRows.length,
        created_customers: createdCustomers,
        matched_customers: matchedCustomers,
        imported_bookings: importedBookings,
        conflicting_customer_rows: conflictingCustomerRows.size,
        invalid_rows: 0,
        supplier_id: parsed.supplierId ?? null,
        route_id: parsed.routeId ?? null,
      },
    })
  }

  if (parsed.routeId) {
    const { data: route, error: routeError } = await supabase
      .from("routes")
      .select("id, package_id")
      .eq("id", parsed.routeId)
      .maybeSingle()

    if (routeError) {
      return NextResponse.json({ error: "Failed to validate selected route" }, { status: 500 })
    }

    if (!route) {
      return NextResponse.json({ error: "Selected route was not found" }, { status: 400 })
    }

    if (parsed.supplierId && route.package_id) {
      const { data: pkg, error: packageError } = await supabase
        .from("packages")
        .select("supplier_id")
        .eq("id", route.package_id)
        .maybeSingle()

      if (packageError) {
        return NextResponse.json({ error: "Failed to validate selected supplier route" }, { status: 500 })
      }

      if (!pkg || pkg.supplier_id !== parsed.supplierId) {
        return NextResponse.json({ error: "Selected route does not belong to selected supplier" }, { status: 400 })
      }
    }
  }

  if (customersToInsert.length > 0) {
    const { data: insertedCustomers, error: insertCustomersError } = await supabase
      .from("customers")
      .insert(
        customersToInsert.map((row) => ({
          title: row.title,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          country: row.country,
        })),
      )
      .select("id, email")

    if (insertCustomersError || !insertedCustomers) {
      console.error("customers insert error:", insertCustomersError)
      return NextResponse.json({ error: "Failed to import customers" }, { status: 500 })
    }

    insertedCustomers.forEach((customer) => {
      customerIdsByEmail.set(customer.email.toLowerCase(), customer.id)
    })
  }

  const bookingImportRows: BookingImportRow[] = normalizedRows.map((row) => {
    const customerId = customerIdsByEmail.get(row.email)
    if (!customerId) throw new Error(`Missing customer for ${row.email}`)
    return {
      sourceRowId: row.source_row_id,
      customerId,
    }
  })

  const existingSourceRowIds = new Set<string>()
  const rowsWithSourceIds = bookingImportRows.filter(
    (row): row is BookingImportRow & { sourceRowId: string } => row.sourceRowId !== null,
  )
  if (rowsWithSourceIds.length > 0) {
    const customerIds = Array.from(new Set(rowsWithSourceIds.map((row) => row.customerId)))
    const { data: existingBookingRows, error: existingBookingsError } = await supabase
      .from("bookings")
      .select("extracted_json")
      .eq("owner_user_id", user.id)
      .in("customer_id", customerIds)
      .contains("extracted_json", { historical_import: { imported_via: "supplier_csv" } })

    if (existingBookingsError) {
      console.error("bookings precheck error:", existingBookingsError)
      return NextResponse.json({ error: "Failed to validate existing historical imports" }, { status: 500 })
    }

    const collected = collectHistoricalImportSourceRowIds(existingBookingRows ?? [])
    collected.forEach((sourceRowId) => existingSourceRowIds.add(sourceRowId))
  }

  const bookingRows = bookingImportRows
    .filter((row) => !row.sourceRowId || !existingSourceRowIds.has(row.sourceRowId))
    .map((row) => ({
      customer_id: row.customerId,
      owner_user_id: user.id,
      purpose: "reservation" as const,
      stage: "closed" as const,
      route_id: parsed.routeId ?? null,
      terms_accepted: false,
      extracted_json: {
        historical_import: {
          imported_via: "supplier_csv",
          imported_at: new Date().toISOString(),
          supplier_id: parsed.supplierId ?? null,
          route_id: parsed.routeId ?? null,
          source_row_id: row.sourceRowId,
          source_label: "blank",
          source_value: null,
        },
      },
    }))

  let importedBookings = 0
  if (bookingRows.length > 0) {
    const { data: insertedBookings, error: insertBookingsError } = await supabase
      .from("bookings")
      .insert(bookingRows)
      .select("id")

    if (insertBookingsError || !insertedBookings) {
      console.error("bookings insert error:", insertBookingsError)
      return NextResponse.json({ error: "Failed to import historical bookings" }, { status: 500 })
    }
    importedBookings = insertedBookings.length
  }

  const createdCustomers = customersToInsert.length
  const matchedCustomers = uniqueEmails.length - createdCustomers
  await writeImportAudit(createdCustomers, matchedCustomers, importedBookings)

  return NextResponse.json({
    createdCustomers,
    matchedCustomers,
    importedBookings,
    duplicates: Array.from(conflictingCustomerRows),
    invalidRows: 0,
  })
}
