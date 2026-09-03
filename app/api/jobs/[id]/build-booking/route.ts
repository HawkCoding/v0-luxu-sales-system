import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import { isAtOrPastStage, isTerminalPipelineStage } from "@/lib/pipeline/validate-transition"
import { isCoreBookingLeg, type PipelineStage, type SupplierKind } from "@/lib/types"
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
    .select("id, booking_number, stage, primary_supplier_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("build-booking:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  // 1. Reconcile existing services against the requested list (matched by legId; new rows have none).
  // The supplier's kind comes along because a removal has to be checked against the core leg, which
  // is derived (see isCoreBookingLeg) rather than stored on the row.
  const { data: existingServices, error: existingError } = await supabase
    .from("booking_services")
    .select("id, supplier_id, sort_order, label, supplier:suppliers(kind, name)")
    .eq("booking_id", id)

  if (existingError) return safeSupabaseError("build-booking:load-services", existingError)

  const existingRows = existingServices ?? []
  const existingServiceIds = new Set(existingRows.map((service) => service.id))
  const claimedServiceIds = new Set(
    parsed.data.services
      .map((service) => service.legId)
      .filter((legId): legId is string => legId !== undefined && existingServiceIds.has(legId)),
  )

  // A client that forgets to echo legId used to have its whole service list deleted and re-created
  // with new ids -- taking the linked transport requests and the rows quote lines point at with it.
  // Adopt the existing row instead whenever the supplier identifies it unambiguously, and refuse
  // rather than guess when it doesn't.
  const resolvedLegIds: (string | null)[] = parsed.data.services.map((service) =>
    service.legId && existingServiceIds.has(service.legId) ? service.legId : null,
  )
  const ambiguousSupplierIds: string[] = []

  for (const [index, service] of parsed.data.services.entries()) {
    if (resolvedLegIds[index]) continue
    const candidates = existingRows.filter(
      (row) => row.supplier_id === service.supplierId && !claimedServiceIds.has(row.id),
    )
    if (candidates.length > 1) {
      ambiguousSupplierIds.push(service.supplierId)
      continue
    }
    if (candidates.length === 1) {
      resolvedLegIds[index] = candidates[0].id
      claimedServiceIds.add(candidates[0].id)
    }
  }

  if (ambiguousSupplierIds.length > 0) {
    const { data: ambiguousSuppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", ambiguousSupplierIds)
    const names = (ambiguousSuppliers ?? []).map((row) => row.name).join(", ")
    return jsonError(
      `This booking already has more than one service for ${names || "that supplier"} — send the legId of the one you mean.`,
      400,
      { ambiguousSupplierIds },
    )
  }

  const removedRows = existingRows.filter((service) => !claimedServiceIds.has(service.id))
  const removedServiceIds = removedRows.map((service) => service.id)

  let removedTransportRequestCount = 0

  if (removedServiceIds.length > 0) {
    // A rebuild deletes by omission, and nothing here used to look at the booking's stage: the QA
    // run stripped every leg off a closed, paid, vouchered booking and got a 200 back. Once the
    // deposit is paid the suppliers are booked and the itinerary is what the client contracted for,
    // so a removal has to go through a quote revision instead. A build that removes nothing stays
    // allowed at any stage, so supplier references and admin dates can still be edited late.
    const stage = booking.stage as PipelineStage
    if (isAtOrPastStage(stage, "deposit_paid") || isTerminalPipelineStage(stage)) {
      return jsonError(
        "This booking's deposit is already paid, so its services can no longer be removed. " +
          "Revise the quote to change what the client is booked on.",
        409,
        { removedServiceIds },
      )
    }

    // The core leg is what the booking exists to sell — a Shalati stay without Shalati, or a Blue
    // Train booking without the train. The services PATCH route already refuses to deselect it;
    // removing it by omission here was the way around that.
    const removedCoreLeg = removedRows.find((service) => {
      const supplier = Array.isArray(service.supplier) ? service.supplier[0] : service.supplier
      return isCoreBookingLeg(
        { supplierId: service.supplier_id, supplierKind: supplier?.kind as SupplierKind },
        booking.primary_supplier_id ?? null,
      )
    })
    if (removedCoreLeg) {
      return jsonError(
        "This service is what the booking is for and cannot be excluded from the quote or the voucher.",
        400,
        { serviceId: removedCoreLeg.id },
      )
    }

    // Cascades booking_service_units via FK; transport requests reference the service directly.
    const { data: removedTransportRequests, error: deleteTransportError } = await supabase
      .from("booking_transport_requests")
      .delete()
      .in("service_id", removedServiceIds)
      .select("id")
    if (deleteTransportError) return safeSupabaseError("build-booking:remove-transport-requests", deleteTransportError)
    removedTransportRequestCount = (removedTransportRequests ?? []).length

    const { error: deleteServicesError } = await supabase
      .from("booking_services")
      .delete()
      .in("id", removedServiceIds)
    if (deleteServicesError) return safeSupabaseError("build-booking:remove-services", deleteServicesError)
  }

  const addedServices = parsed.data.services.filter((_service, index) => !resolvedLegIds[index])

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
    sort_order: claimedServiceIds.size + index,
  }))

  if (newServiceRows.length > 0) {
    const { error: insertServicesError } = await supabase.from("booking_services").insert(newServiceRows)
    if (insertServicesError) return safeSupabaseError("build-booking:insert-services", insertServicesError)
  }

  // Reorder kept (and adopted) services to match the requested order.
  for (const [sortOrder, legId] of resolvedLegIds.entries()) {
    if (!legId) continue
    const { error: reorderError } = await supabase
      .from("booking_services")
      .update({ sort_order: sortOrder })
      .eq("id", legId)
    if (reorderError) return safeSupabaseError("build-booking:reorder-services", reorderError)
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
      // Anything built through this route was chosen by a human, so it is origin='consultant' and
      // deliberately not discardable -- only lib/auto-build writes 'auto'. "Build then discard" is
      // therefore not a round trip: remove a leg by omitting it from a later build instead.
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
    meta: {
      service_count: parsed.data.services.length,
      removed_service_ids: removedServiceIds,
      // Ids alone made a destructive rebuild unreadable after the fact, once the rows they name
      // are gone.
      removed_service_labels: removedRows.map((service) => {
        const supplier = Array.isArray(service.supplier) ? service.supplier[0] : service.supplier
        return service.label?.trim() || supplier?.name?.trim() || service.id
      }),
      removed_transport_request_count: removedTransportRequestCount,
    },
  })

  const { detail } = await loadBookingServicesPackageDetail(supabase, id, booking.booking_number)

  // Deletions are reported back so "build again" can never throw work away silently.
  return Response.json({
    packageDetail: detail,
    removedServiceCount: removedServiceIds.length,
    removedTransportRequestCount,
  })
}
