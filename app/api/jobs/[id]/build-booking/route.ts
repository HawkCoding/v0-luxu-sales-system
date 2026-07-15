import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadPackageDetail, makeUuid, resolveUniquePackageSlug } from "@/app/api/packages/[slug]/helpers"
import type { SupplierKind } from "@/lib/types"
import type { Database } from "@/lib/supabase/types"
import { seedSelectionsForLegs } from "../package/seed"

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

interface NewPackageLeg {
  id: string
  package_id: string
  supplier_id: string
  label: string | null
  sort_order: number
}
type PackageLegRouteInsert = Database["public"]["Tables"]["package_leg_routes"]["Insert"]

/** Returns the booking's hidden package (if one has been built yet) so the Build Booking dialog
 * can pre-fill its service list and configuration when re-opened. */
export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: pkg, error: pkgError } = await supabase
    .from("packages")
    .select("id, slug")
    .eq("booking_id", id)
    .maybeSingle()

  if (pkgError) return safeSupabaseError("build-booking:get-hidden-package", pkgError)
  if (!pkg) return Response.json({ packageId: null, slug: null, packageDetail: null })

  const detail = await loadPackageDetail(supabase, pkg.slug)
  if ("error" in detail) return detail.error!

  return Response.json({ packageId: pkg.id, slug: pkg.slug, packageDetail: detail.detail })
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
    .select("id, booking_number, package_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("build-booking:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  // 1. Find or create the booking's hidden package.
  const { data: existingPackage, error: existingPackageError } = await supabase
    .from("packages")
    .select("id, slug")
    .eq("booking_id", id)
    .maybeSingle()

  if (existingPackageError) return safeSupabaseError("build-booking:load-hidden-package", existingPackageError)

  let packageId: string
  let slug: string

  if (existingPackage) {
    packageId = existingPackage.id
    slug = existingPackage.slug
  } else {
    try {
      slug = await resolveUniquePackageSlug(supabase, `Booking ${booking.booking_number}`)
    } catch {
      return jsonError("Failed to create booking services", 500)
    }

    const { data: newPackage, error: insertPackageError } = await supabase
      .from("packages")
      .insert({
        booking_id: id,
        name: `Booking ${booking.booking_number}`,
        slug,
        active: false,
        currency: "ZAR",
        single_supplement_pct: 50,
        duration_nights: null,
        fixed_price_per_person: null,
      })
      .select("id, slug")
      .single()

    if (insertPackageError || !newPackage) {
      return safeSupabaseError("build-booking:create-hidden-package", insertPackageError)
    }
    packageId = newPackage.id
    slug = newPackage.slug
  }

  // 2. Reconcile legs against the requested services (matched by legId; new rows have none).
  const { data: existingLegs, error: legsError } = await supabase
    .from("package_legs")
    .select("id, supplier_id, sort_order")
    .eq("package_id", packageId)

  if (legsError) return safeSupabaseError("build-booking:load-legs", legsError)

  const existingLegIds = new Set((existingLegs ?? []).map((leg) => leg.id))
  const keptLegIds = new Set(
    parsed.data.services
      .map((service) => service.legId)
      .filter((legId): legId is string => Boolean(legId) && existingLegIds.has(legId!)),
  )
  const removedLegIds = (existingLegs ?? [])
    .map((leg) => leg.id)
    .filter((legId) => !keptLegIds.has(legId))

  if (removedLegIds.length > 0) {
    // Cascades booking_package_selections/units via FK; clean up the leg's own child rows.
    const { error: deleteLinksError } = await supabase
      .from("package_leg_routes")
      .delete()
      .in("package_leg_id", removedLegIds)
    if (deleteLinksError) return safeSupabaseError("build-booking:remove-leg-routes", deleteLinksError)

    const { error: deleteTransportError } = await supabase
      .from("booking_transport_requests")
      .delete()
      .in("package_leg_id", removedLegIds)
    if (deleteTransportError) return safeSupabaseError("build-booking:remove-transport-requests", deleteTransportError)

    const { error: deleteLegsError } = await supabase
      .from("package_legs")
      .delete()
      .in("id", removedLegIds)
    if (deleteLegsError) return safeSupabaseError("build-booking:remove-legs", deleteLegsError)
  }

  const addedServices = parsed.data.services.filter(
    (service) => !service.legId || !existingLegIds.has(service.legId),
  )

  // Look up supplier names for the added legs' labels, and every route for those suppliers so
  // eligibility (mapPackageLeg) resolves — non-hotel kinds only show routes linked via
  // package_leg_routes, so every route the supplier has must be linked here.
  const addedSupplierIds = Array.from(new Set(addedServices.map((service) => service.supplierId)))
  const { data: addedSuppliers, error: suppliersError } =
    addedSupplierIds.length > 0
      ? await supabase.from("suppliers").select("id, name").in("id", addedSupplierIds)
      : { data: [], error: null }
  if (suppliersError) return safeSupabaseError("build-booking:load-suppliers", suppliersError)
  const supplierNameById = new Map((addedSuppliers ?? []).map((row) => [row.id, row.name]))

  const { data: addedRoutes, error: routesError } =
    addedSupplierIds.length > 0
      ? await supabase.from("routes").select("id, supplier_id").in("supplier_id", addedSupplierIds)
      : { data: [], error: null }
  if (routesError) return safeSupabaseError("build-booking:load-routes", routesError)

  const newLegRows: NewPackageLeg[] = addedServices.map((service, index) => ({
    id: makeUuid(),
    package_id: packageId,
    supplier_id: service.supplierId,
    label: supplierNameById.get(service.supplierId) ?? null,
    sort_order: keptLegIds.size + index,
  }))

  if (newLegRows.length > 0) {
    const { error: insertLegsError } = await supabase.from("package_legs").insert(newLegRows)
    if (insertLegsError) return safeSupabaseError("build-booking:insert-legs", insertLegsError)

    const routeLinks: PackageLegRouteInsert[] = newLegRows.flatMap((leg) =>
      (addedRoutes ?? [])
        .filter((route) => route.supplier_id === leg.supplier_id)
        .map((route) => ({ package_leg_id: leg.id, route_id: route.id })),
    )
    if (routeLinks.length > 0) {
      const { error: linkError } = await supabase.from("package_leg_routes").insert(routeLinks)
      if (linkError) return safeSupabaseError("build-booking:link-routes", linkError)
    }
  }

  // Reorder kept legs to match the requested order.
  let sortOrder = 0
  for (const service of parsed.data.services) {
    if (service.legId && keptLegIds.has(service.legId)) {
      const { error: reorderError } = await supabase
        .from("package_legs")
        .update({ sort_order: sortOrder })
        .eq("id", service.legId)
      if (reorderError) return safeSupabaseError("build-booking:reorder-legs", reorderError)
    }
    sortOrder += 1
  }

  // 3. Assign the hidden package to the booking (mirrors the predefined-package flow). Trip
  // dates are derived later, once the configure step saves the per-service dates.
  const { error: updateBookingError } = await supabase
    .from("bookings")
    .update({ package_id: packageId })
    .eq("id", id)

  if (updateBookingError) return safeSupabaseError("build-booking:assign-booking", updateBookingError)

  // 4. Seed selections/units/transport-requests for the newly added legs only.
  if (newLegRows.length > 0) {
    const kindBySupplierId = new Map(
      addedServices.map((service) => [service.supplierId, service.supplierKind as SupplierKind]),
    )
    const seedResult = await seedSelectionsForLegs(
      supabase,
      id,
      newLegRows.map((leg) => ({
        id: leg.id,
        supplier_id: leg.supplier_id,
        kind: kindBySupplierId.get(leg.supplier_id) ?? null,
      })),
      { tripStartDate: null, tripEndDate: null },
    )
    if (seedResult.error) return safeSupabaseError("build-booking:seed-selections", seedResult.error)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_services_built",
    meta: { package_id: packageId, service_count: parsed.data.services.length },
  })

  const detail = await loadPackageDetail(supabase, slug)
  if ("error" in detail) return detail.error!

  return Response.json({
    packageId,
    slug,
    packageDetail: detail.detail,
  })
}
