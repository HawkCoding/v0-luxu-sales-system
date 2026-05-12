import { z } from "zod"
import { randomUUID } from "node:crypto"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { mapBookingTransportRequest } from "@/lib/suppliers"
import { BOOKING_TRANSPORT_REQUEST_COLUMNS } from "@/lib/supabase/columns"

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

  const { error: deleteError } = await supabase
    .from("booking_transport_requests")
    .delete()
    .eq("booking_id", id)

  if (deleteError) return safeSupabaseError("transport-requests:replace", deleteError, "Failed to replace transport requests")

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("booking_transport_requests")
      .insert(rows)

    if (insertError) return safeSupabaseError("transport-requests:save", insertError, "Failed to save transport requests")
  }

  if (rentalRows.length > 0) {
    const { error: rentalInsertError } = await supabase
      .from("booking_vehicle_rental_details")
      .insert(rentalRows)

    if (rentalInsertError) {
      return safeSupabaseError("transport-requests:save-rental-details", rentalInsertError, "Failed to save vehicle rental details")
    }
  }

  const { data: savedRows, error: loadError } = await supabase
    .from("booking_transport_requests")
    .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (loadError) return safeSupabaseError("transport-requests:reload", loadError, "Failed to load saved transport requests")

  return Response.json((savedRows ?? []).map(mapBookingTransportRequest))
}
