import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { importRowSchema, payloadSchema } from "./schemas"

const allowedRoles = new Set(["admin", "manager"])

type NormalizedImportRow = z.infer<typeof importRowSchema>

function routeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
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
    title: row.title || null,
    first_name: row.first_name.trim(),
    last_name: row.last_name.trim(),
    email: row.email.trim().toLowerCase(),
    phone: row.phone?.trim() || null,
    country: row.country?.trim() || null,
    booking_reference: row.booking_reference.trim(),
    departure_date: row.departure_date.trim(),
    route: row.route.trim(),
    consultant: row.consultant.trim().toUpperCase(),
    source: row.source,
    adults: row.adults,
    children: row.children,
    suites: row.suites,
    cabin_type: row.cabin_type.trim(),
  }))

  const uniqueEmails = Array.from(new Set(normalizedRows.map((row) => row.email)))
  const [{ data: existingRows, error: existingError }, { data: routeRows, error: routeError }] = await Promise.all([
    supabase.from("customers").select("id, email").in("email", uniqueEmails),
    supabase.from("routes").select("id, name"),
  ])

  if (existingError)
    return NextResponse.json({ error: "Failed to check existing customers" }, { status: 500 })
  if (routeError)
    return NextResponse.json({ error: "Failed to load train routes" }, { status: 500 })

  const customerIdsByEmail = new Map((existingRows ?? []).map((row) => [row.email.toLowerCase(), row.id]))
  const routesByName = new Map((routeRows ?? []).map((row) => [routeKey(row.name), row.id]))
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
        mode: parsed.mode ?? "unknown",
        requested_rows: normalizedRows.length,
        created_customers: createdCustomers,
        matched_customers: matchedCustomers,
        imported_bookings: importedBookings,
        conflicting_customer_rows: conflictingCustomerRows.size,
        invalid_rows: 0,
      },
    })
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

  const bookingRows = normalizedRows.map((row, index) => {
    const customerId = customerIdsByEmail.get(row.email)
    if (!customerId) throw new Error(`Missing customer for ${row.email}`)

    const importKey = `${row.email}:${row.booking_reference}:${row.departure_date}:${index}`
    return {
      importKey,
      suites: row.suites,
      cabinType: row.cabin_type,
      insert: {
        customer_id: customerId,
        owner_user_id: user.id,
        purpose: "reservation" as const,
        source: row.source,
        stage: "closed" as const,
        consultant: row.consultant,
        departure_date: row.departure_date,
        no_of_adults: row.adults,
        no_of_children: row.children,
        no_of_suites: row.suites,
        route_id: routesByName.get(routeKey(row.route)) ?? null,
        terms_accepted: false,
        extracted_json: {
          historical_import: {
            import_key: importKey,
            booking_reference: row.booking_reference,
            route: row.route,
            cabin_type: row.cabin_type,
            imported_via: "customer_csv",
          },
        },
      },
    }
  })

  const { data: insertedBookings, error: insertBookingsError } = await supabase
    .from("bookings")
    .insert(bookingRows.map((row) => row.insert))
    .select("id, extracted_json")

  if (insertBookingsError || !insertedBookings) {
    console.error("bookings insert error:", insertBookingsError)
    return NextResponse.json({ error: "Failed to import historical bookings" }, { status: 500 })
  }

  const bookingIdsByImportKey = new Map<string, string>()
  insertedBookings.forEach((booking) => {
    const extractedJson = booking.extracted_json
    if (
      extractedJson &&
      typeof extractedJson === "object" &&
      "historical_import" in extractedJson &&
      extractedJson.historical_import &&
      typeof extractedJson.historical_import === "object" &&
      "import_key" in extractedJson.historical_import
    ) {
      bookingIdsByImportKey.set(String(extractedJson.historical_import.import_key), booking.id)
    }
  })

  const suiteRows = bookingRows.flatMap((row) => {
    const bookingId = bookingIdsByImportKey.get(row.importKey)
    if (!bookingId) return []

    return Array.from({ length: row.suites }, (_, suiteIndex) => ({
      booking_id: bookingId,
      suite_number: suiteIndex + 1,
      suite_type_name: row.cabinType,
    }))
  })

  if (suiteRows.length > 0) {
    const { error: insertSuitesError } = await supabase.from("booking_suites").insert(suiteRows)
    if (insertSuitesError) {
      console.error("booking_suites insert error:", insertSuitesError)
      return NextResponse.json({ error: "Failed to import booking cabin details" }, { status: 500 })
    }
  }

  const createdCustomers = customersToInsert.length
  const matchedCustomers = uniqueEmails.length - createdCustomers
  await writeImportAudit(createdCustomers, matchedCustomers, insertedBookings.length)

  return NextResponse.json({
    createdCustomers,
    matchedCustomers,
    importedBookings: insertedBookings.length,
    duplicates: Array.from(conflictingCustomerRows),
    invalidRows: 0,
  })
}
