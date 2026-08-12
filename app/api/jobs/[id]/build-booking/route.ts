import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import type { SupplierKind } from "@/lib/types"
import type { Database } from "@/lib/supabase/types"
import { seedUnitsForServices } from "@/lib/packages/seed-service-units"

export const runtime = "nodejs"

const serviceSchema = z.object({
  legId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  supplierKind: z.string(),
})

// Trip dates are no longer taken upfront — they are derived from the per-service dates the
// salesperson enters in the configure step (see lib/packages/recompute-trip-dates.ts).
const buildBookingSchema = z.object({
  services: z.array(serviceSchema).min(1, "At least one service is required"),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

type BookingServiceInsert = Database["public"]["Tables"]["booking_services"]["Insert"]

/** Returns the booking's services (if any have been built yet) so the Build Booking dialog can
 * pre-fill its service list and configuration when re-opened. */
export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_number")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("build-booking:get-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { services, detail } = await loadBookingServicesPackageDetail(supabase, id, booking.booking_number)
  if (services.length === 0) return Response.json({ packageDetail: null })

  return Response.json({ packageDetail: detail })
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = buildBookingSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_number")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("build-booking:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  // 1. Reconcile existing services against the requested list (matched by legId; new rows have none).
  const { data: existingServices, error: existingError } = await supabase
    .from("booking_services")
    .select("id, supplier_id, sort_order")
    .eq("booking_id", id)

  if (existingError) return safeSupabaseError("build-booking:load-services", existingError)

  const existingServiceIds = new Set((existingServices ?? []).map((service) => service.id))
  const keptServiceIds = new Set(
    parsed.data.services
      .map((service) => service.legId)
      .filter((legId): legId is string => Boolean(legId) && existingServiceIds.has(legId!)),
  )
  const removedServiceIds = (existingServices ?? [])
    .map((service) => service.id)
    .filter((serviceId) => !keptServiceIds.has(serviceId))

  if (removedServiceIds.length > 0) {
    // Cascades booking_service_units via FK; transport requests reference the service directly.
    const { error: deleteTransportError } = await supabase
      .from("booking_transport_requests")
      .delete()
      .in("service_id", removedServiceIds)
    if (deleteTransportError) return safeSupabaseError("build-booking:remove-transport-requests", deleteTransportError)

    const { error: deleteServicesError } = await supabase
      .from("booking_services")
      .delete()
      .in("id", removedServiceIds)
    if (deleteServicesError) return safeSupabaseError("build-booking:remove-services", deleteServicesError)
  }

  const addedServices = parsed.data.services.filter(
    (service) => !service.legId || !existingServiceIds.has(service.legId),
  )

  const addedSupplierIds = Array.from(new Set(addedServices.map((service) => service.supplierId)))
  const { data: addedSuppliers, error: suppliersError } =
    addedSupplierIds.length > 0
      ? await supabase.from("suppliers").select("id, name").in("id", addedSupplierIds)
      : { data: [], error: null }
  if (suppliersError) return safeSupabaseError("build-booking:load-suppliers", suppliersError)
  const supplierNameById = new Map((addedSuppliers ?? []).map((row) => [row.id, row.name]))

  const newServiceRows: BookingServiceInsert[] = addedServices.map((service, index) => ({
    id: crypto.randomUUID(),
    booking_id: id,
    supplier_id: service.supplierId,
    label: supplierNameById.get(service.supplierId) ?? null,
    sort_order: keptServiceIds.size + index,
  }))

  if (newServiceRows.length > 0) {
    const { error: insertServicesError } = await supabase.from("booking_services").insert(newServiceRows)
    if (insertServicesError) return safeSupabaseError("build-booking:insert-services", insertServicesError)
  }

  // Reorder kept services to match the requested order.
  let sortOrder = 0
  for (const service of parsed.data.services) {
    if (service.legId && keptServiceIds.has(service.legId)) {
      const { error: reorderError } = await supabase
        .from("booking_services")
        .update({ sort_order: sortOrder })
        .eq("id", service.legId)
      if (reorderError) return safeSupabaseError("build-booking:reorder-services", reorderError)
    }
    sortOrder += 1
  }

  // 2. Seed units/transport-requests for the newly added services only.
  if (newServiceRows.length > 0) {
    const kindBySupplierId = new Map(
      addedServices.map((service) => [service.supplierId, service.supplierKind as SupplierKind]),
    )
    const seedResult = await seedUnitsForServices(
      supabase,
      id,
      newServiceRows.map((row) => ({
        id: row.id as string,
        supplier_id: row.supplier_id,
        kind: kindBySupplierId.get(row.supplier_id) ?? null,
      })),
      { tripStartDate: null, tripEndDate: null },
      "consultant",
    )
    if (seedResult.error) return safeSupabaseError("build-booking:seed-units", seedResult.error)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_services_built",
    meta: { service_count: parsed.data.services.length },
  })

  const { detail } = await loadBookingServicesPackageDetail(supabase, id, booking.booking_number)

  return Response.json({ packageDetail: detail })
}
