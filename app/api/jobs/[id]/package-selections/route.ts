import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const updateSelectionSchema = z.object({
  packageLegId: z.string().uuid(),
  selected: z.boolean().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  routeId: z.string().uuid().nullable().optional(),
  suiteTypeId: z.string().uuid().nullable().optional(),
  serviceDate: z
    .string()
    .regex(datePattern, "Expected YYYY-MM-DD")
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
})

const patchSelectionsSchema = z.object({
  selections: z.array(updateSelectionSchema).min(1, "At least one selection is required"),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

type BookingPackageSelectionUpdate =
  Database["public"]["Tables"]["booking_package_selections"]["Update"]

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchSelectionsSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, package_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("package-selections:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)
  if (!booking.package_id) return jsonError("Booking has no package assigned", 400)

  const legIds = parsed.data.selections.map((selection) => selection.packageLegId)
  const { data: validLegs, error: legsError } = await supabase
    .from("package_legs")
    .select("id")
    .eq("package_id", booking.package_id)
    .in("id", legIds)

  if (legsError) return safeSupabaseError("package-selections:load-legs", legsError)

  const validLegIds = new Set((validLegs ?? []).map((row) => row.id))
  const invalid = legIds.filter((legId) => !validLegIds.has(legId))
  if (invalid.length > 0) {
    return jsonError("Selections reference legs outside the assigned package", 400, {
      invalidLegIds: invalid,
    })
  }

  for (const selection of parsed.data.selections) {
    const updatePayload: BookingPackageSelectionUpdate = {}
    if (selection.selected !== undefined) updatePayload.selected = selection.selected
    if (selection.supplierId !== undefined) updatePayload.supplier_id = selection.supplierId
    if (selection.routeId !== undefined) updatePayload.route_id = selection.routeId
    if (selection.suiteTypeId !== undefined) updatePayload.suite_type_id = selection.suiteTypeId
    if (selection.serviceDate !== undefined) updatePayload.service_date = selection.serviceDate
    if (selection.notes !== undefined) updatePayload.notes = selection.notes

    if (Object.keys(updatePayload).length === 0) continue

    const { error: updateError } = await supabase
      .from("booking_package_selections")
      .update(updatePayload)
      .eq("booking_id", id)
      .eq("package_leg_id", selection.packageLegId)

    if (updateError) {
      return safeSupabaseError("package-selections:update", updateError)
    }
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_package_selections_updated",
    meta: { leg_ids: legIds },
  })

  const { data: selections, error: reloadError } = await supabase
    .from("booking_package_selections")
    .select(
      "id, booking_id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, notes",
    )
    .eq("booking_id", id)

  if (reloadError) return safeSupabaseError("package-selections:reload", reloadError)

  return Response.json({ selections: selections ?? [] })
}
