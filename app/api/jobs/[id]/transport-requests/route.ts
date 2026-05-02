import { NextResponse } from "next/server"
import { z } from "zod"
import { mapBookingTransportRequest } from "@/lib/suppliers"
import { createSessionClient } from "@/lib/supabase/server"

const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).optional()
const nullableDateTime = z.union([z.string().datetime({ offset: true }), z.literal(""), z.null()]).optional()

const transportRequestSchema = z.object({
  id: z.string().uuid().optional(),
  serviceType: z.enum(["transfer", "rental"]),
  supplierId: nullableUuid,
  routeId: nullableUuid,
  suiteTypeId: nullableUuid,
  pickupPoint: z.string().trim().min(1, "Pickup point is required").max(500),
  dropoffPoint: z.string().trim().min(1, "Drop-off point is required").max(500),
  pickupAt: nullableDateTime,
  returnAt: nullableDateTime,
  passengerCount: z.number().int().nonnegative().nullable().optional(),
  luggageCount: z.number().int().nonnegative().nullable().optional(),
  flightNumber: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("booking_transport_requests")
    .select("*")
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "Failed to load transport requests" }, { status: 500 })
  }

  return NextResponse.json((data ?? []).map(mapBookingTransportRequest))
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let parsed: z.infer<typeof saveTransportRequestsSchema>
  try {
    parsed = saveTransportRequestsSchema.parse(await req.json())
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid transport request payload", details: error },
      { status: 400 },
    )
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) {
    return NextResponse.json({ error: "Failed to validate booking" }, { status: 500 })
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  const rows = parsed.transportRequests.map((request, index) => ({
    id: request.id,
    booking_id: id,
    service_type: request.serviceType,
    supplier_id: normalizeNullableUuid(request.supplierId),
    route_id: normalizeNullableUuid(request.routeId),
    suite_type_id: normalizeNullableUuid(request.suiteTypeId),
    pickup_point: request.pickupPoint.trim(),
    dropoff_point: request.dropoffPoint.trim(),
    pickup_at: normalizeNullableDateTime(request.pickupAt),
    return_at: request.serviceType === "rental" ? normalizeNullableDateTime(request.returnAt) : null,
    passenger_count: request.passengerCount ?? null,
    luggage_count: request.luggageCount ?? null,
    flight_number: normalizeNullableText(request.flightNumber),
    notes: normalizeNullableText(request.notes),
    sort_order: request.sortOrder ?? index,
  }))

  const { error: deleteError } = await supabase
    .from("booking_transport_requests")
    .delete()
    .eq("booking_id", id)

  if (deleteError) {
    return NextResponse.json({ error: "Failed to replace transport requests" }, { status: 500 })
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("booking_transport_requests")
      .insert(rows)

    if (insertError) {
      return NextResponse.json({ error: "Failed to save transport requests" }, { status: 500 })
    }
  }

  const { data: savedRows, error: loadError } = await supabase
    .from("booking_transport_requests")
    .select("*")
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (loadError) {
    return NextResponse.json({ error: "Failed to load saved transport requests" }, { status: 500 })
  }

  return NextResponse.json((savedRows ?? []).map(mapBookingTransportRequest))
}
