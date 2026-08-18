import { z } from "zod"
import { randomUUID } from "node:crypto"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { mapBookingTransportRequest } from "@/lib/suppliers"
import { recomputeBookingTripDates } from "@/lib/packages/recompute-trip-dates"
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
  packageLegId: nullableUuid,
  /** Set instead of packageLegId for a Build Booking (booking_services) leg. */
  serviceId: nullableUuid,
  pickupPoint: z.string().trim().max(500),
  dropoffPoint: z.string().trim().max(500),
  pickupAt: nullableDateTime,
  /** Transfers only: `pre`/`post` derive pickupAt's date from the leg above it in the itinerary.
   *  Rejected on a rental below, which has no single "leg above" concept for its two dates. */
  dateAnchor: z.enum(["pre", "post", "custom"]).nullable().optional(),
  rentalDetails: rentalDetailsSchema,
  passengerCount: z.number().int().nonnegative().nullable().optional(),
  luggageCount: z.number().int().nonnegative().nullable().optional(),
  flightNumber: z.string().trim().max(100).nullable().optional(),
  priceOverride: z.number().nonnegative().nullable().optional(),
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

  if (request.dateAnchor === "pre" || request.dateAnchor === "post") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateAnchor"],
      message: "A vehicle rental has no single leg to anchor its dates to — pick pickup/return dates directly",
    })
  }
})

// `transportRequests` is required with no default on purpose: this PUT is a replace-the-set
// operation, so a payload that omits the key (a typo, an older client) used to parse as "replace
// with nothing" and silently delete every trip on the booking. Requiring it makes that a 400.
// Clearing the set is still possible — it just has to be asked for explicitly with `[]`.
const saveTransportRequestsSchema = z.object({
  transportRequests: z.array(transportRequestSchema),
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

  const { supabase, user } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("transport-requests:load-booking", bookingError, "Failed to validate booking")
  if (!booking) return jsonError("Booking not found", 404)

  // Carries an override's audit stamp across the delete/reinsert cycle below: an unchanged amount
  // keeps its original stamp, a changed or brand-new one gets a fresh one. Mirrors the hotel room
  // override logic in app/api/jobs/[id]/services/route.ts.
  const { data: existingRequests } = await supabase
    .from("booking_transport_requests")
    .select("id, price_override, price_override_set_at, price_override_set_by")
    .eq("booking_id", id)
  const existingProvenance = new Map(
    (existingRequests ?? []).map((request) => [
      request.id,
      { price: request.price_override, setAt: request.price_override_set_at, setBy: request.price_override_set_by },
    ]),
  )
  const savedAt = new Date().toISOString()

  const rows = parsed.transportRequests.map((request, index) => {
    const priceOverride = request.priceOverride ?? null
    const previous = request.id ? existingProvenance.get(request.id) : undefined
    const unchanged = priceOverride !== null && previous?.price === priceOverride

    return {
      id: request.id ?? randomUUID(),
      booking_id: id,
      service_type: request.serviceType,
      supplier_id: normalizeNullableUuid(request.supplierId),
      route_id: normalizeNullableUuid(request.routeId),
      suite_type_id: normalizeNullableUuid(request.suiteTypeId),
      package_leg_id: normalizeNullableUuid(request.packageLegId),
      service_id: normalizeNullableUuid(request.serviceId),
      pickup_point: request.pickupPoint.trim(),
      dropoff_point: request.dropoffPoint.trim(),
      pickup_at: normalizeNullableDateTime(request.pickupAt),
      date_anchor: request.serviceType === "rental" ? null : request.dateAnchor ?? null,
      passenger_count: request.passengerCount ?? null,
      luggage_count: request.luggageCount ?? null,
      flight_number: normalizeNullableText(request.flightNumber),
      price_override: priceOverride,
      price_override_set_at: priceOverride === null ? null : unchanged ? previous?.setAt ?? savedAt : savedAt,
      price_override_set_by: priceOverride === null ? null : unchanged ? previous?.setBy ?? user.id : user.id,
      notes: normalizeNullableText(request.notes),
      sort_order: request.sortOrder ?? index,
    }
  })
  const rentalRows = parsed.transportRequests.flatMap((request, index) => {
    if (request.serviceType !== "rental") return []

    return [{
      transport_request_id: rows[index]?.id ?? "",
      return_at: normalizeNullableDateTime(request.rentalDetails?.returnAt),
      return_cutoff_time: normalizeNullableTime(request.rentalDetails?.returnCutoffTime),
    }]
  })

  const { error: replaceError } = await supabase.rpc("replace_booking_transport_requests", {
    p_booking_id: id,
    p_transport_requests: rows as Json,
    p_rental_details: rentalRows as Json,
  })

  if (replaceError) return safeSupabaseError("transport-requests:replace", replaceError, "Failed to replace transport requests")

  // Rental returns / pickups can extend the trip, so re-derive the booking's trip dates.
  const recompute = await recomputeBookingTripDates(supabase, id)
  if (recompute.error) return jsonError(recompute.error, 500)

  const { data: savedRows, error: loadError } = await supabase
    .from("booking_transport_requests")
    .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (loadError) return safeSupabaseError("transport-requests:reload", loadError, "Failed to load saved transport requests")

  return Response.json((savedRows ?? []).map(mapBookingTransportRequest))
}
