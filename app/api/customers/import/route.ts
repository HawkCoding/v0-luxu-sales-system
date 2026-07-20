import { NextResponse } from "next/server"
import { z } from "zod"
import { loadCountryAliasMap, normalizeCountry } from "@/lib/countries"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { createSessionClient } from "@/lib/supabase/server"
import { allocateJobNumber } from "@/lib/job-numbering"
import { importRowSchema, payloadSchema } from "./schemas"

const allowedRoles = new Set(["admin", "manager"])
const EMAIL_LOOKUP_BATCH_SIZE = 100
const LOOKUP_BY_CUSTOMER_BATCH_SIZE = 100

type NormalizedImportRow = z.infer<typeof importRowSchema>
type ImportPhase =
  | "load_country_aliases"
  | "check_existing_customers"
  | "validate_route"
  | "validate_supplier_route"
  | "enrich_existing_customers"
  | "check_existing_bookings"
  | "insert_customers"
  | "build_booking_rows"
  | "insert_bookings"
  | "write_audit_log"

function createTraceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined

  const details = error as {
    message?: unknown
    code?: unknown
    details?: unknown
    hint?: unknown
    status?: unknown
  }

  return {
    message: typeof details.message === "string" ? details.message : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
    details: details.details,
    hint: typeof details.hint === "string" ? details.hint : undefined,
    status: typeof details.status === "number" ? details.status : undefined,
  }
}

function buildImportErrorResponse({
  traceId,
  phase,
  error,
  status,
  cause,
  context,
}: {
  traceId: string
  phase: ImportPhase
  error: string
  status: number
  cause?: unknown
  context?: Record<string, unknown>
}) {
  const localDiagnosticsEnabled = process.env.NODE_ENV !== "production"
  const details = getErrorDetails(cause)

  console.error("Customer import failed", {
    traceId,
    phase,
    error,
    status,
    details,
    context,
    cause,
  })

  return NextResponse.json(
    localDiagnosticsEnabled
      ? {
          error,
          phase,
          traceId,
          details: details ?? null,
        }
      : { error },
    { status },
  )
}

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
  const traceId = createTraceId()
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

  let countryAliasMap
  try {
    countryAliasMap = await loadCountryAliasMap(supabase)
  } catch (error) {
    return buildImportErrorResponse({
      traceId,
      phase: "load_country_aliases",
      error: "Failed to load country normalization data",
      status: 500,
      cause: error,
    })
  }

  const normalizedRows = parsed.rows.map((row) => ({
    source_row_id: row.source_row_id?.trim() || null,
    title: row.title || null,
    first_name: normalizeFirstName(row.first_name),
    last_name: normalizeLastName(row.last_name),
    email: row.email.trim().toLowerCase(),
    phone: row.phone?.trim() || null,
    country: normalizeCountry(row.country?.trim() || null, countryAliasMap),
  }))

  const uniqueEmails = Array.from(new Set(normalizedRows.map((row) => row.email)))

  const existingRows: Array<{ id: string; email: string; title: string | null; phone: string | null; country: string | null }> = []
  let existingError: unknown = null

  for (let index = 0; index < uniqueEmails.length; index += EMAIL_LOOKUP_BATCH_SIZE) {
    const emailBatch = uniqueEmails.slice(index, index + EMAIL_LOOKUP_BATCH_SIZE)
    const { data: batchRows, error: batchError } = await supabase
      .from("customers")
      .select("id, email, title, phone, country")
      .in("email", emailBatch)

    if (batchError) {
      existingError = batchError
      break
    }

    existingRows.push(...(batchRows ?? []))
  }

  if (existingError) {
    return buildImportErrorResponse({
      traceId,
      phase: "check_existing_customers",
      error: "Failed to check existing customers",
      status: 500,
      cause: existingError,
      context: {
        normalizedRowCount: normalizedRows.length,
        uniqueEmailCount: uniqueEmails.length,
      },
    })
  }

  const customerIdsByEmail = new Map((existingRows ?? []).map((row) => [row.email.toLowerCase(), row.id]))
  const existingCustomersByEmail = new Map((existingRows ?? []).map((row) => [row.email.toLowerCase(), row]))
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

  async function writeImportAudit(
    createdCustomers: number,
    matchedCustomers: number,
    importedBookings: number,
    skippedDuplicates: number,
    enrichedProfiles: number,
  ) {
    const { error } = await supabase.from("audit_logs").insert({
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
        skipped_duplicates: skippedDuplicates,
        enriched_profiles: enrichedProfiles,
        conflicting_customer_rows: conflictingCustomerRows.size,
        invalid_rows: 0,
        supplier_id: parsed.supplierId ?? null,
        route_id: parsed.routeId ?? null,
      },
    })
    return error
  }

  if (parsed.routeId) {
    const { data: route, error: routeError } = await supabase
      .from("routes")
      .select("id, supplier_id")
      .eq("id", parsed.routeId)
      .maybeSingle()

    if (routeError) {
      return buildImportErrorResponse({
        traceId,
        phase: "validate_route",
        error: "Failed to validate selected route",
        status: 500,
        cause: routeError,
        context: {
          routeId: parsed.routeId,
        },
      })
    }

    if (!route) {
      return NextResponse.json({ error: "Selected route was not found" }, { status: 400 })
    }

    if (parsed.supplierId) {
      if (route.supplier_id !== parsed.supplierId) {
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
      return buildImportErrorResponse({
        traceId,
        phase: "insert_customers",
        error: "Failed to import customers",
        status: 500,
        cause: insertCustomersError ?? new Error("Insert customers returned no rows"),
        context: {
          toInsertCount: customersToInsert.length,
          normalizedRowCount: normalizedRows.length,
        },
      })
    }

    insertedCustomers.forEach((customer) => {
      customerIdsByEmail.set(customer.email.toLowerCase(), customer.id)
    })
  }

  const enrichedCustomerIds = new Set<string>()
  for (const [email, sourceRow] of customerRowsByEmail.entries()) {
    const existingCustomer = existingCustomersByEmail.get(email)
    if (!existingCustomer) continue

    if (!existingCustomer.title && sourceRow.title) {
      const { error } = await supabase
        .from("customers")
        .update({ title: sourceRow.title })
        .eq("id", existingCustomer.id)
        .is("title", null)
      if (error) {
        return buildImportErrorResponse({
          traceId,
          phase: "enrich_existing_customers",
          error: "Failed to enrich existing customer details",
          status: 500,
          cause: error,
          context: { customerId: existingCustomer.id, field: "title" },
        })
      }
      enrichedCustomerIds.add(existingCustomer.id)
    }

    if (!existingCustomer.phone && sourceRow.phone) {
      const { error } = await supabase
        .from("customers")
        .update({ phone: sourceRow.phone })
        .eq("id", existingCustomer.id)
        .is("phone", null)
      if (error) {
        return buildImportErrorResponse({
          traceId,
          phase: "enrich_existing_customers",
          error: "Failed to enrich existing customer details",
          status: 500,
          cause: error,
          context: { customerId: existingCustomer.id, field: "phone" },
        })
      }
      enrichedCustomerIds.add(existingCustomer.id)
    }

    if (!existingCustomer.country && sourceRow.country) {
      const { error } = await supabase
        .from("customers")
        .update({ country: sourceRow.country })
        .eq("id", existingCustomer.id)
        .is("country", null)
      if (error) {
        return buildImportErrorResponse({
          traceId,
          phase: "enrich_existing_customers",
          error: "Failed to enrich existing customer details",
          status: 500,
          cause: error,
          context: { customerId: existingCustomer.id, field: "country" },
        })
      }
      enrichedCustomerIds.add(existingCustomer.id)
    }
  }

  const existingCustomerIds = Array.from(new Set(existingRows.map((row) => row.id)))
  const customerIdsWithHistoricalRouteBookings = new Set<string>()
  if (parsed.routeId && existingCustomerIds.length > 0) {
    for (let index = 0; index < existingCustomerIds.length; index += LOOKUP_BY_CUSTOMER_BATCH_SIZE) {
      const customerBatch = existingCustomerIds.slice(index, index + LOOKUP_BY_CUSTOMER_BATCH_SIZE)
      const { data: existingBookings, error: existingBookingsError } = await supabase
        .from("bookings")
        .select("customer_id, extracted_json")
        .in("customer_id", customerBatch)
        .eq("route_id", parsed.routeId)
        .eq("stage", "closed")

      if (existingBookingsError) {
        return buildImportErrorResponse({
          traceId,
          phase: "check_existing_bookings",
          error: "Failed to check existing bookings for duplicates",
          status: 500,
          cause: existingBookingsError,
          context: { routeId: parsed.routeId, existingCustomerCount: existingCustomerIds.length },
        })
      }

      ;(existingBookings ?? []).forEach((booking) => {
        const importedVia = (booking.extracted_json as { historical_import?: { imported_via?: string } } | null)
          ?.historical_import?.imported_via
        if (importedVia === "supplier_csv") customerIdsWithHistoricalRouteBookings.add(booking.customer_id)
      })
    }
  }

  let bookingImportRows: BookingImportRow[]
  try {
    bookingImportRows = normalizedRows.map((row) => {
      const customerId = customerIdsByEmail.get(row.email)
      if (!customerId) throw new Error(`Missing customer for ${row.email}`)
      return {
        sourceRowId: row.source_row_id,
        customerId,
      }
    })
  } catch (error) {
    return buildImportErrorResponse({
      traceId,
      phase: "build_booking_rows",
      error: "Failed to prepare booking rows for import",
      status: 500,
      cause: error,
      context: {
        normalizedRowCount: normalizedRows.length,
      },
    })
  }

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
      return buildImportErrorResponse({
        traceId,
        phase: "check_existing_bookings",
        error: "Failed to validate existing historical imports",
        status: 500,
        cause: existingBookingsError,
        context: {
          customerCount: customerIds.length,
          sourceRowCandidateCount: rowsWithSourceIds.length,
        },
      })
    }

    const collected = collectHistoricalImportSourceRowIds(existingBookingRows ?? [])
    collected.forEach((sourceRowId) => existingSourceRowIds.add(sourceRowId))
  }

  let bookingRows: Array<{
    booking_number: string
    customer_id: string
    owner_user_id: string
    purpose: "reservation"
    stage: "closed"
    route_id: string | null
    hotel_supplier_id: string | null
    terms_accepted: boolean
    extracted_json: {
      historical_import: {
        imported_via: "supplier_csv"
        imported_at: string
        supplier_id: string | null
        route_id: string | null
        source_row_id: string | null
        source_label: "blank"
        source_value: null
      }
    }
  }>
  let skippedDuplicates = 0
  bookingRows = []
  try {
    for (const row of bookingImportRows) {
      if (row.sourceRowId && existingSourceRowIds.has(row.sourceRowId)) {
        skippedDuplicates += 1
        continue
      }
      if (parsed.routeId && customerIdsWithHistoricalRouteBookings.has(row.customerId)) {
        skippedDuplicates += 1
        continue
      }

      const bookingNumber = await allocateJobNumber(supabase)
      bookingRows.push({
        booking_number: bookingNumber,
        customer_id: row.customerId,
        owner_user_id: user.id,
        purpose: "reservation" as const,
        stage: "closed" as const,
        route_id: parsed.routeId ?? null,
        hotel_supplier_id: parsed.supplierId ?? null,
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
      })
    }
  } catch (error) {
    return buildImportErrorResponse({
      traceId,
      phase: "build_booking_rows",
      error: "Failed to prepare booking rows for import",
      status: 500,
      cause: error,
      context: {
        normalizedRowCount: normalizedRows.length,
      },
    })
  }

  let insertedBookings: Array<{ id: string }> = []
  if (bookingRows.length > 0) {
    const { data: newBookings, error: insertBookingsError } = await supabase
      .from("bookings")
      .insert(bookingRows)
      .select("id")

    if (insertBookingsError || !newBookings) {
      return buildImportErrorResponse({
        traceId,
        phase: "insert_bookings",
        error: "Failed to import historical bookings",
        status: 500,
        cause: insertBookingsError ?? new Error("Insert bookings returned no rows"),
        context: {
          bookingRowCount: bookingRows.length,
        },
      })
    }
    insertedBookings = newBookings
  }

  const createdCustomers = customersToInsert.length
  const matchedCustomers = uniqueEmails.length - createdCustomers
  const auditError = await writeImportAudit(
    createdCustomers,
    matchedCustomers,
    insertedBookings.length,
    skippedDuplicates,
    enrichedCustomerIds.size,
  )
  if (auditError) {
    return buildImportErrorResponse({
      traceId,
      phase: "write_audit_log",
      error: "Import succeeded but writing audit log failed",
      status: 500,
      cause: auditError,
      context: {
        createdCustomers,
        matchedCustomers,
        importedBookings: insertedBookings.length,
        skippedDuplicates,
        enrichedProfiles: enrichedCustomerIds.size,
      },
    })
  }

  return NextResponse.json({
    createdCustomers,
    matchedCustomers,
    importedBookings: insertedBookings.length,
    skippedDuplicates,
    enrichedProfiles: enrichedCustomerIds.size,
    duplicates: Array.from(conflictingCustomerRows),
    invalidRows: 0,
  })
}
