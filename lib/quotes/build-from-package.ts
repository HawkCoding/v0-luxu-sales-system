import { isOptionalPackageLegKind, SUPPLIER_VOCABULARY } from "@/lib/types"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import type { CommissionKind, PackageDetail, QuoteLineItem } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { fetchDefaultAgeBuckets, resolveAgeBuckets, type AgeBuckets } from "@/lib/pricing/age-buckets"
import { projectPassengerTotals } from "@/lib/packages/passenger-totals"
import { dateOnly } from "@/lib/packages/trip-date-range"
import { getBillableRentalDays } from "@/lib/packages/rental-days"
import { resolveOverrideSetterNames } from "@/lib/quotes/room-override-provenance"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "@/lib/pricing/commission"
import {
  findRateCardCandidates,
  hasAnyRateCardFor,
  hasAnyRateCardForRateType,
  selectRateCard,
} from "@/lib/rate-cards/resolve"
import { applyCommissionBonus } from "@/lib/quotes/apply-commission-bonus"
import { convertAmount, type FxRateMap } from "@/lib/pricing/convert-currency"
import { BASE_CURRENCY, normaliseCurrency } from "@/lib/money"

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
  /** Hotel legs only: a consultant-typed price per room per night that replaces this room's rate
   *  card for this booking. Denominated in the card's own currency (falling back to the leg's
   *  priceCurrency when the room has no card at all), and converted like any other line.
   *
   *  Deliberately unvalidated against the card: the typed figure is what the hotel quoted for
   *  this room, and a wrong one is the consultant's to own — it just has to be visible. */
  manualRoomPrice?: number | null
  /** Server-resolved provenance for manualRoomPrice, stamped into the line's pricing snapshot so
   *  the internal quote view can show who set the price without a second lookup. */
  manualRoomPriceSetAt?: string | null
  manualRoomPriceSetByName?: string | null
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
  /** Manual-pricing legs and transfer/rental price overrides only: the currency the typed fares
   * on this leg are denominated in. Rate-card legs take their currency from the card instead. */
  priceCurrency?: string | null
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
  /** Set for a Build Booking (booking_services) leg. */
  service_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  price_override: number | null
  price_override_set_at: string | null
  price_override_set_by: string | null
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
  /** System default rate type, the last tier tried after the supplier's quoted and base rates. */
  fallbackRateTypeId?: string | null
  /** Optional rate-type metadata for stamping code/name into the pricing snapshot. */
  rateTypes?: RateTypeMeta[]
  /** Flat manual top-up (quotes.commission_bonus) re-folded into the rebuilt Commission line,
   * so re-pricing an existing quote doesn't silently drop it. */
  commissionBonus?: number
  /** The single currency this quote is denominated in. Supplier rates in anything else are
   * converted into it here, and the rate used is stamped onto each line's pricing snapshot. */
  quoteCurrency?: string
  /** Base-currency rates keyed by currency code (see lib/fx/rates.ts). Only consulted when a
   * supplier's currency differs from quoteCurrency, so an all-ZAR quote needs nothing here. */
  fxRates?: FxRateMap
  /** The FX publication date stamped onto converted lines, for the internal provenance note. */
  fxRateAsOf?: string | null
}

/** A leg that could not be priced because it has not been configured yet (no route/meal plan
 * chosen). Reported rather than thrown so the legs that *are* ready still price — see
 * BuildPackageQuoteLineItemsResult.incompleteLegs. */
export interface IncompleteLeg {
  legId: string
  legLabel: string
  message: string
}

interface BuildPackageQuoteLineItemsResult {
  lineItems: QuoteLineItem[]
  /**
   * Legs skipped because they are not configured yet. A non-empty list means `lineItems` is a
   * partial preview: fine to show, never fine to save to a quote.
   *
   * Only missing *configuration* lands here. A leg that is configured but cannot be priced (no
   * rate card covers the travel date, a type that doesn't belong to the leg) still throws, so a
   * pricing failure can never be mistaken for a leg somebody forgot to fill in.
   */
  incompleteLegs: IncompleteLeg[]
}

export async function buildPackageQuoteLineItems({
  supabase,
  packageDetail,
  jobId,
  travelDate,
  selections = [],
  fallbackRateTypeId = null,
  rateTypes = [],
  commissionBonus = 0,
  quoteCurrency = BASE_CURRENCY,
  fxRates = { [BASE_CURRENCY]: 1 },
  fxRateAsOf = null,
}: BuildPackageQuoteLineItemsInput): Promise<BuildPackageQuoteLineItemsResult> {
  const targetCurrency = normaliseCurrency(quoteCurrency)
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
    .select("service_type, route_id, suite_type_id, service_id, pickup_point, dropoff_point, pickup_at, price_override, price_override_set_at, price_override_set_by, rental_details:booking_vehicle_rental_details(return_at)")
    .eq("booking_id", jobId)
    .order("sort_order", { ascending: true })

  // Batch-resolve display names for whoever set a transport price override, same source as the
  // hotel room override's "set by" note — read once here rather than per request below.
  const transportOverrideSetByName = await resolveOverrideSetterNames(
    supabase,
    (transportRequests ?? []).map((request) => request.price_override_set_by),
  )

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
  const incompleteLegs: IncompleteLeg[] = []
  // The rate card resolved for the leg currently being priced; addLineItem
  // reads it to stamp the rate type into each line's pricing snapshot.
  let activeRateCard: PackageDetail["legs"][number]["rateCards"][number] | null = null
  // True when the active card came from a default rather than the leg's own chosen rate type.
  // Stamped onto the snapshot so "priced off the default" survives past the build dialog.
  let activeRateCardInherited = false
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
    /** The currency `unitPrice` is expressed in — the rate card's own, or the leg's for typed
     * fares. Converted into the quote currency before anything else touches the number. */
    sourceCurrency?: string | null
    /** Hotels only: this line's price was typed by a consultant rather than read off the card.
     * Internal-only — none of this reaches the client-facing description or the quote PDF, which
     * show the resulting amount and nothing else. */
    roomOverride?: {
      /** The typed price per room per night, in sourceCurrency. */
      price: number
      /** What the rate card would have charged, same currency. Null when no card covered the room. */
      basePrice: number | null
      setAt: string | null
      setByName: string | null
    } | null
    /** Transfers/rentals only: this line's price was typed by a consultant rather than read off
     * the card. Internal-only, same posture as roomOverride. */
    transportOverride?: {
      /** The typed price (per day for rentals, flat for transfers), in sourceCurrency. */
      price: number
      /** What the rate card would have charged, same currency. Null when no card covered the trip. */
      basePrice: number | null
      setAt: string | null
      setByName: string | null
    } | null
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
    sourceCurrency,
    roomOverride,
    transportOverride,
  }: AddLineItemOptions) {
    if (qty <= 0) return

    // Convert first: the single supplement, the line total and the commission that sums these
    // lines all have to work off a price already in the quote's currency.
    const lineSourceCurrency = normaliseCurrency(sourceCurrency ?? targetCurrency)
    const converted = convertAmount(unitPrice, lineSourceCurrency, targetCurrency, fxRates)
    const sourceUnitPrice = unitPrice
    const convertedUnitPrice = converted.amount
    const wasConverted = lineSourceCurrency !== targetCurrency

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
      ? Math.round(convertedUnitPrice * (1 + singleSupplementPct / 100) * 100) / 100
      : convertedUnitPrice
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
        rateTypeInherited: activeRateCard ? activeRateCardInherited : null,
        travelDate: activePricingDate,
        passengerKind: "adult",
        // Already in the quote's currency, so downstream maths (markup, commission) never has to
        // know a conversion happened; the pre-conversion figure lives in sourceUnitPrice below.
        baseUnitPrice: convertedUnitPrice,
        markupPct: 0,
        singleSupplementPct: singleSupplementPct ?? null,
        // Only stamped when the supplier's currency actually differed — an all-ZAR quote's
        // snapshots stay exactly as they were, so nothing renders a pointless "converted" note.
        sourceCurrency: wasConverted ? lineSourceCurrency : null,
        sourceUnitPrice: wasConverted ? sourceUnitPrice : null,
        fxRate: wasConverted ? converted.rate : null,
        fxRateAsOf: wasConverted ? fxRateAsOf : null,
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
        ...(roomOverride
          ? {
              manualRoomPrice: roomOverride.price,
              manualRoomPriceBase: roomOverride.basePrice,
              manualRoomPriceSetAt: roomOverride.setAt,
              manualRoomPriceSetByName: roomOverride.setByName,
            }
          : {}),
        ...(transportOverride
          ? {
              manualTransportPrice: transportOverride.price,
              manualTransportPriceBase: transportOverride.basePrice,
              manualTransportPriceSetAt: transportOverride.setAt,
              manualTransportPriceSetByName: transportOverride.setByName,
            }
          : {}),
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

  /**
   * Why this leg cannot be priced yet, or null if it is ready. Checked up front so one leg nobody
   * has configured yet no longer costs the salesperson the preview of every other leg — the two
   * cases below are exactly the ones the loop used to throw on before pricing anything.
   */
  function describeLegConfigIssue(
    leg: PackageDetail["legs"][number],
    selection: { routeId?: string },
  ): string | null {
    const legLabel = leg.label ?? leg.supplierName
    const routeId = getRequiredRouteId(leg, selection)
    if (!routeId) {
      return `No ${leg.supplierKind === "hotel_property" ? "meal plan" : "route"} selected for leg: ${legLabel}`
    }
    if (!leg.routes.some((route) => route.id === routeId)) {
      return `Selected route is not available for leg: ${legLabel}`
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
    return selectRateCard(
      candidates,
      perLegRateTypeId,
      leg.quoteRateTypeId,
      leg.baseRateTypeId,
      fallbackRateTypeId,
    )
  }

  /** Falls back to the raw id so an error still points somewhere when the metadata wasn't loaded. */
  function getRateTypeLabel(rateTypeId: string): string {
    const meta = rateTypeMetaById.get(rateTypeId)
    return meta ? meta.name : rateTypeId
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
    // legId is a booking_services id, which is what a request's service_id points at.
    return ((transportRequests ?? []) as TransportRequestRow[]).filter(
      (request) => request.service_id === legId && request.service_type === serviceType,
    )
  }

  function billableRentalDaysForRequest(request: TransportRequestRow | null): number {
    const rentalDetails = Array.isArray(request?.rental_details)
      ? request?.rental_details[0]
      : request?.rental_details
    return getBillableRentalDays(request?.pickup_at ?? null, rentalDetails?.return_at ?? null)
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
      sourceCurrency: packageDetail.currency,
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

      const configIssue = describeLegConfigIssue(leg, selection)
      if (configIssue) {
        incompleteLegs.push({
          legId: leg.id,
          legLabel: leg.label ?? leg.supplierName,
          message: configIssue,
        })
        continue
      }

      // Both guards are unreachable after describeLegConfigIssue — kept so a future caller that
      // skips the pre-check still fails loudly instead of pricing a leg with no route.
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
        const selected = getValidRateCard(leg, routeId, suiteTypeId, pricingDate, selection.rateTypeId)
        const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
        // Name the route + type: the missing dimension is almost never the date, and an error
        // that only names the supplier sends people hunting through validity periods.
        const typeLabel = suiteTypeName ?? SUPPLIER_VOCABULARY[leg.supplierKind].suiteType
        const where = `"${typeLabel}" on "${routeName ?? "this route"}" (${legLabel})`
        if (!selected) {
          throw new Error(
            hasAnyRateCardFor(leg.rateCards, routeId, suiteTypeId)
              ? `No rate card covers ${pricingDate} for ${where}. Extend the validity period or add a new one.`
              : `No rate card for ${where}. Add one under Suppliers → ${leg.supplierName} → rate cards.`,
          )
        }
        if (!selected.ok) {
          // Cards exist for this route + type on this date, just not for the rate type that was
          // asked for. Substituting one silently is what made a chosen rate quote at another
          // rate's price, so this is an error rather than a fallback.
          const rateLabel = getRateTypeLabel(selected.requestedRateTypeId)
          throw new Error(
            hasAnyRateCardForRateType(leg.rateCards, routeId, suiteTypeId, selected.requestedRateTypeId)
              ? `No "${rateLabel}" rate covers ${pricingDate} for ${where}. Extend that rate's validity period or add a rate card.`
              : `"${rateLabel}" has no rate card for ${where}. Add one under Suppliers → ${leg.supplierName} → rate cards.`,
          )
        }
        const description = [legLabel, routeName].filter(Boolean).join(" - ")
        return {
          validRateCard: selected.card,
          rateTypeInherited: selected.inherited,
          description,
          suiteTypeName,
        }
      }

      /** A unit carrying a typed override still tries its rate card — the card's price and
       * currency are wanted for the internal "was / now" note — but a miss is no longer fatal.
       * A negotiated one-off room or trip, or a season nobody has loaded yet, is exactly the case
       * the override exists for, and hard-failing there would block the whole quote. */
      function resolveOverriddenUnit(suiteTypeId: string, pricingDate: string = legPricingDate) {
        const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
        if (!suiteBelongsToLeg) {
          throw new Error(`Selected type is not available for leg: ${legLabel}`)
        }
        const selected = getValidRateCard(leg, routeId, suiteTypeId, pricingDate, selection.rateTypeId)
        return {
          validRateCard: selected?.ok ? selected.card : null,
          rateTypeInherited: selected?.ok ? selected.inherited : null,
          description: [legLabel, routeName].filter(Boolean).join(" - "),
          suiteTypeName: getSuiteTypeName(leg, suiteTypeId),
        }
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
          // 0 is a real override (a comped room), so this is a null check, not a truthiness one.
          const overridePrice =
            unitSelection.manualRoomPrice === null || unitSelection.manualRoomPrice === undefined
              ? null
              : unitSelection.manualRoomPrice

          if (overridePrice !== null) {
            const { validRateCard, rateTypeInherited, description, suiteTypeName } =
              resolveOverriddenUnit(unitSelection.suiteTypeId)
            activeRateCard = validRateCard
            activeRateCardInherited = rateTypeInherited ?? false
            // The typed figure is in the currency of the card it replaces; with no card to
            // replace, the leg's own price currency is what the consultant was shown.
            const overrideCurrency = validRateCard?.currency ?? selection.priceCurrency ?? targetCurrency
            addLineItem({
              description,
              qty: nights,
              unitPrice: overridePrice,
              supplierDescription,
              suiteTypeId: unitSelection.suiteTypeId,
              suiteTypeName,
              variantNames: specificUnitVariantNames(unitSelection),
              selectedVariantGroups: specificUnitVariantGroups(unitSelection),
              unit,
              hideRoomConfig: true,
              sourceCurrency: overrideCurrency,
              roomOverride: {
                price: overridePrice,
                basePrice: validRateCard?.pricePerPerson ?? null,
                setAt: unitSelection.manualRoomPriceSetAt ?? null,
                setByName: unitSelection.manualRoomPriceSetByName ?? null,
              },
            })
            continue
          }

          const { validRateCard, rateTypeInherited, description, suiteTypeName } = resolveUnit(
            unitSelection.suiteTypeId,
          )
          activeRateCard = validRateCard
          activeRateCardInherited = rateTypeInherited
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
            sourceCurrency: validRateCard.currency,
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

          const pointLabel =
            transportRequest?.pickup_point.trim() && transportRequest?.dropoff_point.trim()
              ? `${transportRequest.pickup_point} -> ${transportRequest.dropoff_point}`
              : null
          const qty = isVehicleRental ? billableRentalDaysForRequest(transportRequest) : 1

          // A per-request price override beats the rate card (odd trips, after-hours, etc.). A
          // missing card is no longer fatal once an override is set — see resolveOverriddenUnit.
          const overridePrice = transportRequest?.price_override ?? null

          if (overridePrice !== null) {
            const { validRateCard, rateTypeInherited, description, suiteTypeName } = resolveOverriddenUnit(
              suiteTypeId,
              requestPricingDate,
            )
            activeRateCard = validRateCard
            activeRateCardInherited = rateTypeInherited ?? false
            // The typed figure is in the currency of the card it replaces; with no card to
            // replace, the leg's own price currency is what the consultant was shown.
            const overrideCurrency = validRateCard?.currency ?? selection.priceCurrency ?? targetCurrency
            // Transfers show supplier label + route leg (e.g. "Ulysses Tours & Transfers - CPT
            // Station → Hotel"); suiteTypeName (vehicle category) stays internal pricing metadata.
            const transportDescription = isTransfer
              ? description
              : [description, pointLabel].filter(Boolean).join(" - ")
            addLineItem({
              description: transportDescription,
              qty,
              unitPrice: overridePrice,
              supplierDescription,
              suiteTypeId,
              suiteTypeName,
              unit,
              hideVariantSuffix: isTransfer,
              sourceCurrency: overrideCurrency,
              transportOverride: {
                price: overridePrice,
                basePrice: validRateCard?.pricePerPerson ?? null,
                setAt: transportRequest?.price_override_set_at ?? null,
                setByName: transportOverrideSetByName.get(transportRequest?.price_override_set_by ?? "") ?? null,
              },
            })
            continue
          }

          const { validRateCard, rateTypeInherited, description, suiteTypeName } = resolveUnit(
            suiteTypeId,
            requestPricingDate,
          )
          activeRateCard = validRateCard
          activeRateCardInherited = rateTypeInherited
          const transportDescription = isTransfer
            ? description
            : [description, pointLabel].filter(Boolean).join(" - ")
          addLineItem({
            description: transportDescription,
            qty,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId,
            suiteTypeName,
            unit,
            hideVariantSuffix: isTransfer,
            sourceCurrency: validRateCard.currency,
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
          // Typed fares carry the leg's own currency; rate-card fares carry the card's.
          let lineSourceCurrency: string

          if (isManualPricing) {
            const resolved = resolveManualUnit(suiteTypeId)
            description = resolved.description
            suiteTypeName = resolved.suiteTypeName
            activeRateCard = null
            activeRateCardInherited = false
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
            lineSourceCurrency = selection.priceCurrency ?? targetCurrency
          } else {
            const resolved = resolveUnit(suiteTypeId)
            description = resolved.description
            suiteTypeName = resolved.suiteTypeName
            activeRateCard = resolved.validRateCard
            activeRateCardInherited = resolved.rateTypeInherited
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
            lineSourceCurrency = validRateCard.currency
          }

          for (const { key, label, unitPrice } of passengerKinds) {
            // A unit occupied by exactly one traveller (of any age) pays the single supplement —
            // it's a solo room, not specifically a solo adult. Solo-room travellers can't merge
            // into the shared qty since they don't share its unit price, so they're tallied and
            // priced on their own line.
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
                soloContributingUnits.push(unitSelection)
              } else {
                sharedContributingUnits.push(unitSelection)
              }
            }
            // Units sharing a suite type can still differ in bedroom/layout/bathroom config (e.g.
            // two "Deluxe Suite" rooms, one Twin/Crosswise, one Double/L-Shape). Naming a merged
            // line by "exactly one unit" collapsed onto the suite type's whole catalogue whenever
            // >1 unit fed it, so instead split each of shared/solo into one line per distinct
            // config actually picked in the builder, summing that config's own qty.
            for (const [contributingUnits, isSolo] of [
              [sharedContributingUnits, false],
              [soloContributingUnits, true],
            ] as const) {
              const unitsByVariant = new Map<string, PackageUnitSelection[]>()
              for (const unitSelection of contributingUnits) {
                const variantKey = [
                  unitSelection.bedroomTypeId ?? "",
                  unitSelection.bedroomLayoutId ?? "",
                  unitSelection.bathroomTypeId ?? "",
                ].join("::")
                const list = unitsByVariant.get(variantKey) ?? []
                list.push(unitSelection)
                unitsByVariant.set(variantKey, list)
              }
              for (const variantUnits of unitsByVariant.values()) {
                const qty = variantUnits.reduce((sum, unitSelection) => sum + (unitSelection[key] ?? 0), 0)
                addLineItem({
                  description,
                  passengerLabel: label,
                  qty,
                  unitPrice,
                  supplierDescription,
                  suiteTypeId,
                  suiteTypeName,
                  variantNames: specificUnitVariantNames(variantUnits[0]),
                  selectedVariantGroups: specificUnitVariantGroups(variantUnits[0]),
                  unit,
                  pricingMode: isManualPricing ? "manual" : "rate_card",
                  singleSupplementPct: isSolo ? packageDetail.singleSupplementPct : null,
                  sourceCurrency: lineSourceCurrency,
                })
              }
            }
          }
        }
      }
    }
  }

  // Commission is one shared decision for the whole booking (the Build Booking dialog collects
  // it once), so it's priced once here against the booking's total — never per line. Applying it
  // per line double- (or triple-, quadruple-...) counts a fixed per-person value across every
  // room/transfer/supplement line, since each carries its own unrelated qty (nights, vehicles, pax).
  // Commission is typed by the salesperson in the quote's own currency (a percent is
  // currency-neutral anyway), and it prices off a subtotal whose lines have already been
  // converted — so it needs no conversion of its own.
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
  return { lineItems: applyCommissionBonus(lineItems, commissionBonus), incompleteLegs }
}

export function calculateQuoteTotals(lineItems: QuoteLineItem[]) {
  const subtotal = Math.round(lineItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100

  return { subtotal, total: subtotal }
}
