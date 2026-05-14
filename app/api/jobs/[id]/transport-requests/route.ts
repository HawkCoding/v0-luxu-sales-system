import { z } from "zod"
import { randomUUID } from "node:crypto"
import { writeAuditLog } from "@/lib/audit-write"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { mapBookingTransportRequest } from "@/lib/suppliers"
import { BOOKING_TRANSPORT_REQUEST_COLUMNS } from "@/lib/supabase/columns"
import type { Json } from "@/lib/supabase/types"

const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).optional()
const nullableDateTime = z.union([z.string().datetime({ offset: true }), z.literal(""), z.null()]).optional()
const nullableTime = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal(""), z.null()]).optional()

const rentalDetailsSchema = z.object({
  returnAt: nullableDateTime,
  returnCutoffTime: nullableTime,
}).nullable().optional()

const transportRequestSchema = z.object({
  id: z.string().uuid().optional(),
  serviceType: z.enum(["transfer", "rental"]),
  supplierId: nullableUuid,
  routeId: nullableUuid,
  suiteTypeId: nullableUuid,
  pickupPoint: z.string().trim().min(1, "Pickup point is required").max(500),
  dropoffPoint: z.string().trim().min(1, "Drop-off point is required").max(500),
  pickupAt: nullableDateTime,
  rentalDetails: rentalDetailsSchema,
  passengerCount: z.number().int().nonnegative().nullable().optional(),
  luggageCount: z.number().int().nonnegative().nullable().optional(),
  flightNumber: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
}).superRefine((request, context) => {
  if (request.serviceType !== "rental") return

  if (!normalizeNullableDateTime(request.rentalDetails?.returnAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rentalDetails", "returnAt"],
      message: "Return date/time is required for vehicle rentals",
    })
  }
})

const saveTransportRequestsSchema = z.object({
  transportRequests: z.array(transportRequestSchema).default([]),
})

function normalizeNullableUuid(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeNullableDateTime(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function normalizeNullableTime(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function hasTransportReferenceChange(
  beforeRows: Array<{ id: string; supplier_id: string | null; route_id: string | null; suite_type_id: string | null }>,
  afterRows: Array<{ id: string; supplier_id: string | null; route_id: string | null; suite_type_id: string | null }>,
): boolean {
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]))
  return afterRows.some((row) => {
    const before = beforeById.get(row.id)
    return Boolean(
      (row.supplier_id && row.supplier_id !== before?.supplier_id) ||
        (row.route_id && row.route_id !== before?.route_id) ||
        (row.suite_type_id && row.suite_type_id !== before?.suite_type_id),
    )
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("booking_transport_requests")
    .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (error) return safeSupabaseError("transport-requests:list", error, "Failed to load transport requests")

  return Response.json((data ?? []).map(mapBookingTransportRequest))
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsedResult = saveTransportRequestsSchema.safeParse(raw)
  if (!parsedResult.success) return jsonZodError(parsedResult.error, "Invalid transport request payload")
  const parsed = parsedResult.data

  const { supabase } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("transport-requests:load-booking", bookingError, "Failed to validate booking")
  if (!booking) return jsonError("Booking not found", 404)

  const rows = parsed.transportRequests.map((request, index) => ({
    id: request.id ?? randomUUID(),
    booking_id: id,
    service_type: request.serviceType,
    supplier_id: normalizeNullableUuid(request.supplierId),
    route_id: normalizeNullableUuid(request.routeId),
    suite_type_id: normalizeNullableUuid(request.suiteTypeId),
    pickup_point: request.pickupPoint.trim(),
    dropoff_point: request.dropoffPoint.trim(),
    pickup_at: normalizeNullableDateTime(request.pickupAt),
    passenger_count: request.passengerCount ?? null,
    luggage_count: request.luggageCount ?? null,
    flight_number: normalizeNullableText(request.flightNumber),
    notes: normalizeNullableText(request.notes),
    sort_order: request.sortOrder ?? index,
  }))
  const rentalRows = parsed.transportRequests.flatMap((request, index) => {
    if (request.serviceType !== "rental") return []

    return [{
      transport_request_id: rows[index]?.id ?? "",
      return_at: normalizeNullableDateTime(request.rentalDetails?.returnAt),
      return_cutoff_time: normalizeNullableTime(request.rentalDetails?.returnCutoffTime),
    }]
  })

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("booking_transport_requests")
    .select("id, supplier_id, route_id, suite_type_id")
    .eq("booking_id", id)

  if (existingRowsError) return safeSupabaseError("transport-requests:load-existing", existingRowsError, "Failed to load existing transport requests")

  const { error: replaceError } = await supabase.rpc("replace_booking_transport_requests", {
    p_booking_id: id,
    p_transport_requests: rows as Json,
    p_rental_details: rentalRows as Json,
  })

  if (replaceError) return safeSupabaseError("transport-requests:replace", replaceError, "Failed to replace transport requests")

  const { data: savedRows, error: loadError } = await supabase
    .from("booking_transport_requests")
    .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (loadError) return safeSupabaseError("transport-requests:reload", loadError, "Failed to load saved transport requests")

  if (hasTransportReferenceChange(existingRows ?? [], rows)) {
    const auditResult = await writeAuditLog(supabase, {
      actor: auth.value.profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Booking",
      entityId: id,
      action: "supplier_reference_captured",
      meta: {
        source: "transport_requests",
        supplier_ids: rows.map((row) => row.supplier_id).filter(Boolean),
        route_ids: rows.map((row) => row.route_id).filter(Boolean),
        suite_type_ids: rows.map((row) => row.suite_type_id).filter(Boolean),
      },
    })
    if (auditResult.error) return safeSupabaseError("transport-requests:audit-reference", auditResult.error)
  }

  return Response.json((savedRows ?? []).map(mapBookingTransportRequest))
}
