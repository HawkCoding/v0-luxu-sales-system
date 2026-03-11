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
import { supplierSaveSchema, type SupplierSaveInput } from "../schemas"

type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]

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
      detail.pricingOptions,
      detail.packages,
      detail.routes,
      detail.suiteTypes,
      detail.rateCards,
      detail.seasonalPeriods,
      detail.seasonalPrices,
      detail.locations,
    ),
  )
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: SupplierSaveInput
  try {
    parsed = supplierSaveSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existingDetail = await loadSupplierDetail(supabase, id)
  if ("error" in existingDetail) {
    return existingDetail.error
  }

  let normalizedPricingOptions: Array<{
    id: string
    supplier_id: string
    name: string
    single_price: number
    double_price: number
    family_price: number
    currency: string
    is_primary: boolean
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
      suiteTypes: Array<{
        id: string
        package_id: string
        name: string
        active: boolean
      }>
      rateCards: Array<RateCardRow>
    }
  >
  let normalizedSeasonalPeriods: Array<{
    id: string
    supplier_id: string
    label: string | null
    valid_from: string
    valid_to: string
    prices: Array<{
      id: string
      period_id: string
      option_id: string
      single_price: number
      double_price: number
      family_price: number
    }>
  }>

  try {
    const hasPrimarySelection = parsed.pricingOptions.some((option) => option.isPrimary)
    normalizedPricingOptions = parsed.pricingOptions.map((option, index) => ({
      id: option.id ?? makeUuid(),
      supplier_id: id,
      name: option.name.trim(),
      single_price: option.singlePrice,
      double_price: option.doublePrice,
      family_price: option.familyPrice,
      currency: option.currency.trim().toUpperCase() || "ZAR",
      is_primary: hasPrimarySelection ? option.isPrimary : index === 0,
    }))

    normalizedPackages = parsed.packages.map((pkg) => {
      const packageId = pkg.id ?? makeUuid()
      const normalizedRoutes = pkg.routes.map((route) => ({
        id: route.id ?? makeUuid(),
        package_id: packageId,
        name: route.name.trim(),
        origin_location_id: route.originLocationId,
        destination_location_id: route.destinationLocationId,
        active: route.active,
      }))
      const normalizedSuiteTypes = pkg.suiteTypes.map((suiteType) => ({
        id: suiteType.id ?? makeUuid(),
        package_id: packageId,
        name: suiteType.name.trim(),
        active: suiteType.active,
      }))

      const routeIds = new Set(normalizedRoutes.map((route) => route.id))
      const suiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))
      const normalizedRateCards = pkg.rateCards.map((rateCard) => ({
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

      if (
        normalizedRateCards.some(
          (rateCard) => rateCard.route_id && !routeIds.has(rateCard.route_id),
        )
      ) {
        throw new Error("Each rate card must reference a route from the same package.")
      }

      if (
        normalizedRateCards.some((rateCard) => !suiteTypeIds.has(rateCard.suite_type_id))
      ) {
        throw new Error("Each rate card must reference a suite type from the same package.")
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
        suiteTypes: normalizedSuiteTypes,
        rateCards: normalizedRateCards,
      }
    })

    const pricingOptionIds = new Set(normalizedPricingOptions.map((option) => option.id))
    normalizedSeasonalPeriods = parsed.seasonalPeriods.map((period) => {
      const periodId = period.id ?? makeUuid()
      const optionIdsForPeriod = new Set<string>()

      const prices = period.prices.map((price) => {
        if (!pricingOptionIds.has(price.optionId)) {
          throw new Error("Seasonal pricing must reference a valid pricing option.")
        }
        if (optionIdsForPeriod.has(price.optionId)) {
          throw new Error("Each pricing option can only appear once per seasonal period.")
        }
        optionIdsForPeriod.add(price.optionId)

        return {
          id: price.id ?? makeUuid(),
          period_id: periodId,
          option_id: price.optionId,
          single_price: price.singlePrice,
          double_price: price.doublePrice,
          family_price: price.familyPrice,
        }
      })

      return {
        id: periodId,
        supplier_id: id,
        label: normalizeText(period.label ?? ""),
        valid_from: period.validFrom,
        valid_to: period.validTo,
        prices,
      }
    })
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : "Invalid supplier package structure",
    )
  }

  const existingPricingOptionIds = new Set(
    existingDetail.pricingOptions.map((option) => option.id),
  )
  const existingPackageIds = new Set(existingDetail.packages.map((pkg) => pkg.id))
  const existingRouteIds = new Set(existingDetail.routes.map((route) => route.id))
  const existingSuiteTypeIds = new Set(existingDetail.suiteTypes.map((suiteType) => suiteType.id))
  const existingRateCardIds = new Set(existingDetail.rateCards.map((rateCard) => rateCard.id))
  const existingSeasonalPeriodIds = new Set(
    existingDetail.seasonalPeriods.map((period) => period.id),
  )
  const existingSeasonalPriceIds = new Set(
    existingDetail.seasonalPrices.map((price) => price.id),
  )

  try {
    const [
      conflictingPricingOptionIds,
      conflictingPackageIds,
      conflictingRouteIds,
      conflictingSuiteTypeIds,
      conflictingRateCardIds,
      conflictingSeasonalPeriodIds,
      conflictingSeasonalPriceIds,
    ] = await Promise.all([
      queryExistingIds(
        supabase,
        "supplier_pricing_options",
        normalizedPricingOptions
          .map((option) => option.id)
          .filter((optionId) => !existingPricingOptionIds.has(optionId)),
      ),
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
        normalizedPackages
          .flatMap((pkg) => pkg.suiteTypes.map((suiteType) => suiteType.id))
          .filter((suiteTypeId) => !existingSuiteTypeIds.has(suiteTypeId)),
      ),
      queryExistingIds(
        supabase,
        "rate_cards",
        normalizedPackages
          .flatMap((pkg) => pkg.rateCards.map((rateCard) => rateCard.id))
          .filter((rateCardId) => !existingRateCardIds.has(rateCardId)),
      ),
      queryExistingIds(
        supabase,
        "supplier_seasonal_periods",
        normalizedSeasonalPeriods
          .map((period) => period.id)
          .filter((periodId) => !existingSeasonalPeriodIds.has(periodId)),
      ),
      queryExistingIds(
        supabase,
        "supplier_seasonal_prices",
        normalizedSeasonalPeriods
          .flatMap((period) => period.prices.map((price) => price.id))
          .filter((priceId) => !existingSeasonalPriceIds.has(priceId)),
      ),
    ])

    if (
      conflictingPricingOptionIds.length > 0 ||
      conflictingPackageIds.length > 0 ||
      conflictingRouteIds.length > 0 ||
      conflictingSuiteTypeIds.length > 0 ||
      conflictingRateCardIds.length > 0 ||
      conflictingSeasonalPeriodIds.length > 0 ||
      conflictingSeasonalPriceIds.length > 0
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
      active: parsed.active,
    })
    .eq("id", id)

  if (supplierUpdateError) {
    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 },
    )
  }

  if (normalizedPricingOptions.length > 0) {
    const { error: pricingError } = await supabase
      .from("supplier_pricing_options")
      .upsert(normalizedPricingOptions, { onConflict: "id" })

    if (pricingError) {
      return NextResponse.json(
        { error: "Failed to update supplier pricing" },
        { status: 500 },
      )
    }
  }

  const incomingPricingOptionIds = new Set(
    normalizedPricingOptions.map((option) => option.id),
  )
  const pricingOptionIdsToDelete = existingDetail.pricingOptions
    .map((option) => option.id)
    .filter((optionId) => !incomingPricingOptionIds.has(optionId))

  if (pricingOptionIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("supplier_pricing_options")
      .delete()
      .in("id", pricingOptionIdsToDelete)

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier pricing" },
        { status: 500 },
      )
    }
  }

  const packageRows = normalizedPackages.map(({ routes, suiteTypes, rateCards, ...pkg }) => pkg)
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

  const suiteTypeRows = normalizedPackages.flatMap((pkg) => pkg.suiteTypes)
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

  const incomingPackageIds = new Set(normalizedPackages.map((pkg) => pkg.id))
  const incomingRouteIds = new Set(routeRows.map((route) => route.id))
  const incomingSuiteTypeIds = new Set(suiteTypeRows.map((suiteType) => suiteType.id))
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

  const seasonalPeriodRows = normalizedSeasonalPeriods.map(({ prices, ...period }) => period)
  if (seasonalPeriodRows.length > 0) {
    const { error: seasonalPeriodsError } = await supabase
      .from("supplier_seasonal_periods")
      .upsert(seasonalPeriodRows, { onConflict: "id" })

    if (seasonalPeriodsError) {
      return NextResponse.json(
        { error: "Failed to update supplier seasonal periods" },
        { status: 500 },
      )
    }
  }

  const seasonalPriceRows = normalizedSeasonalPeriods.flatMap((period) => period.prices)
  if (seasonalPriceRows.length > 0) {
    const { error: seasonalPricesError } = await supabase
      .from("supplier_seasonal_prices")
      .upsert(seasonalPriceRows, { onConflict: "id" })

    if (seasonalPricesError) {
      return NextResponse.json(
        { error: "Failed to update supplier seasonal pricing" },
        { status: 500 },
      )
    }
  }

  const incomingSeasonalPeriodIds = new Set(
    normalizedSeasonalPeriods.map((period) => period.id),
  )
  const incomingSeasonalPriceIds = new Set(
    seasonalPriceRows.map((price) => price.id),
  )

  const seasonalPriceIdsToDelete = existingDetail.seasonalPrices
    .map((price) => price.id)
    .filter((priceId) => !incomingSeasonalPriceIds.has(priceId))
  const seasonalPeriodIdsToDelete = existingDetail.seasonalPeriods
    .map((period) => period.id)
    .filter((periodId) => !incomingSeasonalPeriodIds.has(periodId))

  if (seasonalPriceIdsToDelete.length > 0) {
    const { error: deleteSeasonalPricesError } = await supabase
      .from("supplier_seasonal_prices")
      .delete()
      .in("id", seasonalPriceIdsToDelete)

    if (deleteSeasonalPricesError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier seasonal pricing" },
        { status: 500 },
      )
    }
  }

  if (seasonalPeriodIdsToDelete.length > 0) {
    const { error: deleteSeasonalPeriodsError } = await supabase
      .from("supplier_seasonal_periods")
      .delete()
      .in("id", seasonalPeriodIdsToDelete)

    if (deleteSeasonalPeriodsError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier seasonal periods" },
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
      updatedDetail.pricingOptions,
      updatedDetail.packages,
      updatedDetail.routes,
      updatedDetail.suiteTypes,
      updatedDetail.rateCards,
      updatedDetail.seasonalPeriods,
      updatedDetail.seasonalPrices,
      updatedDetail.locations,
    ),
  )
}
