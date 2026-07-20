import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { seedSelectionsForLegs } from "./seed"

export const runtime = "nodejs"

const SELECTIONS_WITH_UNITS_SELECT =
  "id, booking_id, package_leg_id, selected, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, date_anchor, rate_type_id, notes, " +
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
  // Trip dates are optional: they are derived from per-service dates once the configure step
  // saves selections (lib/packages/recompute-trip-dates.ts). Explicit dates are still accepted
  // as seeds for the initial selection rows.
  .superRefine((value, ctx) => {
    if (value.tripStartDate && value.tripEndDate && value.tripEndDate < value.tripStartDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tripEndDate"], message: "Trip end date must be on or after the trip start date" })
    }
  })

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
  const packageChanged = booking.package_id !== newPackageId
  const datesProvided = parsed.data.tripStartDate !== undefined || parsed.data.tripEndDate !== undefined
  // Re-saving the same package without explicit dates must not wipe the derived trip dates.
  const writeTripDates = packageChanged || datesProvided || !newPackageId
  const newTripStartDate = writeTripDates
    ? newPackageId
      ? (parsed.data.tripStartDate ?? null)
      : null
    : booking.trip_start_date
  const newTripEndDate = writeTripDates
    ? newPackageId
      ? (parsed.data.tripEndDate ?? null)
      : null
    : booking.trip_end_date

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      package_id: newPackageId,
      ...(writeTripDates
        ? {
            trip_start_date: newTripStartDate,
            trip_end_date: newTripEndDate,
            // kept in sync for legacy read paths (voucher generation, pipeline logic) until they migrate off it
            package_travel_date: newTripStartDate,
          }
        : {}),
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
        const seedResult = await seedSelectionsForLegs(
          supabase,
          id,
          legs.map((leg) => ({ id: leg.id, supplier_id: leg.supplier_id, kind: leg.supplier?.kind ?? null })),
          { tripStartDate: newTripStartDate, tripEndDate: newTripEndDate },
        )
        if (seedResult.error) return safeSupabaseError("booking-package:seed-selections", seedResult.error)
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
