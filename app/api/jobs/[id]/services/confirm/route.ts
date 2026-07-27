import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * The explicit "Confirm services" action: a consultant accepts a machine-built (or partially
 * hand-built) service list as-is. Stamps bookings.services_confirmed_at/_by and flips any
 * remaining origin='auto' rows to 'consultant' -- the same convention as an individual field edit
 * (PATCH /api/jobs/[id]/services), just applied in bulk for whatever the consultant didn't touch
 * by hand. Never a stage gate: quote build stays the only hard gate.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services-confirm:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: services, error: servicesError } = await supabase
    .from("booking_services")
    .select("id")
    .eq("booking_id", id)

  if (servicesError) return safeSupabaseError("services-confirm:load-services", servicesError)
  if (!services || services.length === 0) return jsonError("Booking has no services to confirm", 400)

  const serviceIds = services.map((row) => row.id)
  const nowIso = new Date().toISOString()

  const { error: flipServicesError } = await supabase
    .from("booking_services")
    .update({ origin: "consultant" })
    .eq("booking_id", id)
    .eq("origin", "auto")

  if (flipServicesError) return safeSupabaseError("services-confirm:flip-services", flipServicesError)

  const { error: flipUnitsError } = await supabase
    .from("booking_service_units")
    .update({ origin: "consultant" })
    .in("service_id", serviceIds)
    .eq("origin", "auto")

  if (flipUnitsError) return safeSupabaseError("services-confirm:flip-units", flipUnitsError)

  const { error: updateBookingError } = await supabase
    .from("bookings")
    .update({ services_confirmed_at: nowIso, services_confirmed_by: user.id })
    .eq("id", id)

  if (updateBookingError) return safeSupabaseError("services-confirm:update-booking", updateBookingError)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_services_confirmed",
    meta: { service_count: serviceIds.length },
  })

  return Response.json({ servicesConfirmedAt: nowIso })
}
