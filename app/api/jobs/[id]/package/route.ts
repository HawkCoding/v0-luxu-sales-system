import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

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
    .select("id, package_id, package_travel_date")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("booking-package:get-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: selections, error: selectionsError } = await supabase
    .from("booking_package_selections")
    .select(
      "id, booking_id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, notes",
    )
    .eq("booking_id", id)

  if (selectionsError) return safeSupabaseError("booking-package:get-selections", selectionsError)

  return Response.json({
    packageId: booking.package_id,
    packageTravelDate: booking.package_travel_date,
    selections: selections ?? [],
  })
}

const setPackageSchema = z.object({
  packageId: z.string().uuid().nullable(),
  packageTravelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .nullable()
    .optional(),
})

type BookingPackageSelectionInsert =
  Database["public"]["Tables"]["booking_package_selections"]["Insert"]

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
    .select("id, package_id, package_travel_date")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("booking-package:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const newPackageId = parsed.data.packageId
  const newTravelDate = parsed.data.packageTravelDate ?? null
  const packageChanged = booking.package_id !== newPackageId

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      package_id: newPackageId,
      package_travel_date: newTravelDate,
    })
    .eq("id", id)

  if (updateError) return safeSupabaseError("booking-package:update-booking", updateError)

  if (packageChanged) {
    const { error: deleteError } = await supabase
      .from("booking_package_selections")
      .delete()
      .eq("booking_id", id)

    if (deleteError) return safeSupabaseError("booking-package:clear-selections", deleteError)

    if (newPackageId) {
      const { data: legs, error: legsError } = await supabase
        .from("package_legs")
        .select("id, supplier_id, sort_order")
        .eq("package_id", newPackageId)
        .order("sort_order", { ascending: true })

      if (legsError) return safeSupabaseError("booking-package:load-legs", legsError)

      if (legs && legs.length > 0) {
        const rows: BookingPackageSelectionInsert[] = legs.map((leg) => ({
          booking_id: id,
          package_leg_id: leg.id,
          selected: true,
          supplier_id: leg.supplier_id,
          service_date: newTravelDate,
        }))

        const { error: insertError } = await supabase
          .from("booking_package_selections")
          .insert(rows)

        if (insertError) return safeSupabaseError("booking-package:seed-selections", insertError)
      }
    }
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: newPackageId ? "booking_package_assigned" : "booking_package_cleared",
    before: { package_id: booking.package_id, package_travel_date: booking.package_travel_date },
    after: { package_id: newPackageId, package_travel_date: newTravelDate },
  })

  const { data: selections, error: selectionsError } = await supabase
    .from("booking_package_selections")
    .select("id, booking_id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, notes")
    .eq("booking_id", id)

  if (selectionsError) return safeSupabaseError("booking-package:reload-selections", selectionsError)

  return Response.json({
    packageId: newPackageId,
    packageTravelDate: newTravelDate,
    selections: selections ?? [],
  })
}
