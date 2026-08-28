import {
  isOptionalPackageLegKind,
  isTypePricedSupplier,
  resolveSupplierPriceLabel,
  SUPPLIER_VOCABULARY,
} from "@/lib/types"
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
import type { CommissionKind, PackageDetail, PricingSnapshot, QuoteLineItem, SupplierRateCard } from "@/lib/types"
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
import { manualFares, overriddenFares, rateCardFares, type PassengerFare } from "@/lib/pricing/passenger-fares"
import { resolveTransferPax, resolveTransferPricingBasis } from "@/lib/pricing/transfer-basis"

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
  /** Hotel legs only: the hotel gifted the first night of this room's stay, so the line charges
   *  `nights - 1` at the room's per-night price. Composes with manualRoomPrice rather than
   *  replacing it — the room keeps a real rate and simply loses a night from the count. */
  complimentaryFirstNight?: boolean | null
  /** Tour legs only: a consultant-typed flat price that replaces this unit's rate-card-computed
   *  total (which would otherwise split across adult/child/infant lines). Denominated in the
   *  card's own currency (falling back to the leg's priceCurrency when nothing covers it). */
  manualTourPrice?: number | null
  /** Server-resolved provenance for manualTourPrice, same posture as manualRoomPriceSetAt/-Name. */
  manualTourPriceSetAt?: string | null
  manualTourPriceSetByName?: string | null
  /** Tour legs only: this unit's own rate type, overriding the leg's rateTypeId (PackageLegSelection
   *  below) -- a tour is the one kind whose units price independently, so each needs its own rate
   *  choice instead of sharing the leg's one value. Null/absent falls back to the leg's rateTypeId. */
  rateTypeId?: string | null
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
  id: string
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
  complimentary: boolean
  rental_details?: { return_at: string | null } | { return_at: string | null }[] | null
  /** Transfers only, always 'per_vehicle' for a rental — see lib/pricing/transfer-basis.ts. */
  pricing_basis: "per_vehicle" | "per_person"
  adult_count: number | null
  child_count: number | null
  infant_count: number | null
  price_override_child: number | null
  price_override_infant: number | null
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
    .select(
      "id, service_type, route_id, suite_type_id, service_id, pickup_point, dropoff_point, pickup_at, price_override, price_override_set_at, price_override_set_by, complimentary, rental_details:booking_vehicle_rental_details(return_at), pricing_basis, adult_count, child_count, infant_count, price_override_child, price_override_infant",
    )
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

  // Load display names for the SPECIFIC bedroom/layout/bathroom a unit selected (as opposed to
  // variantSnapshotBySuiteTypeId, which lists everything a suite type could offer). These are the
  // only names that ever reach a line description: a unit with nothing picked is described by its
  // suite type alone, never by the catalogue of options it could have had.
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
    /** What `passengerLabel` means to downstream consumers: invoice descriptions append
     * "(Child)"/"(Infant)" from it, and the flight per-person cap counts adult fares only.
     * Defaults to "adult" — the right answer for every line that isn't split by age. */
    passengerKind?: PricingSnapshot["passengerKind"]
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
    /** Tours only: this line's price was typed by a consultant rather than read off the card.
     * Internal-only, same posture as roomOverride/transportOverride. */
    tourOverride?: {
      /** The typed flat price, in sourceCurrency. */
      price: number
      /** What the rate card would have charged, same currency. Null when no card covered the unit. */
      basePrice: number | null
      setAt: string | null
      setByName: string | null
    } | null
    /** Hotels only: nights of this room's stay the hotel gifted, and the stay they were taken
     * from. `qty` is already the charged nights; these are carried so the quote view, the
     * worksheet and the client documents can still speak about the full stay. */
    complimentary?: {
      nights: number
      stayNights: number
    } | null
    /** Transfers/rentals only: true when the trip was marked complimentary — the line prices at 0
     * regardless of transportOverride/the rate card. See booking_transport_requests.complimentary. */
    isComplimentaryTransport?: boolean
    /** Transfers/rentals only: the booking_transport_requests row this line priced, so the voucher
     * builder can match the complimentary flag back to the specific captured trip. */
    transportRequestId?: string | null
    /** Transfers only: which basis this specific row priced under, so a per-person transfer's
     * three lines (and any surviving per-vehicle sibling on the same leg) are explicable in the
     * internal quote view. See lib/pricing/transfer-basis.ts. */
    transferPricingBasis?: "per_vehicle" | "per_person" | null
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
    passengerKind = "adult",
    hideVariantSuffix,
    hideRoomConfig,
    pricingMode: linePricingMode = "rate_card",
    sourceCurrency,
    roomOverride,
    transportOverride,
    tourOverride,
    complimentary,
    isComplimentaryTransport,
    transportRequestId,
    transferPricingBasis,
  }: AddLineItemOptions) {
    // A stay whose every night was gifted still has to reach the quote: the client documents read
    // their itinerary off the priced legs, so dropping the line would drop the hotel entirely.
    if (qty <= 0 && !complimentary) return

    // Convert first: the single supplement, the line total and the commission that sums these
    // lines all have to work off a price already in the quote's currency.
    const lineSourceCurrency = normaliseCurrency(sourceCurrency ?? targetCurrency)
    const converted = convertAmount(unitPrice, lineSourceCurrency, targetCurrency, fxRates)
    const sourceUnitPrice = unitPrice
    const convertedUnitPrice = converted.amount
    const wasConverted = lineSourceCurrency !== targetCurrency

    const variantValues = hideRoomConfig ? "" : (variantNames ?? []).join(", ")
    const variantSuffixBody = hideVariantSuffix
      ? ""
      : [suiteTypeName, variantValues].filter((part) => part && part.length > 0).join(" ")
    const variantSuffix = variantSuffixBody ? ` — ${variantSuffixBody}` : ""
    const suiteVariants = suiteTypeId ? variantSnapshotBySuiteTypeId.get(suiteTypeId) : undefined
    const effectiveUnitPrice = singleSupplementPct
      ? Math.round(convertedUnitPrice * (1 + singleSupplementPct / 100) * 100) / 100
      : convertedUnitPrice
    // A comped trip prices at 0 regardless of what the rate card says — unitPrice above stays
    // the real rate so the line still shows what the trip would have cost (see build-booking-
    // dialog.tsx / job-quotes-tab.tsx), but nothing is actually charged.
    const total = isComplimentaryTransport ? 0 : Math.round(effectiveUnitPrice * qty * 100) / 100
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
        passengerKind,
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
        ...(complimentary
          ? {
              complimentaryNights: complimentary.nights,
              stayNights: complimentary.stayNights,
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
        ...(tourOverride
          ? {
              manualTourPrice: tourOverride.price,
              manualTourPriceBase: tourOverride.basePrice,
              manualTourPriceSetAt: tourOverride.setAt,
              manualTourPriceSetByName: tourOverride.setByName,
            }
          : {}),
        ...(isComplimentaryTransport
          ? {
              isComplimentaryTransport: true,
              transportRequestId: transportRequestId ?? null,
            }
          : {}),
        ...(transferPricingBasis ? { transferPricingBasis } : {}),
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
    selection: { routeId?: string; units?: PackageUnitSelection[] },
  ): string | null {
    // A tour operator's itinerary is descriptive only and belongs to exactly one tour type, so
    // auto-picking one is only safe when it actually matches a chosen tour type — never blindly
    // grab the supplier's only itinerary if it happens to describe a different tour type. This
    // also governs a *persisted* routeId: a stale/mismatched one (e.g. left over from a removed
    // tour, or stamped by an unrelated default) must not be trusted just because it was saved —
    // see defaultRouteId in lib/packages/apply-dialog-state.ts for the other half of this guard.
    if (isTypePricedSupplier(leg.supplierKind)) {
      const chosenSuiteTypeIds = new Set(
        (selection.units ?? []).flatMap((unit) => (unit.suiteTypeId ? [unit.suiteTypeId] : [])),
      )
      if (selection.routeId) {
        const persisted = leg.routes.find((route) => route.id === selection.routeId)
        if (persisted?.suiteTypeId && chosenSuiteTypeIds.has(persisted.suiteTypeId)) {
          return selection.routeId
        }
      }
      const matching = leg.routes.filter(
        (route) => route.suiteTypeId && chosenSuiteTypeIds.has(route.suiteTypeId),
      )
      return matching.length === 1 ? matching[0].id : null
    }
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
      // A tour operator prices the tour type, not the itinerary — its rate cards carry no route,
      // so a leg with zero (or several) itineraries is still priceable without one selected.
      if (isTypePricedSupplier(leg.supplierKind)) return null
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
      const isTour = leg.supplierKind === "tour_operator"
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
      // skips the pre-check still fails loudly instead of pricing a leg with no route. A type-priced
      // supplier (tour operator) is the one exception: its rate cards carry no route, so a leg with
      // no itinerary selected/available still prices, keyed off "" (coversRoute treats any routeId
      // string against a NULL-route card as a match).
      const requiredRouteId = getRequiredRouteId(leg, selection)
      if (!requiredRouteId && !isTypePricedSupplier(leg.supplierKind)) {
        throw new Error(`No ${isHotel ? "meal plan" : "route"} selected for leg: ${leg.label ?? leg.supplierName}`)
      }
      const routeId: string = requiredRouteId ?? ""

      const routeBelongsToLeg = routeId === "" || leg.routes.some((route) => route.id === routeId)
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

      function resolveUnit(
        suiteTypeId: string,
        pricingDate: string = legPricingDate,
        // Tours resolve their rate type per unit (see PackageUnitSelection.rateTypeId); every
        // other kind falls straight through to the leg's own value.
        unitRateTypeId?: string | null,
      ) {
        const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
        if (!suiteBelongsToLeg) {
          throw new Error(`Selected type is not available for leg: ${legLabel}`)
        }
        const selected = getValidRateCard(
          leg,
          routeId,
          suiteTypeId,
          pricingDate,
          unitRateTypeId ?? selection.rateTypeId,
        )
        const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
        // Name the route + type: the missing dimension is almost never the date, and an error
        // that only names the supplier sends people hunting through validity periods.
        const typeLabel = suiteTypeName ?? SUPPLIER_VOCABULARY[leg.supplierKind].suiteType
        // A tour operator's itinerary saves with a blank name (see app/api/suppliers/[slug]/route.ts),
        // so `||` here (not `??`) is deliberate -- an empty string must fall back same as a null route.
        const where = `"${typeLabel}" on "${routeName || "this route"}" (${legLabel})`
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
      function resolveOverriddenUnit(
        suiteTypeId: string,
        pricingDate: string = legPricingDate,
        unitRateTypeId?: string | null,
      ) {
        const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
        if (!suiteBelongsToLeg) {
          throw new Error(`Selected type is not available for leg: ${legLabel}`)
        }
        const selected = getValidRateCard(
          leg,
          routeId,
          suiteTypeId,
          pricingDate,
          unitRateTypeId ?? selection.rateTypeId,
        )
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

          // The hotel gifted the first night: the room keeps its per-night price and loses a
          // night from the count, so a two-night stay at R4 000 is charged R4 000. The gift is
          // per room, matching the per-room action in suite-leg-editor.tsx.
          const giftedNights = unitSelection.complimentaryFirstNight ? Math.min(1, nights) : 0
          const chargedNights = nights - giftedNights
          const complimentary = giftedNights > 0 ? { nights: giftedNights, stayNights: nights } : null

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
              qty: chargedNights,
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
              complimentary,
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
            qty: chargedNights,
            unitPrice: validRateCard.pricePerPerson,
            supplierDescription,
            suiteTypeId: unitSelection.suiteTypeId,
            suiteTypeName,
            variantNames: specificUnitVariantNames(unitSelection),
            selectedVariantGroups: specificUnitVariantGroups(unitSelection),
            unit,
            hideRoomConfig: true,
            sourceCurrency: validRateCard.currency,
            complimentary,
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

          // Rentals stay per-vehicle-per-day always (enforced in the DB by
          // booking_transport_requests_rental_basis_check); a transfer row's own basis wins over
          // its supplier's current default, so a transfer already priced under one basis is
          // never silently re-priced by a later supplier-level flip.
          const transferBasis = resolveTransferPricingBasis({
            serviceType,
            rowBasis: transportRequest?.pricing_basis ?? null,
            supplierBasis: leg.transferPricingBasis,
          })
          const requestUnit = isTransfer
            ? resolveSupplierPriceLabel(leg.supplierKind, { transferPricingBasis: transferBasis })
            : unit

          // A per-request price override beats the rate card (odd trips, after-hours, etc.). A
          // missing card is no longer fatal once an override is set — see resolveOverriddenUnit.
          // In per-person mode price_override is the adult override; the two extra columns cover
          // child and infant.
          const overridePrice = transportRequest?.price_override ?? null
          const overrideChildPrice = transportRequest?.price_override_child ?? null
          const overrideInfantPrice = transportRequest?.price_override_infant ?? null
          const hasAnyOverride =
            overridePrice !== null || overrideChildPrice !== null || overrideInfantPrice !== null
          // Complimentary takes the same non-fatal path as an override (a comped trip needs no
          // rate card either), and forces the charged price to 0 regardless of what price_override
          // holds — the two fields are independent, mirroring the hotel first-night flag.
          const isComplimentary = transportRequest?.complimentary === true

          if (isTransfer && transferBasis === "per_person") {
            let validRateCard: SupplierRateCard | null
            let rateTypeInherited: boolean | null
            let description: string
            let suiteTypeName: string | null
            let fares: PassengerFare[]

            if (hasAnyOverride || isComplimentary) {
              const resolved = resolveOverriddenUnit(suiteTypeId, requestPricingDate)
              validRateCard = resolved.validRateCard
              rateTypeInherited = resolved.rateTypeInherited
              description = resolved.description
              suiteTypeName = resolved.suiteTypeName
              fares = overriddenFares(validRateCard, {
                adult: overridePrice,
                child: overrideChildPrice,
                infant: overrideInfantPrice,
              })
            } else {
              const resolved = resolveUnit(suiteTypeId, requestPricingDate)
              validRateCard = resolved.validRateCard
              rateTypeInherited = resolved.rateTypeInherited
              description = resolved.description
              suiteTypeName = resolved.suiteTypeName
              fares = rateCardFares(validRateCard)
            }
            activeRateCard = validRateCard
            activeRateCardInherited = rateTypeInherited ?? false
            const lineCurrency = validRateCard?.currency ?? selection.priceCurrency ?? targetCurrency

            const pax = resolveTransferPax(
              {
                adultCount: transportRequest?.adult_count ?? null,
                childCount: transportRequest?.child_count ?? null,
                infantCount: transportRequest?.infant_count ?? null,
              },
              countsForBuckets(bucketsForLeg(leg)),
            )
            const paxByKey = {
              adultCount: pax.adultCount,
              childCount: pax.childCount,
              infantCount: pax.infantCount,
            }

            for (const fare of fares) {
              const overrideForKey =
                fare.key === "adultCount"
                  ? overridePrice
                  : fare.key === "childCount"
                    ? overrideChildPrice
                    : overrideInfantPrice
              addLineItem({
                description,
                passengerLabel: fare.label,
                passengerKind: fare.kind,
                qty: paxByKey[fare.key],
                unitPrice: fare.unitPrice,
                supplierDescription,
                suiteTypeId,
                suiteTypeName,
                unit: requestUnit,
                hideVariantSuffix: true,
                sourceCurrency: lineCurrency,
                ...(overrideForKey !== null
                  ? {
                      transportOverride: {
                        price: overrideForKey,
                        basePrice:
                          fare.key === "adultCount"
                            ? validRateCard?.pricePerPerson ?? null
                            : fare.key === "childCount"
                              ? validRateCard?.childPrice ?? null
                              : validRateCard?.infantPrice ?? null,
                        setAt: transportRequest?.price_override_set_at ?? null,
                        setByName:
                          transportOverrideSetByName.get(transportRequest?.price_override_set_by ?? "") ?? null,
                      },
                    }
                  : {}),
                isComplimentaryTransport: isComplimentary,
                transportRequestId: transportRequest?.id ?? null,
                transferPricingBasis: transferBasis,
              })
            }
            continue
          }

          if (overridePrice !== null || isComplimentary) {
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
              // Complimentary keeps the real rate on display (matches the hotel first-night
              // treatment) — only the charged total is forced to 0, in addLineItem below.
              unitPrice: isComplimentary ? overridePrice ?? validRateCard?.pricePerPerson ?? 0 : overridePrice ?? 0,
              supplierDescription,
              suiteTypeId,
              suiteTypeName,
              unit,
              hideVariantSuffix: isTransfer,
              sourceCurrency: overrideCurrency,
              ...(overridePrice !== null
                ? {
                    transportOverride: {
                      price: overridePrice,
                      basePrice: validRateCard?.pricePerPerson ?? null,
                      setAt: transportRequest?.price_override_set_at ?? null,
                      setByName:
                        transportOverrideSetByName.get(transportRequest?.price_override_set_by ?? "") ?? null,
                    },
                  }
                : {}),
              isComplimentaryTransport: isComplimentary,
              transportRequestId: transportRequest?.id ?? null,
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

        // A tour operator's units are independent activities the same travellers can all join, not
        // sleeping/seating slots -- so unlike every other kind here, their per-unit counts have no
        // reason to sum to the booking's totals (mirrors validateConfigureState's
        // PASSENGER_SUM_SUPPLIER_KINDS in lib/packages/apply-dialog-state.ts).
        if (!isTour) {
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
            const unitNoun = SUPPLIER_VOCABULARY[leg.supplierKind].unitNounPlural
            throw new Error(
              `${legLabel}: ${unitNoun} hold ${summed.adultCount} adults, ${summed.childCount} children, ` +
                `${summed.infantCount} infants but the booking is for ${totals.adultCount} adults, ` +
                `${totals.childCount} children, ${totals.infantCount} infants. Update the booking's ` +
                `travellers, or adjust the ${SUPPLIER_VOCABULARY[leg.supplierKind].unitNoun} split.`,
            )
          }
        }

        const isManualPricing = leg.pricingMode === "manual"

        // Price against the suite type, not each room's own configuration: multiple units booked
        // under the same suite type (e.g. 3 rooms of "Deluxe Double") combine into one line per
        // passenger type instead of splitting per room, even if their bed/bathroom setup differs.
        // Manual-pricing legs group by suite type *and* typed fare too -- two cabins of the same
        // class quoted at different fares (e.g. two separately-ticketed Business seats) must not
        // silently merge into one averaged line. A tour unit carrying a flat price override is
        // never merged with anything else, even another unit of the same type -- it prices as a
        // single line at the typed amount, not decomposed per passenger type (see below).
        const unitsBySuiteType = new Map<string, PackageUnitSelection[]>()
        let tourOverrideGroupCounter = 0
        for (const unitSelection of units) {
          const hasTourOverride =
            isTour && unitSelection.manualTourPrice !== null && unitSelection.manualTourPrice !== undefined
          const groupKey = hasTourOverride
            ? `tour-override::${tourOverrideGroupCounter++}`
            : isManualPricing
              ? [
                  unitSelection.suiteTypeId,
                  unitSelection.manualAdultPrice ?? "",
                  unitSelection.manualChildPrice ?? "",
                  unitSelection.manualInfantPrice ?? "",
                ].join("::")
              // Two tour units of the same type on different rate types price at different cards
              // and must not merge into one averaged line -- every other kind shares one rate type
              // per leg, so its units of the same suite type always belong in the same group.
              : isTour
                ? `${unitSelection.suiteTypeId}::${unitSelection.rateTypeId ?? ""}`
                : unitSelection.suiteTypeId
          const group = unitsBySuiteType.get(groupKey) ?? []
          group.push(unitSelection)
          unitsBySuiteType.set(groupKey, group)
        }

        for (const groupUnits of unitsBySuiteType.values()) {
          const suiteTypeId = groupUnits[0].suiteTypeId

          // A typed flat price replaces the whole tour unit's computed total (which would
          // otherwise split into separate adult/child/infant lines) -- same posture as the hotel
          // room override above, just without the per-night multiplication tours have no concept of.
          const tourOverridePrice =
            isTour &&
            groupUnits[0].manualTourPrice !== null &&
            groupUnits[0].manualTourPrice !== undefined
              ? groupUnits[0].manualTourPrice
              : null
          if (tourOverridePrice !== null) {
            const unitSelection = groupUnits[0]
            const { validRateCard, rateTypeInherited, description, suiteTypeName } =
              resolveOverriddenUnit(suiteTypeId, legPricingDate, unitSelection.rateTypeId)
            activeRateCard = validRateCard
            activeRateCardInherited = rateTypeInherited ?? false
            const overrideCurrency = validRateCard?.currency ?? selection.priceCurrency ?? targetCurrency
            addLineItem({
              description,
              qty: 1,
              unitPrice: tourOverridePrice,
              supplierDescription,
              suiteTypeId,
              suiteTypeName,
              unit,
              hideRoomConfig: true,
              sourceCurrency: overrideCurrency,
              tourOverride: {
                price: tourOverridePrice,
                basePrice: validRateCard?.pricePerPerson ?? null,
                setAt: unitSelection.manualTourPriceSetAt ?? null,
                setByName: unitSelection.manualTourPriceSetByName ?? null,
              },
            })
            continue
          }

          let description: string
          let suiteTypeName: string | null
          let passengerKinds: PassengerFare[]
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
            passengerKinds = manualFares({
              adult: groupUnits[0].manualAdultPrice ?? null,
              child: groupUnits[0].manualChildPrice ?? null,
              infant: groupUnits[0].manualInfantPrice ?? null,
            })
            lineSourceCurrency = selection.priceCurrency ?? targetCurrency
          } else {
            const resolved = resolveUnit(suiteTypeId, legPricingDate, groupUnits[0].rateTypeId)
            description = resolved.description
            suiteTypeName = resolved.suiteTypeName
            activeRateCard = resolved.validRateCard
            activeRateCardInherited = resolved.rateTypeInherited
            passengerKinds = rateCardFares(resolved.validRateCard)
            lineSourceCurrency = resolved.validRateCard.currency
          }

          for (const { key, label, kind: linePassengerKind, unitPrice } of passengerKinds) {
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
              // the per-seat price a passenger pays, with no notion of a solo room to bump. A tour
              // unit isn't a shared room either -- it's one traveller party's own booking of the
              // activity -- so a lone adult on a tour is a genuine 1-pax price, not a solo-room
              // surcharge case.
              const isSoloRoom =
                !isManualPricing &&
                !isTour &&
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
                  passengerKind: linePassengerKind,
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
  //
  // The type is per-leg, but the decision it carries is booking-level (see above), so every leg
  // the current UI sends carries an identical override. A caller that sent two different ones
  // used to have the second dropped with no signal at all — same request, different leg order,
  // different total. Duplicates of the same override are accepted; a genuine disagreement is
  // rejected rather than silently resolved by array order.
  const distinctOverrides = selections.reduce<{ type: CommissionKind; value: number }[]>((acc, s) => {
    if (!s.commissionOverride) return acc
    const alreadySeen = acc.some(
      (existing) => existing.type === s.commissionOverride!.type && existing.value === s.commissionOverride!.value,
    )
    return alreadySeen ? acc : [...acc, s.commissionOverride]
  }, [])
  if (distinctOverrides.length > 1) {
    throw new Error(
      "Selections disagree on the commission override — commission is applied once to the whole booking, not per leg.",
    )
  }
  const commissionOverride = distinctOverrides[0] ?? null
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
