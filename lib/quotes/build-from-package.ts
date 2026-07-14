import { isOptionalPackageLegKind, SUPPLIER_VOCABULARY } from "@/lib/types"
import type {
  CommissionBreakdown,
  CommissionKind,
  PackageDetail,
  QuoteLineItem,
  ResolvedCommission,
} from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { fetchDefaultAgeBuckets, resolveAgeBuckets, type AgeBuckets } from "@/lib/pricing/age-buckets"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "@/lib/pricing/commission"

/** One independent suite/room booked on a hotel or train/tour/airline leg — its own suite type,
 * bedroom/bathroom configuration, and (train/tour/airline only) its own passenger split. */
export interface PackageUnitSelection {
  suiteTypeId: string
  bedroomTypeId?: string | null
  bedroomLayoutId?: string | null
  bathroomTypeId?: string | null
  /** Train/tour/airline legs only: this unit's share of the booking's adult/child/infant totals. */
  adultCount?: number
  childCount?: number
  infantCount?: number
}

export interface PackageLegSelection {
  legId: string
  selected?: boolean
  routeId?: string
  /** Transfer/vehicle-rental legs only: the vehicle category (train/hotel legs use `units`). */
  suiteTypeId?: string
  rateTypeId?: string
  /** Train/hotel legs: one entry per independent suite/room booked on this leg. */
  units?: PackageUnitSelection[]
  /** Hotel legs only: number of nights stayed (default 1). Independent of journey duration, and
   * shared across all units on the leg — a stay's night count doesn't split per room. */
  nights?: number
  commissionOverride?: {
    type: CommissionKind
    value: number
  } | null
}

interface TransportRequestRow {
  service_type: "transfer" | "rental"
  route_id: string | null
  suite_type_id: string | null
  package_leg_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  rental_details?: { return_at: string | null } | { return_at: string | null }[] | null
}

interface RateTypeMeta {
  id: string
  code: string
  name: string
}

interface BuildPackageQuoteLineItemsInput {
  supabase: SupabaseClient<Database>
  packageDetail: PackageDetail
  jobId: string
  travelDate: string
  selections?: PackageLegSelection[]
  /** Quote-level chosen rate type (e.g. Resident). Applies to every leg unless a leg sets its own. */
  rateTypeId?: string | null
  /** System default rate type, used as the fallback when a leg has no card for the chosen type. */
  fallbackRateTypeId?: string | null
  /** Optional rate-type metadata for stamping code/name into the pricing snapshot. */
  rateTypes?: RateTypeMeta[]
}

interface BuildPackageQuoteLineItemsResult {
  lineItems: QuoteLineItem[]
}

export async function buildPackageQuoteLineItems({
  supabase,
  packageDetail,
  jobId,
  travelDate,
  selections = [],
  rateTypeId: quoteRateTypeId = null,
  fallbackRateTypeId = null,
  rateTypes = [],
}: BuildPackageQuoteLineItemsInput): Promise<BuildPackageQuoteLineItemsResult> {
  const { data: job, error: jobError } = await supabase
    .from("bookings")
    .select("id, no_of_adults, no_of_children, no_of_suites, child_ages, departure_date")
    .eq("id", jobId)
    .single()

  if (jobError || !job) {
    throw new Error("Job not found")
  }

  const { data: transportRequests } = await supabase
    .from("booking_transport_requests")
    .select("service_type, route_id, suite_type_id, package_leg_id, pickup_point, dropoff_point, pickup_at, rental_details:booking_vehicle_rental_details(return_at)")
    .eq("booking_id", jobId)
    .order("sort_order", { ascending: true })

  // Load variant snapshots for all suite types in this package — used for line description suffixes.
  const suiteTypeIds = packageDetail.legs.flatMap((leg) =>
    leg.suiteTypes.map((suiteType) => suiteType.id),
  )
  const variantSnapshotBySuiteTypeId = new Map<string, { label: string; values: string[] }[]>()
  if (suiteTypeIds.length > 0) {
    const [bedroomTypesResult, bedroomLayoutsResult, bathroomTypesResult] = await Promise.all([
      supabase
        .from("suite_type_bedroom_types")
        .select("suite_type_id, bedroom_types(name, sort_order)")
        .in("suite_type_id", suiteTypeIds),
      supabase
        .from("suite_type_bedroom_layouts")
        .select("suite_type_id, bedroom_layouts(name, sort_order)")
        .in("suite_type_id", suiteTypeIds),
      supabase
        .from("suite_type_bathroom_types")
        .select("suite_type_id, bathroom_types(name, sort_order)")
        .in("suite_type_id", suiteTypeIds),
    ])

    function collectVariantNames<TKey extends string>(
      rows: { suite_type_id: string }[] | null | undefined,
      key: TKey,
    ) {
      const result = new Map<string, { name: string; sortOrder: number }[]>()
      for (const row of rows ?? []) {
        const value = (row as unknown as Record<TKey, { name: string; sort_order: number } | null>)[key]
        if (!value || !value.name) continue
        const list = result.get(row.suite_type_id) ?? []
        list.push({ name: value.name, sortOrder: value.sort_order ?? 0 })
        result.set(row.suite_type_id, list)
      }
      return result
    }

    const bedroomTypesBySuiteType = collectVariantNames(
      bedroomTypesResult.data,
      "bedroom_types",
    )
    const bedroomLayoutsBySuiteType = collectVariantNames(
      bedroomLayoutsResult.data,
      "bedroom_layouts",
    )
    const bathroomTypesBySuiteType = collectVariantNames(
      bathroomTypesResult.data,
      "bathroom_types",
    )

    for (const suiteTypeId of suiteTypeIds) {
      const groups: { label: string; values: string[] }[] = []
      const bedroomTypes = bedroomTypesBySuiteType.get(suiteTypeId)
      if (bedroomTypes && bedroomTypes.length > 0) {
        groups.push({
          label: "Bedroom Type",
          values: [...bedroomTypes].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => v.name),
        })
      }
      const bedroomLayouts = bedroomLayoutsBySuiteType.get(suiteTypeId)
      if (bedroomLayouts && bedroomLayouts.length > 0) {
        groups.push({
          label: "Bedroom Layout",
          values: [...bedroomLayouts].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => v.name),
        })
      }
      const bathroomTypes = bathroomTypesBySuiteType.get(suiteTypeId)
      if (bathroomTypes && bathroomTypes.length > 0) {
        groups.push({
          label: "Bathroom Type",
          values: [...bathroomTypes].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => v.name),
        })
      }
      if (groups.length > 0) {
        variantSnapshotBySuiteTypeId.set(suiteTypeId, groups)
      }
    }
  }

  function formatVariantSuffix(suiteTypeId: string | null | undefined): string {
    if (!suiteTypeId) return ""
    const groups = variantSnapshotBySuiteTypeId.get(suiteTypeId)
    if (!groups || groups.length === 0) return ""
    const flatValues = groups.flatMap((group) => group.values)
    return flatValues.length > 0 ? ` — ${flatValues.join(", ")}` : ""
  }

  // Load display names for the SPECIFIC bedroom/layout/bathroom a unit selected (as opposed to
  // variantSnapshotBySuiteTypeId, which lists everything a suite type could offer) — used to
  // describe a train/hotel unit's exact configuration rather than every option available.
  const bedroomTypeIds = new Set<string>()
  const bedroomLayoutIds = new Set<string>()
  const bathroomTypeIds = new Set<string>()
  for (const entry of selections) {
    for (const unitSelection of entry.units ?? []) {
      if (unitSelection.bedroomTypeId) bedroomTypeIds.add(unitSelection.bedroomTypeId)
      if (unitSelection.bedroomLayoutId) bedroomLayoutIds.add(unitSelection.bedroomLayoutId)
      if (unitSelection.bathroomTypeId) bathroomTypeIds.add(unitSelection.bathroomTypeId)
    }
  }
  const [bedroomTypeNamesResult, bedroomLayoutNamesResult, bathroomTypeNamesResult] = await Promise.all([
    bedroomTypeIds.size > 0
      ? supabase.from("bedroom_types").select("id, name").in("id", Array.from(bedroomTypeIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    bedroomLayoutIds.size > 0
      ? supabase.from("bedroom_layouts").select("id, name").in("id", Array.from(bedroomLayoutIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    bathroomTypeIds.size > 0
      ? supabase.from("bathroom_types").select("id, name").in("id", Array.from(bathroomTypeIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const bedroomTypeNameById = new Map((bedroomTypeNamesResult.data ?? []).map((row) => [row.id, row.name]))
  const bedroomLayoutNameById = new Map((bedroomLayoutNamesResult.data ?? []).map((row) => [row.id, row.name]))
  const bathroomTypeNameById = new Map((bathroomTypeNamesResult.data ?? []).map((row) => [row.id, row.name]))

  function specificUnitVariantNames(unitSelection: PackageUnitSelection): string[] {
    const names: string[] = []
    if (unitSelection.bedroomTypeId) {
      const name = bedroomTypeNameById.get(unitSelection.bedroomTypeId)
      if (name) names.push(name)
    }
    if (unitSelection.bedroomLayoutId) {
      const name = bedroomLayoutNameById.get(unitSelection.bedroomLayoutId)
      if (name) names.push(name)
    }
    if (unitSelection.bathroomTypeId) {
      const name = bathroomTypeNameById.get(unitSelection.bathroomTypeId)
      if (name) names.push(name)
    }
    return names
  }

  const selectionMap = new Map(selections.map((entry) => [entry.legId, entry]))
  const rateTypeMetaById = new Map(rateTypes.map((rt) => [rt.id, rt]))
  const lineItems: QuoteLineItem[] = []
  // The rate card resolved for the leg currently being priced; addLineItem
  // reads it to stamp the rate type into each line's pricing snapshot.
  let activeRateCard: PackageDetail["legs"][number]["rateCards"][number] | null = null
  const childAges = job.child_ages ?? []

  const defaultBuckets = await fetchDefaultAgeBuckets(supabase)
  const supplierIds = Array.from(
    new Set(packageDetail.legs.map((leg) => leg.supplierId).filter((id): id is string => Boolean(id))),
  )
  const supplierOverridesById = new Map<string, { infantMaxAge: number | null; childMaxAge: number | null }>()
  if (supplierIds.length > 0) {
    const { data: supplierAgeRows } = await supabase
      .from("suppliers")
      .select("id, infant_max_age, child_max_age")
      .in("id", supplierIds)
    for (const row of supplierAgeRows ?? []) {
      supplierOverridesById.set(row.id, {
        infantMaxAge: row.infant_max_age ?? null,
        childMaxAge: row.child_max_age ?? null,
      })
    }
  }

  function commissionFor(
    _leg: PackageDetail["legs"][number],
    _routeId: string | null,
    lineOverride?: { type: CommissionKind; value: number } | null,
  ) {
    return resolveCommission({ lineOverride: lineOverride ?? null })
  }

  function bucketsForLeg(leg: PackageDetail["legs"][number]): AgeBuckets {
    const override = leg.supplierId ? supplierOverridesById.get(leg.supplierId) : null
    return resolveAgeBuckets(defaultBuckets, override)
  }

  const bookingForCounts = job
  function countsForBuckets(buckets: AgeBuckets) {
    const infantCount = childAges.filter((age) => age <= buckets.infantMax).length
    const adultPromotedCount = childAges.filter((age) => age > buckets.childMax).length
    const childCount = Math.max(0, bookingForCounts.no_of_children - infantCount - adultPromotedCount)
    const adultCount = bookingForCounts.no_of_adults + adultPromotedCount
    return { adultCount, childCount, infantCount }
  }

  interface AddLineItemOptions {
    description: string
    qty: number
    unitPrice: number
    supplierDescription?: string | null
    suiteTypeId?: string | null
    /** A specific unit's chosen bedroom/layout/bathroom names — overrides the suite type's full
     * list of associated vocab when the unit narrowed its selection to specific values. */
    variantNames?: string[] | null
    commission?: ResolvedCommission | null
    /** Display-only basis shown next to the quantity (e.g. "per person", "per night"). */
    unit?: string | null
  }

  function addLineItem({
    description,
    qty,
    unitPrice,
    supplierDescription,
    suiteTypeId,
    variantNames,
    commission,
    unit,
  }: AddLineItemOptions) {
    if (qty <= 0) return

    const variantSuffix =
      variantNames && variantNames.length > 0
        ? ` — ${variantNames.join(", ")}`
        : formatVariantSuffix(suiteTypeId ?? null)
    const suiteVariants = suiteTypeId ? variantSnapshotBySuiteTypeId.get(suiteTypeId) : undefined
    const lineSubtotal = Math.round(unitPrice * qty * 100) / 100

    let commissionBreakdown: CommissionBreakdown | null = null
    let commissionAmount = 0
    if (commission && commission.type !== null) {
      commissionAmount = calculateCommissionAmount({
        amountAfterMarkup: lineSubtotal,
        passengerCount: qty,
        resolved: commission,
      })
      commissionBreakdown = buildCommissionBreakdown(commission, commissionAmount)
    }

    const total = Math.round((lineSubtotal + commissionAmount) * 100) / 100

    const lineItem: QuoteLineItem = {
      description: `${description}${variantSuffix}`,
      supplierDescription: supplierDescription ?? null,
      qty,
      unitPrice,
      total,
    }

    const rateTypeMeta = activeRateCard ? rateTypeMetaById.get(activeRateCard.rateTypeId) : undefined

    if ((suiteVariants && suiteVariants.length > 0) || commissionBreakdown || unit) {
      lineItem.pricingSnapshot = {
        source: "pricing_engine",
        pricingMode: "rate_card",
        packageId: packageDetail.id,
        packageName: packageDetail.name,
        legId: null,
        legLabel: null,
        supplierId: null,
        supplierName: null,
        supplierKind: null,
        routeId: null,
        routeName: null,
        suiteTypeId: suiteTypeId ?? null,
        suiteTypeName: null,
        rateCardId: activeRateCard?.id ?? null,
        rateTypeId: activeRateCard?.rateTypeId ?? null,
        rateTypeCode: rateTypeMeta?.code ?? null,
        rateTypeName: rateTypeMeta?.name ?? null,
        travelDate,
        passengerKind: "adult",
        baseUnitPrice: unitPrice,
        markupPct: 0,
        singleSupplementPct: null,
        serviceType: null,
        suiteVariants,
        commission: commissionBreakdown,
        unit: unit ?? null,
      }
    }

    lineItems.push(lineItem)
  }

  function getLegSelection(leg: PackageDetail["legs"][number]) {
    const isOptional = isOptionalPackageLegKind(leg.supplierKind)
    return selectionMap.get(leg.id) ?? { legId: leg.id, selected: !isOptional }
  }

  function getRequiredRouteId(
    leg: PackageDetail["legs"][number],
    selection: { routeId?: string },
  ): string | null {
    if (selection.routeId) {
      return selection.routeId
    }
    if (leg.routes.length === 1) {
      return leg.routes[0].id
    }
    return null
  }

  function getValidRateCard(
    leg: PackageDetail["legs"][number],
    routeId: string,
    suiteTypeId: string,
    perLegRateTypeId?: string | null,
  ) {
    const candidates = leg.rateCards.filter(
      (rc) =>
        rc.routeId === routeId &&
        rc.suiteTypeId === suiteTypeId &&
        rc.validFrom <= travelDate &&
        (rc.validTo === null || rc.validTo >= travelDate),
    )
    if (candidates.length === 0) return undefined

    // Resolve deterministically: a per-leg override beats the quote-level
    // choice, which beats the system default, which beats any remaining card.
    const chosen = perLegRateTypeId ?? quoteRateTypeId
    const byRateType = (rateTypeId: string | null | undefined) =>
      rateTypeId ? candidates.find((rc) => rc.rateTypeId === rateTypeId) : undefined

    return byRateType(chosen) ?? byRateType(fallbackRateTypeId) ?? candidates[0]
  }

  function getRouteName(leg: PackageDetail["legs"][number], routeId: string) {
    return leg.routes.find((route) => route.id === routeId)?.name ?? null
  }

  function getSuiteTypeName(leg: PackageDetail["legs"][number], suiteTypeId: string) {
    return leg.suiteTypes.find((suiteType) => suiteType.id === suiteTypeId)?.name ?? null
  }

  function findTransportRequestsForLeg(
    legId: string,
    serviceType: "transfer" | "rental",
  ): TransportRequestRow[] {
    return ((transportRequests ?? []) as TransportRequestRow[]).filter(
      (request) => request.package_leg_id === legId && request.service_type === serviceType,
    )
  }

  function getBillableRentalDays(request: TransportRequestRow | null): number {
    const rentalDetails = Array.isArray(request?.rental_details)
      ? request?.rental_details[0]
      : request?.rental_details
    if (!request?.pickup_at || !rentalDetails?.return_at) return 1

    const pickupAt = new Date(request.pickup_at)
    const returnAt = new Date(rentalDetails.return_at)
    if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(returnAt.getTime())) return 1

    const durationMs = returnAt.getTime() - pickupAt.getTime()
    if (durationMs <= 0) return 1

    return Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)))
  }

  if (packageDetail.fixedPricePerPerson !== null) {
    const travellerCount = job.no_of_adults + job.no_of_children

    for (const leg of packageDetail.legs) {
      const selection = getLegSelection(leg)
      const isOptional = isOptionalPackageLegKind(leg.supplierKind)
      if (isOptional && !selection.selected) continue
      // Zero-priced on purpose: the leg is an inclusion of the package, and the
      // whole price sits on the "Package Total" line below. The snapshot marks
      // it as such so it isn't mistaken for a line nobody got round to pricing.
      lineItems.push({
        description: leg.label ?? leg.supplierName,
        supplierDescription: leg.supplierDescription ?? null,
        qty: travellerCount,
        unitPrice: 0,
        total: 0,
        pricingSnapshot: {
          source: "pricing_engine",
          pricingMode: "fixed_package",
          packageId: packageDetail.id,
          packageName: packageDetail.name,
          legId: leg.id,
          legLabel: leg.label ?? null,
          supplierId: leg.supplierId ?? null,
          supplierName: leg.supplierName ?? null,
          supplierKind: leg.supplierKind ?? null,
          routeId: null,
          routeName: null,
          suiteTypeId: null,
          suiteTypeName: null,
          rateCardId: null,
          travelDate,
          passengerKind: "included",
          baseUnitPrice: 0,
          markupPct: 0,
          singleSupplementPct: null,
          serviceType: null,
          unit: null,
        },
      })
    }

    addLineItem({
      description: `${packageDetail.name} — Package Total`,
      qty: travellerCount,
      unitPrice: packageDetail.fixedPricePerPerson,
      unit: "per person",
    })
  } else {
    for (const leg of packageDetail.legs) {
      const selection = getLegSelection(leg)
      const isHotel = leg.supplierKind === "hotel_property"
      const isTransfer = leg.supplierKind === "transfers"
      const isVehicleRental = leg.supplierKind === "vehicle_rental"
      const isOptional = isOptionalPackageLegKind(leg.supplierKind)

      if (isOptional && !selection.selected) {
        continue
      }

      const requiredRouteId = getRequiredRouteId(leg, selection)
      if (!requiredRouteId) {
        throw new Error(`No ${isHotel ? "meal plan" : "route"} selected for leg: ${leg.label ?? leg.supplierName}`)
      }
      const routeId: string = requiredRouteId

      const routeBelongsToLeg = leg.routes.some((route) => route.id === routeId)
      if (!routeBelongsToLeg) {
        throw new Error(`Selected route is not available for leg: ${leg.label ?? leg.supplierName}`)
      }

      const legLabel = leg.label ?? leg.supplierName
      const routeName = getRouteName(leg, routeId)
      const supplierDescription = leg.supplierDescription ?? null
      const commission = commissionFor(leg, routeId, selection.commissionOverride ?? null)
      const unit = SUPPLIER_VOCABULARY[leg.supplierKind].priceLabel

      function resolveUnit(suiteTypeId: string) {
        const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
        if (!suiteBelongsToLeg) {
          throw new Error(`Selected type is not available for leg: ${legLabel}`)
        }
        const validRateCard = getValidRateCard(leg, routeId, suiteTypeId, selection.rateTypeId)
        if (!validRateCard) {
          throw new Error(`No pricing available for "${legLabel}" on ${travelDate}. Update the package rate cards first.`)
        }
        const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
        const description = [legLabel, suiteTypeName, routeName].filter(Boolean).join(" - ")
        return { validRateCard, description }
      }

      if (isHotel) {
        const units = selection.units ?? []
        if (units.length === 0) {
          throw new Error(`No room type selected for leg: ${legLabel}`)
        }
        // Nights is a leg-level stay length (a booking's stay doesn't split per room); rooms is
        // implicitly units.length — each unit is an independent room, its own suite/bed/layout/
        // bathroom, priced qty = nights so qty × unitPrice = total stays correct per room.
        const nights = Math.max(1, selection.nights ?? 1)
        const nightsLabel = `${nights} night${nights === 1 ? "" : "s"}`

        for (const unitSelection of units) {
          const { validRateCard, description } = resolveUnit(unitSelection.suiteTypeId)
          activeRateCard = validRateCard
          addLineItem({
            description: `${description} — ${nightsLabel}`,
            qty: nights,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId: unitSelection.suiteTypeId,
            variantNames: specificUnitVariantNames(unitSelection),
            commission,
            unit,
          })
        }
      } else if (isTransfer || isVehicleRental) {
        const serviceType = isVehicleRental ? "rental" : "transfer"
        const matchingRequests = findTransportRequestsForLeg(leg.id, serviceType)
        // One line item per linked vehicle; if none are linked yet, still price the leg once.
        const requestsToPrice: (TransportRequestRow | null)[] =
          matchingRequests.length > 0 ? matchingRequests : [null]

        for (const transportRequest of requestsToPrice) {
          // Each transport row can carry its own vehicle category; the leg-level selection is
          // the fallback for rows that don't set one.
          const suiteTypeId = transportRequest?.suite_type_id ?? selection.suiteTypeId
          if (!suiteTypeId) {
            throw new Error(`No suite type selected for leg: ${legLabel}`)
          }
          const { validRateCard, description } = resolveUnit(suiteTypeId)
          activeRateCard = validRateCard

          const pointLabel =
            transportRequest
              ? `${transportRequest.pickup_point} -> ${transportRequest.dropoff_point}`
              : null
          const transportDescription = [description, pointLabel].filter(Boolean).join(" - ")

          addLineItem({
            description: transportDescription,
            qty: isVehicleRental ? getBillableRentalDays(transportRequest) : 1,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId,
            commission,
            unit,
          })
        }
      } else {
        const units = selection.units ?? []
        if (units.length === 0) {
          throw new Error(`No suite type selected for leg: ${legLabel}`)
        }

        const totals = countsForBuckets(bucketsForLeg(leg))
        const summed = units.reduce(
          (acc, unitSelection) => ({
            adultCount: acc.adultCount + (unitSelection.adultCount ?? 0),
            childCount: acc.childCount + (unitSelection.childCount ?? 0),
            infantCount: acc.infantCount + (unitSelection.infantCount ?? 0),
          }),
          { adultCount: 0, childCount: 0, infantCount: 0 },
        )
        if (
          summed.adultCount !== totals.adultCount ||
          summed.childCount !== totals.childCount ||
          summed.infantCount !== totals.infantCount
        ) {
          throw new Error(
            `Per-unit passenger counts for leg "${legLabel}" must sum to the booking's traveller totals ` +
              `(expected ${totals.adultCount} adult, ${totals.childCount} child, ${totals.infantCount} infant).`,
          )
        }

        for (const unitSelection of units) {
          const { validRateCard, description } = resolveUnit(unitSelection.suiteTypeId)
          activeRateCard = validRateCard
          const variantNames = specificUnitVariantNames(unitSelection)

          addLineItem({
            description: `${description} - Adult`,
            qty: unitSelection.adultCount ?? 0,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId: unitSelection.suiteTypeId,
            variantNames,
            commission,
            unit,
          })
          addLineItem({
            description: `${description} - Child`,
            qty: unitSelection.childCount ?? 0,
            unitPrice: validRateCard.childPrice ?? validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId: unitSelection.suiteTypeId,
            variantNames,
            commission,
            unit,
          })
          addLineItem({
            description: `${description} - Infant`,
            qty: unitSelection.infantCount ?? 0,
            unitPrice:
              validRateCard.infantPrice ??
              validRateCard.childPrice ??
              validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId: unitSelection.suiteTypeId,
            variantNames,
            commission,
            unit,
          })
        }
      }
    }
  }

  return { lineItems }
}

export function calculateQuoteTotals(lineItems: QuoteLineItem[]) {
  const subtotal = Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const total = Math.round((subtotal + vat) * 100) / 100

  return { subtotal, vat, total }
}
