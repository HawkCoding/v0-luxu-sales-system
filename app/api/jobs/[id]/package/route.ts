import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

const SELECTIONS_WITH_UNITS_SELECT =
  "id, booking_id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, nights, notes, " +
  "units:booking_package_selection_units(id, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id, adult_count, child_count, infant_count, sort_order)"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, package_id, trip_start_date, trip_end_date")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("booking-package:get-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: selections, error: selectionsError } = await supabase
    .from("booking_package_selections")
    .select(SELECTIONS_WITH_UNITS_SELECT)
    .eq("booking_id", id)

  if (selectionsError) return safeSupabaseError("booking-package:get-selections", selectionsError)

  return Response.json({
    packageId: booking.package_id,
    tripStartDate: booking.trip_start_date,
    tripEndDate: booking.trip_end_date,
    selections: selections ?? [],
  })
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const setPackageSchema = z
  .object({
    packageId: z.string().uuid().nullable(),
    tripStartDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
    tripEndDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.packageId) return

    if (!value.tripStartDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tripStartDate"], message: "Trip start date is required to apply a package" })
    }
    if (!value.tripEndDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tripEndDate"], message: "Trip end date is required to apply a package" })
    }
    if (value.tripStartDate && value.tripEndDate && value.tripEndDate < value.tripStartDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tripEndDate"], message: "Trip end date must be on or after the trip start date" })
    }
  })

type BookingPackageSelectionInsert =
  Database["public"]["Tables"]["booking_package_selections"]["Insert"]
type BookingPackageSelectionUnitInsert =
  Database["public"]["Tables"]["booking_package_selection_units"]["Insert"]
type BookingTransportRequestInsert =
  Database["public"]["Tables"]["booking_transport_requests"]["Insert"]
type BookingVehicleRentalDetailInsert =
  Database["public"]["Tables"]["booking_vehicle_rental_details"]["Insert"]

const TRANSPORT_SUPPLIER_KINDS = new Set(["transfers", "vehicle_rental"])

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params

  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return jsonError("Invalid booking id", 400)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = setPackageSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, package_id, trip_start_date, trip_end_date")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("booking-package:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const newPackageId = parsed.data.packageId
  const newTripStartDate = newPackageId ? (parsed.data.tripStartDate ?? null) : null
  const newTripEndDate = newPackageId ? (parsed.data.tripEndDate ?? null) : null
  const packageChanged = booking.package_id !== newPackageId

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      package_id: newPackageId,
      trip_start_date: newTripStartDate,
      trip_end_date: newTripEndDate,
      // kept in sync for legacy read paths (voucher generation, pipeline logic) until they migrate off it
      package_travel_date: newTripStartDate,
    })
    .eq("id", id)

  if (updateError) return safeSupabaseError("booking-package:update-booking", updateError)

  if (packageChanged) {
    const { error: deleteError } = await supabase
      .from("booking_package_selections")
      .delete()
      .eq("booking_id", id)

    if (deleteError) return safeSupabaseError("booking-package:clear-selections", deleteError)

    // Only drop transport requests this feature auto-provisioned for the previous package's legs
    // (package_leg_id set) -- manually-added transport requests (package_leg_id null) survive.
    const { error: deleteTransportError } = await supabase
      .from("booking_transport_requests")
      .delete()
      .eq("booking_id", id)
      .not("package_leg_id", "is", null)

    if (deleteTransportError) return safeSupabaseError("booking-package:clear-transport-requests", deleteTransportError)

    if (newPackageId) {
      const { data: legs, error: legsError } = await supabase
        .from("package_legs")
        .select("id, supplier_id, sort_order, supplier:suppliers(kind)")
        .eq("package_id", newPackageId)
        .order("sort_order", { ascending: true })

      if (legsError) return safeSupabaseError("booking-package:load-legs", legsError)

      if (legs && legs.length > 0) {
        const rows: BookingPackageSelectionInsert[] = legs.map((leg) => ({
          booking_id: id,
          package_leg_id: leg.id,
          selected: true,
          supplier_id: leg.supplier_id,
          service_date: newTripStartDate,
        }))

        const { data: insertedSelections, error: insertError } = await supabase
          .from("booking_package_selections")
          .insert(rows)
          .select("id, package_leg_id")

        if (insertError) return safeSupabaseError("booking-package:seed-selections", insertError)

        // Seed one blank unit per non-transport leg so the UI has a row to fill in immediately.
        const selectionIdByLegId = new Map((insertedSelections ?? []).map((row) => [row.package_leg_id, row.id]))
        const unitLegs = legs.filter((leg) => !TRANSPORT_SUPPLIER_KINDS.has(leg.supplier?.kind ?? ""))
        if (unitLegs.length > 0) {
          const unitRows: BookingPackageSelectionUnitInsert[] = unitLegs
            .map((leg) => selectionIdByLegId.get(leg.id))
            .filter((selectionId): selectionId is string => Boolean(selectionId))
            .map((selectionId) => ({ selection_id: selectionId, sort_order: 0 }))

          if (unitRows.length > 0) {
            const { error: unitInsertError } = await supabase
              .from("booking_package_selection_units")
              .insert(unitRows)

            if (unitInsertError) return safeSupabaseError("booking-package:seed-units", unitInsertError)
          }
        }

        const transportLegs = legs.filter((leg) => TRANSPORT_SUPPLIER_KINDS.has(leg.supplier?.kind ?? ""))

        if (transportLegs.length > 0) {
          const transportRows: BookingTransportRequestInsert[] = transportLegs.map((leg) => ({
            booking_id: id,
            package_leg_id: leg.id,
            supplier_id: leg.supplier_id,
            service_type: leg.supplier?.kind === "vehicle_rental" ? "rental" : "transfer",
            pickup_point: "",
            dropoff_point: "",
            pickup_at: newTripStartDate ? `${newTripStartDate}T00:00:00+00:00` : null,
            sort_order: 0,
          }))

          const { data: insertedTransportRows, error: transportInsertError } = await supabase
            .from("booking_transport_requests")
            .insert(transportRows)
            .select("id, service_type")

          if (transportInsertError) return safeSupabaseError("booking-package:seed-transport-requests", transportInsertError)

          const rentalDetailRows: BookingVehicleRentalDetailInsert[] = (insertedTransportRows ?? [])
            .filter((row) => row.service_type === "rental")
            .map((row) => ({
              transport_request_id: row.id,
              return_at: newTripEndDate ? `${newTripEndDate}T00:00:00+00:00` : null,
            }))

          if (rentalDetailRows.length > 0) {
            const { error: rentalInsertError } = await supabase
              .from("booking_vehicle_rental_details")
              .insert(rentalDetailRows)

            if (rentalInsertError) return safeSupabaseError("booking-package:seed-rental-details", rentalInsertError)
          }
        }
      }
    }
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: newPackageId ? "booking_package_assigned" : "booking_package_cleared",
    before: { package_id: booking.package_id, trip_start_date: booking.trip_start_date, trip_end_date: booking.trip_end_date },
    after: { package_id: newPackageId, trip_start_date: newTripStartDate, trip_end_date: newTripEndDate },
  })

  const { data: selections, error: selectionsError } = await supabase
    .from("booking_package_selections")
    .select(SELECTIONS_WITH_UNITS_SELECT)
    .eq("booking_id", id)

  if (selectionsError) return safeSupabaseError("booking-package:reload-selections", selectionsError)

  return Response.json({
    packageId: newPackageId,
    tripStartDate: newTripStartDate,
    tripEndDate: newTripEndDate,
    selections: selections ?? [],
  })
}
