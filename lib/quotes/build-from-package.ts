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

export interface PackageLegSelection {
  legId: string
  selected?: boolean
  routeId?: string
  suiteTypeId?: string
  rateTypeId?: string
  /** Hotel legs only: number of rooms booked (default 1). */
  rooms?: number
  /** Hotel legs only: number of nights stayed (default 1). Independent of journey duration. */
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
    .select("service_type, route_id, suite_type_id, pickup_point, dropoff_point, pickup_at, rental_details:booking_vehicle_rental_details(return_at)")
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
    commission,
    unit,
  }: AddLineItemOptions) {
    if (qty <= 0) return

    const variantSuffix = formatVariantSuffix(suiteTypeId ?? null)
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

  function findTransportRequest(
    serviceType: "transfer" | "rental",
    routeId: string,
    suiteTypeId: string,
  ): TransportRequestRow | null {
    return (
      ((transportRequests ?? []) as TransportRequestRow[]).find(
        (request) =>
          request.service_type === serviceType &&
          (request.route_id === routeId || request.suite_type_id === suiteTypeId),
      ) ?? null
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
      lineItems.push({
        description: leg.label ?? leg.supplierName,
        supplierDescription: leg.supplierDescription ?? null,
        qty: travellerCount,
        unitPrice: 0,
        total: 0,
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

      const routeId = getRequiredRouteId(leg, selection)
      if (!routeId) {
        throw new Error(`No ${isHotel ? "meal plan" : "route"} selected for leg: ${leg.label ?? leg.supplierName}`)
      }

      const routeBelongsToLeg = leg.routes.some((route) => route.id === routeId)
      if (!routeBelongsToLeg) {
        throw new Error(`Selected route is not available for leg: ${leg.label ?? leg.supplierName}`)
      }

      const suiteTypeId = selection.suiteTypeId
      if (!suiteTypeId) {
        throw new Error(`No ${isHotel ? "room type" : "suite type"} selected for leg: ${leg.label ?? leg.supplierName}`)
      }

      const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
      if (!suiteBelongsToLeg) {
        throw new Error(`Selected type is not available for leg: ${leg.label ?? leg.supplierName}`)
      }

      const validRateCard = getValidRateCard(leg, routeId, suiteTypeId, selection.rateTypeId)
      if (!validRateCard) {
        const legLabel = leg.label ?? leg.supplierName
        throw new Error(`No pricing available for "${legLabel}" on ${travelDate}. Update the package rate cards first.`)
      }
      activeRateCard = validRateCard

      const legLabel = leg.label ?? leg.supplierName
      const routeName = getRouteName(leg, routeId)
      const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
      const descriptionParts = [legLabel, suiteTypeName, routeName].filter(Boolean)
      const description = descriptionParts.join(" - ")
      const supplierDescription = leg.supplierDescription ?? null

      const commission = commissionFor(leg, routeId, selection.commissionOverride ?? null)

      const unit = SUPPLIER_VOCABULARY[leg.supplierKind].priceLabel

      if (isHotel) {
        // Hotel rooms and nights are explicit booking inputs (default 1 each),
        // independent of the journey/package duration. qty = rooms × nights keeps
        // the qty × unitPrice = total invariant; the description spells out both.
        const rooms = Math.max(1, selection.rooms ?? 1)
        const nights = Math.max(1, selection.nights ?? 1)
        const nightsLabel = `${nights} night${nights === 1 ? "" : "s"}`
        const stayLabel = rooms === 1 ? nightsLabel : `${rooms} rooms × ${nightsLabel}`
        addLineItem({
          description: `${description} — ${stayLabel}`,
          qty: rooms * nights,
          unitPrice: validRateCard.pricePerPerson,
          supplierDescription,
          suiteTypeId,
          commission,
          unit,
        })
      } else if (isTransfer || isVehicleRental) {
        const serviceType = isVehicleRental ? "rental" : "transfer"
        const transportRequest = findTransportRequest(serviceType, routeId, suiteTypeId)
        const pointLabel =
          transportRequest
            ? `${transportRequest.pickup_point} -> ${transportRequest.dropoff_point}`
            : null
        const transportDescription = [description, pointLabel].filter(Boolean).join(" - ")

        if (isVehicleRental) {
          addLineItem({
            description: transportDescription,
            qty: getBillableRentalDays(transportRequest),
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId,
            commission,
            unit,
          })
        } else {
          addLineItem({
            description: transportDescription,
            qty: 1,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId,
            commission,
            unit,
          })
        }
      } else {
        const { adultCount, childCount, infantCount } = countsForBuckets(bucketsForLeg(leg))
        addLineItem({
          description: `${description} - Adult`,
          qty: adultCount,
          unitPrice: validRateCard.pricePerPerson,
          supplierDescription,
          suiteTypeId,
          commission,
          unit,
        })
        addLineItem({
          description: `${description} - Child`,
          qty: childCount,
          unitPrice: validRateCard.childPrice ?? validRateCard.pricePerPerson,
          supplierDescription,
          suiteTypeId,
          commission,
          unit,
        })
        addLineItem({
          description: `${description} - Infant`,
          qty: infantCount,
          unitPrice:
            validRateCard.infantPrice ??
            validRateCard.childPrice ??
            validRateCard.pricePerPerson,
          supplierDescription,
          suiteTypeId,
          commission,
          unit,
        })
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
