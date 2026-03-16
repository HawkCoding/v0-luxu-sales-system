import { NextResponse } from "next/server"
import { mapSupplierDetail } from "@/lib/suppliers"
import type { Database } from "@/lib/supabase/types"
import {
  allowedRoles,
  buildErrorResponse,
  loadSupplierDetail,
  makeUuid,
  normalizeNullableDate,
  normalizeText,
  queryExistingIds,
  requireAuthenticatedUser,
} from "../helpers"
import {
  supplierDraftSaveSchema,
  supplierSaveSchema,
  type SupplierDraftSaveInput,
  type SupplierSaveInput,
} from "../schemas"

type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function isDateString(value: string | null | undefined): value is string {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { id } = await params
  const detail = await loadSupplierDetail(auth.supabase, id)
  if ("error" in detail) {
    return detail.error
  }

  return NextResponse.json(
    mapSupplierDetail(
      detail.supplier,
      detail.packages,
      detail.routes,
      detail.suiteTypes,
      detail.rateCards,
      detail.locations,
    ),
  )
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase, user } = auth
  const { id } = await params

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { count: bookingsCount, error: bookingsError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("hotel_supplier_id", id)

  if (bookingsError) {
    return NextResponse.json(
      { error: "Failed to validate supplier deletion" },
      { status: 500 },
    )
  }

  if ((bookingsCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete supplier with existing bookings" },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase.from("suppliers").delete().eq("id", id)

  if (deleteError) {
    if (deleteError.code === "23503") {
      return NextResponse.json(
        { error: "Cannot delete supplier with existing bookings" },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: "Failed to delete supplier" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase, user } = auth
  const { id } = await params
  const isDraftSave = new URL(req.url).searchParams.get("draft") === "true"

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: SupplierSaveInput | SupplierDraftSaveInput
  try {
    const body = await req.json()
    parsed = isDraftSave ? supplierDraftSaveSchema.parse(body) : supplierSaveSchema.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existingDetail = await loadSupplierDetail(supabase, id)
  if ("error" in existingDetail) {
    return existingDetail.error
  }

  let normalizedSuiteTypes: Array<{
    id: string
    supplier_id: string
    name: string
    active: boolean
  }>
  let normalizedPackages: Array<
    PackageRow & {
      routes: Array<{
        id: string
        package_id: string
        name: string
        origin_location_id: string
        destination_location_id: string
        active: boolean
      }>
      rateCards: Array<RateCardRow>
    }
  >

  try {
    normalizedSuiteTypes = parsed.suiteTypes.map((suiteType) => ({
      id: suiteType.id ?? makeUuid(),
      supplier_id: id,
      name: suiteType.name.trim(),
      active: suiteType.active,
    }))
    const suiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))

    normalizedPackages = parsed.packages.map((pkg) => {
      const packageId = pkg.id ?? makeUuid()
      const normalizedRouteCandidates = pkg.routes.map((route) => ({
        id: route.id ?? makeUuid(),
        package_id: packageId,
        name: route.name.trim(),
        origin_location_id: route.originLocationId,
        destination_location_id: route.destinationLocationId,
        active: route.active,
      }))
      const normalizedRoutes = isDraftSave
        ? normalizedRouteCandidates.filter(
            (route) =>
              route.name.length > 0 &&
              isUuid(route.origin_location_id) &&
              isUuid(route.destination_location_id),
          )
        : normalizedRouteCandidates

      const routeIds = new Set(normalizedRoutes.map((route) => route.id))
      const normalizedRateCardCandidates = pkg.rateCards.map((rateCard) => ({
        id: rateCard.id ?? makeUuid(),
        package_id: packageId,
        route_id: rateCard.routeId,
        suite_type_id: rateCard.suiteTypeId,
        price_per_person: rateCard.pricePerPerson,
        currency:
          rateCard.currency.trim().toUpperCase() ||
          pkg.currency.trim().toUpperCase() ||
          "ZAR",
        valid_from: rateCard.validFrom,
        valid_to: normalizeNullableDate(rateCard.validTo),
        created_at: new Date().toISOString(),
      }))
      const normalizedRateCards = isDraftSave
        ? normalizedRateCardCandidates.filter((rateCard) => {
            if (!isUuid(rateCard.suite_type_id) || !isDateString(rateCard.valid_from)) {
              return false
            }
            if (rateCard.route_id && !routeIds.has(rateCard.route_id)) {
              return false
            }
            return suiteTypeIds.has(rateCard.suite_type_id)
          })
        : normalizedRateCardCandidates

      if (
        !isDraftSave &&
        normalizedRateCards.some(
          (rateCard) => rateCard.route_id && !routeIds.has(rateCard.route_id),
        )
      ) {
        throw new Error("Each rate card must reference a route from the same package.")
      }

      if (
        !isDraftSave &&
        normalizedRateCards.some((rateCard) => !suiteTypeIds.has(rateCard.suite_type_id))
      ) {
        throw new Error("Each rate card must reference a suite type from this supplier.")
      }

      return {
        id: packageId,
        supplier_id: id,
        name: pkg.name.trim(),
        description: normalizeText(pkg.description ?? ""),
        duration_nights: pkg.durationNights,
        single_supplement_pct: pkg.singleSupplementPct,
        currency: pkg.currency.trim().toUpperCase() || "ZAR",
        active: pkg.active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        routes: normalizedRoutes,
        rateCards: normalizedRateCards,
      }
    })
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : "Invalid supplier package structure",
    )
  }

  const existingPackageIds = new Set(existingDetail.packages.map((pkg) => pkg.id))
  const existingRouteIds = new Set(existingDetail.routes.map((route) => route.id))
  const existingSuiteTypeIds = new Set(existingDetail.suiteTypes.map((suiteType) => suiteType.id))
  const existingRateCardIds = new Set(existingDetail.rateCards.map((rateCard) => rateCard.id))

  try {
    const [
      conflictingPackageIds,
      conflictingRouteIds,
      conflictingSuiteTypeIds,
      conflictingRateCardIds,
    ] = await Promise.all([
      queryExistingIds(
        supabase,
        "packages",
        normalizedPackages
          .map((pkg) => pkg.id)
          .filter((packageId) => !existingPackageIds.has(packageId)),
      ),
      queryExistingIds(
        supabase,
        "routes",
        normalizedPackages
          .flatMap((pkg) => pkg.routes.map((route) => route.id))
          .filter((routeId) => !existingRouteIds.has(routeId)),
      ),
      queryExistingIds(
        supabase,
        "suite_types",
        normalizedSuiteTypes
          .map((suiteType) => suiteType.id)
          .filter((suiteTypeId) => !existingSuiteTypeIds.has(suiteTypeId)),
      ),
      queryExistingIds(
        supabase,
        "rate_cards",
        normalizedPackages
          .flatMap((pkg) => pkg.rateCards.map((rateCard) => rateCard.id))
          .filter((rateCardId) => !existingRateCardIds.has(rateCardId)),
      ),
    ])

    if (
      conflictingPackageIds.length > 0 ||
      conflictingRouteIds.length > 0 ||
      conflictingSuiteTypeIds.length > 0 ||
      conflictingRateCardIds.length > 0
    ) {
      return buildErrorResponse("One or more supplier records could not be updated safely.")
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to validate supplier updates" },
      { status: 500 },
    )
  }

  const { error: supplierUpdateError } = await supabase
    .from("suppliers")
    .update({
      name: parsed.name,
      kind: parsed.kind,
      email: parsed.email || null,
      phone: parsed.phone || null,
      website: parsed.website || null,
      location: parsed.location || null,
      notes: parsed.notes || null,
      active: isDraftSave ? false : parsed.active,
    })
    .eq("id", id)

  if (supplierUpdateError) {
    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 },
    )
  }

  const packageRows = normalizedPackages.map(({ routes, rateCards, ...pkg }) => pkg)
  if (packageRows.length > 0) {
    const { error: packageError } = await supabase
      .from("packages")
      .upsert(packageRows, { onConflict: "id" })

    if (packageError) {
      return NextResponse.json(
        { error: "Failed to update supplier packages" },
        { status: 500 },
      )
    }
  }

  const routeRows = normalizedPackages.flatMap((pkg) => pkg.routes)
  if (routeRows.length > 0) {
    const { error: routesError } = await supabase
      .from("routes")
      .upsert(routeRows, { onConflict: "id" })

    if (routesError) {
      return NextResponse.json(
        { error: "Failed to update supplier routes" },
        { status: 500 },
      )
    }
  }

  const suiteTypeRows = normalizedSuiteTypes.map((suiteType) => ({
    ...suiteType,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
  if (suiteTypeRows.length > 0) {
    const { error: suiteTypesError } = await supabase
      .from("suite_types")
      .upsert(suiteTypeRows, { onConflict: "id" })

    if (suiteTypesError) {
      return NextResponse.json(
        { error: "Failed to update supplier suite types" },
        { status: 500 },
      )
    }
  }

  const rateCardRows = normalizedPackages.flatMap((pkg) => pkg.rateCards)
  if (rateCardRows.length > 0) {
    const { error: rateCardsError } = await supabase
      .from("rate_cards")
      .upsert(rateCardRows, { onConflict: "id" })

    if (rateCardsError) {
      return NextResponse.json(
        { error: "Failed to update supplier rate cards" },
        { status: 500 },
      )
    }
  }

  const incomingPackageIds = new Set(packageRows.map((pkg) => pkg.id))
  const incomingRouteIds = new Set(routeRows.map((route) => route.id))
  const incomingSuiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))
  const incomingRateCardIds = new Set(rateCardRows.map((rateCard) => rateCard.id))

  const rateCardIdsToDelete = existingDetail.rateCards
    .map((rateCard) => rateCard.id)
    .filter((rateCardId) => !incomingRateCardIds.has(rateCardId))
  const routeIdsToDelete = existingDetail.routes
    .map((route) => route.id)
    .filter((routeId) => !incomingRouteIds.has(routeId))
  const suiteTypeIdsToDelete = existingDetail.suiteTypes
    .map((suiteType) => suiteType.id)
    .filter((suiteTypeId) => !incomingSuiteTypeIds.has(suiteTypeId))
  const packageIdsToDelete = existingDetail.packages
    .map((pkg) => pkg.id)
    .filter((packageId) => !incomingPackageIds.has(packageId))

  if (rateCardIdsToDelete.length > 0) {
    const { error: deleteRateCardsError } = await supabase
      .from("rate_cards")
      .delete()
      .in("id", rateCardIdsToDelete)

    if (deleteRateCardsError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier rate cards" },
        { status: 500 },
      )
    }
  }

  if (routeIdsToDelete.length > 0) {
    const { error: deleteRoutesError } = await supabase
      .from("routes")
      .delete()
      .in("id", routeIdsToDelete)

    if (deleteRoutesError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier routes" },
        { status: 500 },
      )
    }
  }

  if (suiteTypeIdsToDelete.length > 0) {
    const { error: deleteSuiteTypesError } = await supabase
      .from("suite_types")
      .delete()
      .in("id", suiteTypeIdsToDelete)

    if (deleteSuiteTypesError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier suite types" },
        { status: 500 },
      )
    }
  }

  if (packageIdsToDelete.length > 0) {
    const { error: deletePackagesError } = await supabase
      .from("packages")
      .delete()
      .in("id", packageIdsToDelete)

    if (deletePackagesError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier packages" },
        { status: 500 },
      )
    }
  }

  const updatedDetail = await loadSupplierDetail(supabase, id)
  if ("error" in updatedDetail) {
    return updatedDetail.error
  }

  return NextResponse.json(
    mapSupplierDetail(
      updatedDetail.supplier,
      updatedDetail.packages,
      updatedDetail.routes,
      updatedDetail.suiteTypes,
      updatedDetail.rateCards,
      updatedDetail.locations,
    ),
  )
}
