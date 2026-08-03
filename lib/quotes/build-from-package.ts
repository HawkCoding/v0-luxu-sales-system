import { isOptionalPackageLegKind, SUPPLIER_VOCABULARY } from "@/lib/types"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import type { CommissionKind, PackageDetail, QuoteLineItem } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { fetchDefaultAgeBuckets, resolveAgeBuckets, type AgeBuckets } from "@/lib/pricing/age-buckets"
import { projectPassengerTotals } from "@/lib/packages/passenger-totals"
import { dateOnly } from "@/lib/packages/trip-date-range"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "@/lib/pricing/commission"
import { findRateCardCandidates, hasAnyRateCardFor, selectRateCard } from "@/lib/rate-cards/resolve"
import { applyCommissionBonus } from "@/lib/quotes/apply-commission-bonus"

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
  /** Manual-pricing legs only (see PackageLeg.pricingMode): the typed fare for this unit's cabin.
   *  childPrice/infantPrice default up to adultPrice, mirroring the rate-card fallback below. */
  manualAdultPrice?: number | null
  manualChildPrice?: number | null
  manualInfantPrice?: number | null
}

export interface PackageLegSelection {
  legId: string
  selected?: boolean
  routeId?: string
  /** Transfer/vehicle-rental legs only: the vehicle category (train/hotel legs use `units`). */
  suiteTypeId?: string
  rateTypeId?: string
  /** This leg's own service date (YYYY-MM-DD) — rate cards are matched against it, falling back
   * to the quote-level travelDate when unset. */
  serviceDate?: string | null
  /** Two-way (round_trip) routes only: when true the booking travels destination → origin. */
  routeReversed?: boolean
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
  /** Set for a catalogue-package leg. Booking-scoped services set service_id instead — never both. */
  package_leg_id: string | null
  /** Set for a Build Booking (booking_services) leg. */
  service_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  price_override: number | null
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
  /** Flat manual top-up (quotes.commission_bonus) re-folded into the rebuilt Commission line,
   * so re-pricing an existing quote doesn't silently drop it. */
  commissionBonus?: number
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
  commissionBonus = 0,
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
    .select("service_type, route_id, suite_type_id, package_leg_id, service_id, pickup_point, dropoff_point, pickup_at, price_override, rental_details:booking_vehicle_rental_details(return_at)")
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
    return flatValues.join(", ")
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

  /** Same chosen names as specificUnitVariantNames, grouped by label so email tokens can tell
   * "what was picked" apart from suiteVariants' "everything the suite type offers" list. */
  function specificUnitVariantGroups(unitSelection: PackageUnitSelection): { label: string; values: string[] }[] {
    const groups: { label: string; values: string[] }[] = []
    if (unitSelection.bedroomTypeId) {
      const name = bedroomTypeNameById.get(unitSelection.bedroomTypeId)
      if (name) groups.push({ label: "Bedroom Type", values: [name] })
    }
    if (unitSelection.bedroomLayoutId) {
      const name = bedroomLayoutNameById.get(unitSelection.bedroomLayoutId)
      if (name) groups.push({ label: "Bedroom Layout", values: [name] })
    }
    if (unitSelection.bathroomTypeId) {
      const name = bathroomTypeNameById.get(unitSelection.bathroomTypeId)
      if (name) groups.push({ label: "Bathroom Type", values: [name] })
    }
    return groups
  }

  const selectionMap = new Map(selections.map((entry) => [entry.legId, entry]))
  const rateTypeMetaById = new Map(rateTypes.map((rt) => [rt.id, rt]))
  const lineItems: QuoteLineItem[] = []
  // The rate card resolved for the leg currently being priced; addLineItem
  // reads it to stamp the rate type into each line's pricing snapshot.
  let activeRateCard: PackageDetail["legs"][number]["rateCards"][number] | null = null
  // The leg + route currently being priced. addLineItem stamps these into the
  // snapshot so downstream (e.g. resolvePrimaryRoute → booking.route_id sync)
  // can recover which journey a quote is for.
  let activeLeg: PackageDetail["legs"][number] | null = null
  let activeRouteId: string | null = null
  let activeRouteName: string | null = null
  let activeRouteReversed = false
  // The date the current line's rate card was matched against (the leg's own service date, or
  // the quote-level travelDate when the leg has none).
  let activePricingDate: string = travelDate
  const childAges = job.child_ages ?? []
  // The booking's real headcount — used once, for the single whole-booking commission line,
  // not per line (a line's own qty may be nights/vehicles/rooms rather than passengers).
  const travellerCount = job.no_of_adults + job.no_of_children

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

  function bucketsForLeg(leg: PackageDetail["legs"][number]): AgeBuckets {
    const override = leg.supplierId ? supplierOverridesById.get(leg.supplierId) : null
    return resolveAgeBuckets(defaultBuckets, override)
  }

  const bookingForCounts = job
  function countsForBuckets(buckets: AgeBuckets) {
    return projectPassengerTotals(
      { noOfAdults: bookingForCounts.no_of_adults, noOfChildren: bookingForCounts.no_of_children, childAges },
      buckets,
    )
  }

  interface AddLineItemOptions {
    description: string
    qty: number
    unitPrice: number
    supplierDescription?: string | null
    suiteTypeId?: string | null
    suiteTypeName?: string | null
    /** A specific unit's chosen bedroom/layout/bathroom names — overrides the suite type's full
     * list of associated vocab when the unit narrowed its selection to specific values. */
    variantNames?: string[] | null
    /** Same chosen values as variantNames, grouped by label for pricingSnapshot.selectedVariants —
     * lets email tokens read "what was picked" instead of falling back to suiteVariants' full list. */
    selectedVariantGroups?: { label: string; values: string[] }[] | null
    /** Display-only basis shown next to the quantity (e.g. "per person", "per night"). */
    unit?: string | null
    /** When set, this occupant is the sole traveller in the unit: the rate is bumped by this
     * percentage and the bump is called out on the same line instead of its own line item. */
    singleSupplementPct?: number | null
    /** Passenger type ("Adult"/"Child"/"Infant") — rendered at the very end of the line, after
     * the suite variant suffix, e.g. "... — Deluxe Twin, Shower - Adult". */
    passengerLabel?: string | null
    /** Transfers/rentals only: drop the suite/vehicle-type suffix entirely — the client-facing
     * description is just the leg's own label, not the internal vehicle category. */
    hideVariantSuffix?: boolean
    /** Hotels only: show the suite type name alone, never the selected/possible bedroom, layout,
     * or bathroom config — those stay internal (pricingSnapshot) rather than client-facing. */
    hideRoomConfig?: boolean
    /** 'manual' for a line priced off a typed fare rather than a rate card (see PackageLeg.pricingMode). */
    pricingMode?: "rate_card" | "manual"
  }

  function formatSingleSupplementSuffix(pct: number): string {
    const trimmed = Number.isInteger(pct) ? pct.toString() : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    return ` (${trimmed}% single supplement included)`
  }

  function addLineItem({
    description,
    qty,
    unitPrice,
    supplierDescription,
    suiteTypeId,
    suiteTypeName,
    variantNames,
    selectedVariantGroups,
    unit,
    singleSupplementPct,
    passengerLabel,
    hideVariantSuffix,
    hideRoomConfig,
    pricingMode: linePricingMode = "rate_card",
  }: AddLineItemOptions) {
    if (qty <= 0) return

    const variantValues = hideRoomConfig
      ? ""
      : variantNames && variantNames.length > 0
        ? variantNames.join(", ")
        : formatVariantSuffix(suiteTypeId ?? null)
    const variantSuffixBody = hideVariantSuffix
      ? ""
      : [suiteTypeName, variantValues].filter((part) => part && part.length > 0).join(" ")
    const variantSuffix = variantSuffixBody ? ` — ${variantSuffixBody}` : ""
    const suiteVariants = suiteTypeId ? variantSnapshotBySuiteTypeId.get(suiteTypeId) : undefined
    const effectiveUnitPrice = singleSupplementPct
      ? Math.round(unitPrice * (1 + singleSupplementPct / 100) * 100) / 100
      : unitPrice
    const total = Math.round(effectiveUnitPrice * qty * 100) / 100
    const supplementSuffix = singleSupplementPct ? formatSingleSupplementSuffix(singleSupplementPct) : ""
    const passengerSuffix = passengerLabel ? ` - ${passengerLabel}` : ""

    const lineItem: QuoteLineItem = {
      description: `${description}${variantSuffix}${supplementSuffix}${passengerSuffix}`,
      supplierDescription: supplierDescription ?? null,
      qty,
      unitPrice: effectiveUnitPrice,
      total,
    }

    const rateTypeMeta = activeRateCard ? rateTypeMetaById.get(activeRateCard.rateTypeId) : undefined

    if ((suiteVariants && suiteVariants.length > 0) || unit) {
      lineItem.pricingSnapshot = {
        source: "pricing_engine",
        pricingMode: linePricingMode,
        packageId: packageDetail.id,
        packageName: packageDetail.name,
        legId: activeLeg?.id ?? null,
        legLabel: activeLeg?.label ?? activeLeg?.supplierName ?? null,
        supplierId: activeLeg?.supplierId ?? null,
        supplierName: activeLeg?.supplierName ?? null,
        supplierKind: activeLeg?.supplierKind ?? null,
        routeId: activeRouteId,
        routeName: activeRouteName,
        routeReversed: activeRouteReversed,
        suiteTypeId: suiteTypeId ?? null,
        suiteTypeName: suiteTypeName ?? null,
        rateCardId: activeRateCard?.id ?? null,
        rateTypeId: activeRateCard?.rateTypeId ?? null,
        rateTypeCode: rateTypeMeta?.code ?? null,
        rateTypeName: rateTypeMeta?.name ?? null,
        travelDate: activePricingDate,
        passengerKind: "adult",
        baseUnitPrice: unitPrice,
        markupPct: 0,
        singleSupplementPct: singleSupplementPct ?? null,
        serviceType:
          activeLeg?.supplierKind === "transfers"
            ? "transfer"
            : activeLeg?.supplierKind === "vehicle_rental"
              ? "rental"
              : null,
        suiteVariants,
        selectedVariants: selectedVariantGroups && selectedVariantGroups.length > 0 ? selectedVariantGroups : undefined,
        commission: null,
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
    pricingDate: string,
    perLegRateTypeId?: string | null,
  ) {
    const candidates = findRateCardCandidates(leg.rateCards, routeId, suiteTypeId, pricingDate)
    return selectRateCard(candidates, perLegRateTypeId, quoteRateTypeId, fallbackRateTypeId)
  }

  function getRouteName(leg: PackageDetail["legs"][number], routeId: string, reversed = false) {
    const route = leg.routes.find((route) => route.id === routeId)
    if (!route) return null
    // Only two-way point-to-point routes have a meaningful travel direction to render; everything
    // else (one-way routes, hotel meal plans) keeps its stored name regardless of `reversed`.
    if (route.directionMode !== "round_trip" || !route.originLocationName || !route.destinationLocationName) {
      return route.name
    }
    return resolveDirectedRouteName(route.originLocationName, route.destinationLocationName, reversed)
  }

  function getSuiteTypeName(leg: PackageDetail["legs"][number], suiteTypeId: string) {
    return leg.suiteTypes.find((suiteType) => suiteType.id === suiteTypeId)?.name ?? null
  }

  function findTransportRequestsForLeg(
    legId: string,
    serviceType: "transfer" | "rental",
  ): TransportRequestRow[] {
    // A catalogue-package leg sets package_leg_id; a Build Booking (booking_services) leg sets
    // service_id instead. A given request only ever has one of the two, so matching either is safe.
    return ((transportRequests ?? []) as TransportRequestRow[]).filter(
      (request) =>
        (request.package_leg_id === legId || request.service_id === legId) &&
        request.service_type === serviceType,
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
      const routeReversed = selection.routeReversed ?? false
      const routeName = getRouteName(leg, routeId, routeReversed)
      activeLeg = leg
      activeRouteId = routeId
      activeRouteName = routeName
      activeRouteReversed = routeReversed
      // Each leg prices off its own service date so e.g. a pre-stay hotel in a different
      // rate-card season than the train still gets the right card.
      const legPricingDate = selection.serviceDate ?? travelDate
      activePricingDate = legPricingDate
      const supplierDescription = leg.supplierDescription ?? null
      const unit = SUPPLIER_VOCABULARY[leg.supplierKind].priceLabel

      function resolveUnit(suiteTypeId: string, pricingDate: string = legPricingDate) {
        const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
        if (!suiteBelongsToLeg) {
          throw new Error(`Selected type is not available for leg: ${legLabel}`)
        }
        const validRateCard = getValidRateCard(leg, routeId, suiteTypeId, pricingDate, selection.rateTypeId)
        const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
        if (!validRateCard) {
          // Name the route + type: the missing dimension is almost never the date, and an error
          // that only names the supplier sends people hunting through validity periods.
          const typeLabel = suiteTypeName ?? SUPPLIER_VOCABULARY[leg.supplierKind].suiteType
          const where = `"${typeLabel}" on "${routeName ?? "this route"}" (${legLabel})`
          throw new Error(
            hasAnyRateCardFor(leg.rateCards, routeId, suiteTypeId)
              ? `No rate card covers ${pricingDate} for ${where}. Extend the validity period or add a new one.`
              : `No rate card for ${where}. Add one under Suppliers → ${leg.supplierName} → rate cards.`,
          )
        }
        const description = [legLabel, routeName].filter(Boolean).join(" - ")
        return { validRateCard, description, suiteTypeName }
      }

      // Manual-pricing legs (see PackageLeg.pricingMode) never touch rate_cards -- the fare is
      // typed per unit at quote-build time instead, so there is nothing here to validate against
      // a validity window or throw "no rate card" for.
      function resolveManualUnit(suiteTypeId: string) {
        const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
        if (!suiteBelongsToLeg) {
          throw new Error(`Selected type is not available for leg: ${legLabel}`)
        }
        const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
        const description = [legLabel, routeName].filter(Boolean).join(" - ")
        return { description, suiteTypeName }
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

        for (const unitSelection of units) {
          const { validRateCard, description, suiteTypeName } = resolveUnit(unitSelection.suiteTypeId)
          activeRateCard = validRateCard
          addLineItem({
            description,
            qty: nights,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId: unitSelection.suiteTypeId,
            suiteTypeName,
            variantNames: specificUnitVariantNames(unitSelection),
            selectedVariantGroups: specificUnitVariantGroups(unitSelection),
            unit,
            hideRoomConfig: true,
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
          // the fallback for rows that don't set one. Likewise its pickup date is the row's
          // own pricing date.
          const suiteTypeId = transportRequest?.suite_type_id ?? selection.suiteTypeId
          if (!suiteTypeId) {
            throw new Error(`No suite type selected for leg: ${legLabel}`)
          }
          const requestPricingDate = dateOnly(transportRequest?.pickup_at) ?? legPricingDate
          activePricingDate = requestPricingDate
          const { validRateCard, description, suiteTypeName } = resolveUnit(suiteTypeId, requestPricingDate)
          activeRateCard = validRateCard

          const pointLabel =
            transportRequest?.pickup_point.trim() && transportRequest?.dropoff_point.trim()
              ? `${transportRequest.pickup_point} -> ${transportRequest.dropoff_point}`
              : null
          // Transfers show supplier label + route leg (e.g. "Ulysses Tours & Transfers - CPT
          // Station → Hotel"); suiteTypeName (vehicle category) stays internal pricing metadata.
          const transportDescription = isTransfer
            ? description
            : [description, pointLabel].filter(Boolean).join(" - ")

          addLineItem({
            description: transportDescription,
            qty: isVehicleRental ? getBillableRentalDays(transportRequest) : 1,
            // A per-request price override beats the rate card (odd trips, after-hours, etc.).
            unitPrice: transportRequest?.price_override ?? validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId,
            suiteTypeName,
            unit,
            hideVariantSuffix: isTransfer,
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
            `${legLabel}: suites hold ${summed.adultCount} adults, ${summed.childCount} children, ` +
              `${summed.infantCount} infants but the booking is for ${totals.adultCount} adults, ` +
              `${totals.childCount} children, ${totals.infantCount} infants. Update the booking's ` +
              `travellers, or adjust the suite split.`,
          )
        }

        const isManualPricing = leg.pricingMode === "manual"

        // Price against the suite type, not each room's own configuration: multiple units booked
        // under the same suite type (e.g. 3 rooms of "Deluxe Double") combine into one line per
        // passenger type instead of splitting per room, even if their bed/bathroom setup differs.
        // Manual-pricing legs group by suite type *and* typed fare too -- two cabins of the same
        // class quoted at different fares (e.g. two separately-ticketed Business seats) must not
        // silently merge into one averaged line.
        const unitsBySuiteType = new Map<string, PackageUnitSelection[]>()
        for (const unitSelection of units) {
          const groupKey = isManualPricing
            ? [
                unitSelection.suiteTypeId,
                unitSelection.manualAdultPrice ?? "",
                unitSelection.manualChildPrice ?? "",
                unitSelection.manualInfantPrice ?? "",
              ].join("::")
            : unitSelection.suiteTypeId
          const group = unitsBySuiteType.get(groupKey) ?? []
          group.push(unitSelection)
          unitsBySuiteType.set(groupKey, group)
        }

        for (const groupUnits of unitsBySuiteType.values()) {
          const suiteTypeId = groupUnits[0].suiteTypeId

          let description: string
          let suiteTypeName: string | null
          let passengerKinds: {
            key: "adultCount" | "childCount" | "infantCount"
            label: string
            unitPrice: number
          }[]

          if (isManualPricing) {
            const resolved = resolveManualUnit(suiteTypeId)
            description = resolved.description
            suiteTypeName = resolved.suiteTypeName
            activeRateCard = null
            // A group's units share an identical typed-price triple by construction (see the
            // grouping key above), so the first unit's prices speak for the whole group.
            const adultPrice = groupUnits[0].manualAdultPrice ?? 0
            const childPrice = groupUnits[0].manualChildPrice ?? adultPrice
            const infantPrice = groupUnits[0].manualInfantPrice ?? childPrice
            passengerKinds = [
              { key: "adultCount", label: "Adult", unitPrice: adultPrice },
              { key: "childCount", label: "Child", unitPrice: childPrice },
              { key: "infantCount", label: "Infant", unitPrice: infantPrice },
            ]
          } else {
            const resolved = resolveUnit(suiteTypeId)
            description = resolved.description
            suiteTypeName = resolved.suiteTypeName
            activeRateCard = resolved.validRateCard
            const validRateCard = resolved.validRateCard
            passengerKinds = [
              { key: "adultCount", label: "Adult", unitPrice: validRateCard.pricePerPerson },
              { key: "childCount", label: "Child", unitPrice: validRateCard.childPrice ?? validRateCard.pricePerPerson },
              {
                key: "infantCount",
                label: "Infant",
                unitPrice: validRateCard.infantPrice ?? validRateCard.childPrice ?? validRateCard.pricePerPerson,
              },
            ]
          }

          for (const { key, label, unitPrice } of passengerKinds) {
            // A unit occupied by exactly one traveller (of any age) pays the single supplement —
            // it's a solo room, not specifically a solo adult. Solo-room travellers can't merge
            // into the shared qty since they don't share its unit price, so they're tallied and
            // priced on their own line.
            let sharedQty = 0
            let soloQty = 0
            const sharedContributingUnits: PackageUnitSelection[] = []
            const soloContributingUnits: PackageUnitSelection[] = []
            for (const unitSelection of groupUnits) {
              const count = unitSelection[key] ?? 0
              if (count === 0) continue
              const adultCount = unitSelection.adultCount ?? 0
              const childCount = unitSelection.childCount ?? 0
              const infantCount = unitSelection.infantCount ?? 0
              // Manual-pricing legs never carry a single supplement -- the typed fare is already
              // the per-seat price a passenger pays, with no notion of a solo room to bump.
              const isSoloRoom =
                !isManualPricing &&
                SUPPLIER_VOCABULARY[leg.supplierKind].showSingleSupplement &&
                packageDetail.singleSupplementPct > 0 &&
                adultCount + childCount + infantCount === 1
              if (isSoloRoom && count === 1) {
                soloQty += 1
                soloContributingUnits.push(unitSelection)
              } else {
                sharedQty += count
                sharedContributingUnits.push(unitSelection)
              }
            }
            // Each output line (shared vs. solo) names its own config independently — a solo
            // traveller's line must never inherit the shared units' config in this suite-type
            // group, and vice versa. Only when exactly one unit feeds a given line is its exact
            // config known; multiple units feeding the same line have no single config to name,
            // so the suite type's generic option list is shown instead.
            const sharedVariantNames =
              sharedContributingUnits.length === 1 ? specificUnitVariantNames(sharedContributingUnits[0]) : null
            const sharedSelectedVariantGroups =
              sharedContributingUnits.length === 1 ? specificUnitVariantGroups(sharedContributingUnits[0]) : null
            const soloVariantNames =
              soloContributingUnits.length === 1 ? specificUnitVariantNames(soloContributingUnits[0]) : null
            const soloSelectedVariantGroups =
              soloContributingUnits.length === 1 ? specificUnitVariantGroups(soloContributingUnits[0]) : null

            addLineItem({
              description,
              passengerLabel: label,
              qty: sharedQty,
              unitPrice,
              supplierDescription,
              suiteTypeId,
              suiteTypeName,
              variantNames: sharedVariantNames,
              selectedVariantGroups: sharedSelectedVariantGroups,
              unit,
              pricingMode: isManualPricing ? "manual" : "rate_card",
            })
            addLineItem({
              description,
              passengerLabel: label,
              qty: soloQty,
              unitPrice,
              supplierDescription,
              suiteTypeId,
              suiteTypeName,
              variantNames: soloVariantNames,
              selectedVariantGroups: soloSelectedVariantGroups,
              unit,
              singleSupplementPct: soloQty > 0 ? packageDetail.singleSupplementPct : null,
            })
          }
        }
      }
    }
  }

  // Commission is one shared decision for the whole booking (the Build Booking dialog collects
  // it once), so it's priced once here against the booking's total — never per line. Applying it
  // per line double- (or triple-, quadruple-...) counts a fixed per-person value across every
  // room/transfer/supplement line, since each carries its own unrelated qty (nights, vehicles, pax).
  const commissionOverride = selections.find((s) => s.commissionOverride)?.commissionOverride ?? null
  const resolvedCommission = resolveCommission({ lineOverride: commissionOverride })
  if (resolvedCommission.type !== null) {
    const preCommissionSubtotal = Math.round(
      lineItems.reduce((sum, item) => sum + item.total, 0) * 100,
    ) / 100
    const commissionAmount = calculateCommissionAmount({
      amountAfterMarkup: preCommissionSubtotal,
      passengerCount: travellerCount,
      resolved: resolvedCommission,
    })
    const isPerPerson = resolvedCommission.type === "per_person"
    lineItems.push({
      description: "Commission",
      supplierDescription: null,
      qty: isPerPerson ? Math.max(1, travellerCount) : 1,
      unitPrice: isPerPerson ? resolvedCommission.value : commissionAmount,
      total: commissionAmount,
      pricingSnapshot: {
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
        suiteTypeId: null,
        suiteTypeName: null,
        rateCardId: null,
        travelDate,
        passengerKind: "service",
        baseUnitPrice: isPerPerson ? resolvedCommission.value : commissionAmount,
        markupPct: 0,
        singleSupplementPct: null,
        serviceType: null,
        commission: buildCommissionBreakdown(resolvedCommission, commissionAmount, travellerCount),
        unit: isPerPerson ? "per person" : null,
      },
    })
  }

  // Re-fold the quote's manual top-up into the freshly rebuilt Commission line. Without this,
  // any Build Booking re-price would drop it, since every line item is regenerated from scratch.
  return { lineItems: applyCommissionBonus(lineItems, commissionBonus) }
}

export function calculateQuoteTotals(lineItems: QuoteLineItem[]) {
  const subtotal = Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100

  return { subtotal, total: subtotal }
}
