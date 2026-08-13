import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type {
  CommissionBreakdown,
  CommissionKind,
  PricingSnapshot,
  QuoteLineItem,
  ResolvedCommission,
  SupplierKind,
} from "@/lib/types"
import { isTypePricedSupplier } from "@/lib/types"
import { fetchDefaultAgeBuckets, resolveAgeBuckets } from "@/lib/pricing/age-buckets"
import { projectPassengerTotals } from "@/lib/packages/passenger-totals"
import { isRateCardValidOn, selectRateCard } from "@/lib/rate-cards/resolve"
import { loadSupplierRateTiersResolver } from "@/lib/rate-types/load-supplier-rate-tiers"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "@/lib/pricing/commission"
import { convertAmount, type FxRateMap } from "@/lib/pricing/convert-currency"
import { BASE_CURRENCY, normaliseCurrency } from "@/lib/money"

export interface ExtraLineSelection {
  supplierId: string
  routeId: string
  suiteTypeId: string
  /** Hotel nights or rental days; defaults to 1. Ignored for transfers and pax-based legs. */
  quantity?: number
  rateTypeId?: string | null
  commissionOverride?: { type: CommissionKind; value: number } | null
}

export interface PriceExtraLineItemsInput extends ExtraLineSelection {
  supabase: SupabaseClient<Database>
  jobId: string
  travelDate: string
  fallbackRateTypeId?: string | null
  /** The currency the quote is denominated in; a rate card in anything else converts into it. */
  quoteCurrency?: string
  fxRates?: FxRateMap
  fxRateAsOf?: string | null
}

async function loadVariantGroups(
  supabase: SupabaseClient<Database>,
  suiteTypeId: string,
): Promise<{ label: string; values: string[] }[]> {
  const [bedroomTypes, bedroomLayouts, bathroomTypes] = await Promise.all([
    supabase
      .from("suite_type_bedroom_types")
      .select("bedroom_types(name, sort_order)")
      .eq("suite_type_id", suiteTypeId),
    supabase
      .from("suite_type_bedroom_layouts")
      .select("bedroom_layouts(name, sort_order)")
      .eq("suite_type_id", suiteTypeId),
    supabase
      .from("suite_type_bathroom_types")
      .select("bathroom_types(name, sort_order)")
      .eq("suite_type_id", suiteTypeId),
  ])

  function names<TKey extends string>(rows: unknown[] | null | undefined, key: TKey): string[] {
    return (rows ?? [])
      .map((row) => (row as Record<TKey, { name: string; sort_order: number } | null>)[key])
      .filter((value): value is { name: string; sort_order: number } => Boolean(value?.name))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((value) => value.name)
  }

  const groups: { label: string; values: string[] }[] = []
  const bedroom = names(bedroomTypes.data, "bedroom_types")
  if (bedroom.length > 0) groups.push({ label: "Bedroom Type", values: bedroom })
  const layout = names(bedroomLayouts.data, "bedroom_layouts")
  if (layout.length > 0) groups.push({ label: "Bedroom Layout", values: layout })
  const bathroom = names(bathroomTypes.data, "bathroom_types")
  if (bathroom.length > 0) groups.push({ label: "Bathroom Type", values: bathroom })
  return groups
}

/**
 * Prices a single ad-hoc supplier selection (an "extra" not part of a package) into one or
 * more quote line items, reusing the same commission and age-bucket primitives as the package
 * pricing engine so totals stay consistent. Every produced line carries a pricing snapshot
 * flagged `isExtra: true` so it can be preserved when a package is (re-)applied.
 */
export async function priceExtraLineItems(
  input: PriceExtraLineItemsInput,
): Promise<{ lineItems: QuoteLineItem[] }> {
  const {
    supabase,
    jobId,
    travelDate,
    supplierId,
    routeId,
    suiteTypeId,
    quantity,
    rateTypeId = null,
    fallbackRateTypeId = null,
    commissionOverride = null,
    quoteCurrency = BASE_CURRENCY,
    fxRates = { [BASE_CURRENCY]: 1 },
    fxRateAsOf = null,
  } = input

  const targetCurrency = normaliseCurrency(quoteCurrency)

  const { data: job, error: jobError } = await supabase
    .from("bookings")
    .select("no_of_adults, no_of_children, no_of_suites, child_ages")
    .eq("id", jobId)
    .single()
  if (jobError || !job) throw new Error("Job not found")

  const [{ data: supplier, error: supplierError }, resolveSupplierRateTiers, { data: rateTypeRows }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name, kind, infant_max_age, child_max_age, base_rate_type_id, quote_rate_type_id")
        .eq("id", supplierId)
        .single(),
      loadSupplierRateTiersResolver(supabase),
      // Names the chosen rate type in errors, and stamps code/name into the snapshot so an extra
      // line carries the same rate-type provenance a package line does.
      supabase.from("rate_types").select("id, code, name"),
    ])
  if (supplierError || !supplier) throw new Error("Supplier not found")

  const rateTypeMetaById = new Map((rateTypeRows ?? []).map((row) => [row.id, row]))
  const rateTypeLabel = (id: string) => rateTypeMetaById.get(id)?.name ?? id

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id, name, supplier_id, direction_mode")
    .eq("id", routeId)
    .single()
  if (routeError || !route) throw new Error("Route not found")
  if (route.supplier_id !== supplierId) throw new Error("Route does not belong to this supplier")

  const { data: suiteType, error: suiteTypeError } = await supabase
    .from("suite_types")
    .select("id, name, supplier_id")
    .eq("id", suiteTypeId)
    .single()
  if (suiteTypeError || !suiteType) throw new Error("Type not found")
  if (suiteType.supplier_id !== supplierId) throw new Error("Type does not belong to this supplier")

  // A tour operator prices the type across every itinerary, so its cards carry no route id —
  // match those as well as cards written against this route (see lib/rate-cards/resolve.ts).
  const { data: rateCards } = await supabase
    .from("rate_cards")
    .select("id, rate_type_id, price_per_person, child_price, infant_price, currency, valid_from, valid_to")
    .or(`route_id.eq.${routeId},route_id.is.null`)
    .eq("suite_type_id", suiteTypeId)
    .order("valid_from", { ascending: true })

  const validCards = (rateCards ?? []).filter((card) =>
    isRateCardValidOn({ validFrom: card.valid_from, validTo: card.valid_to }, travelDate),
  )
  // Naming the itinerary in a tour operator's error would send the user hunting for a price that
  // was never keyed to it.
  const where = isTypePricedSupplier(supplier.kind)
    ? `"${suiteType.name}" (${supplier.name})`
    : `"${suiteType.name}" on "${route.name}" (${supplier.name})`

  if (validCards.length === 0) {
    // The query above is already scoped to this route + type, so a non-empty `rateCards` means
    // cards exist and the date is what missed — otherwise the pair was never priced at all.
    throw new Error(
      (rateCards ?? []).length > 0
        ? `No rate card covers ${travelDate} for ${where}. Extend the validity period or add a new one.`
        : `No rate card for ${where}. Add one under Suppliers → ${supplier.name} → rate cards.`,
    )
  }
  // Same precedence the package builder uses -- routed through selectRateCard so the two can't drift.
  const rateTiers = resolveSupplierRateTiers({
    baseRateTypeId: supplier.base_rate_type_id ?? null,
    quoteRateTypeId: supplier.quote_rate_type_id ?? null,
  })
  const selected = selectRateCard(
    validCards.map((candidate) => ({
      ...candidate,
      routeId,
      suiteTypeId,
      rateTypeId: candidate.rate_type_id,
      validFrom: candidate.valid_from,
      validTo: candidate.valid_to,
    })),
    rateTypeId,
    rateTiers.quoteRateTypeId,
    rateTiers.baseRateTypeId,
    fallbackRateTypeId,
  )
  if (!selected) {
    throw new Error(`No rate card covers ${travelDate} for ${where}.`)
  }
  if (!selected.ok) {
    // Cards exist on this date, just not for the requested rate type. Pricing off a different
    // rate's card would quote a price nobody chose, so this fails instead.
    const label = rateTypeLabel(selected.requestedRateTypeId)
    throw new Error(
      (rateCards ?? []).some((c) => c.rate_type_id === selected.requestedRateTypeId)
        ? `No "${label}" rate covers ${travelDate} for ${where}. Extend that rate's validity period or add a rate card.`
        : `"${label}" has no rate card for ${where}. Add one under Suppliers → ${supplier.name} → rate cards.`,
    )
  }
  const card = selected.card
  const rateTypeInherited = selected.inherited

  const variantGroups = await loadVariantGroups(supabase, suiteTypeId)
  const variantSuffix =
    variantGroups.length > 0 ? ` — ${variantGroups.flatMap((group) => group.values).join(", ")}` : ""

  const commission = resolveCommission({ lineOverride: commissionOverride })

  const defaults = await fetchDefaultAgeBuckets(supabase)
  const buckets = resolveAgeBuckets(defaults, {
    infantMaxAge: supplier.infant_max_age ?? null,
    childMaxAge: supplier.child_max_age ?? null,
  })
  const childAges: number[] = job.child_ages ?? []
  const { adultCount, childCount, infantCount } = projectPassengerTotals(
    { noOfAdults: job.no_of_adults, noOfChildren: job.no_of_children, childAges },
    buckets,
  )

  // Re-bind to non-null locals so the addLine closure keeps the narrowing.
  const supplierRow = supplier
  const routeRow = route
  const suiteRow = suiteType
  const kind = supplierRow.kind as SupplierKind
  const description = [supplierRow.name, suiteRow.name, routeRow.name].filter(Boolean).join(" - ")
  const lineItems: QuoteLineItem[] = []

  const cardCurrency = normaliseCurrency(card.currency)
  const wasConverted = cardCurrency !== targetCurrency

  function addLine(
    lineDescription: string,
    qty: number,
    sourceUnitPrice: number,
    passengerKind: PricingSnapshot["passengerKind"],
  ) {
    if (qty <= 0) return
    // Convert before the line subtotal and its commission, so both are already in the quote's
    // currency -- same ordering the package pricing engine uses.
    const converted = convertAmount(sourceUnitPrice, cardCurrency, targetCurrency, fxRates)
    const unitPrice = converted.amount
    const lineSubtotal = Math.round(unitPrice * qty * 100) / 100

    let commissionBreakdown: CommissionBreakdown | null = null
    let commissionAmount = 0
    const resolved: ResolvedCommission = commission
    if (resolved.type !== null) {
      commissionAmount = calculateCommissionAmount({
        amountAfterMarkup: lineSubtotal,
        passengerCount: qty,
        resolved,
      })
      commissionBreakdown = buildCommissionBreakdown(resolved, commissionAmount)
    }
    const total = Math.round((lineSubtotal + commissionAmount) * 100) / 100

    lineItems.push({
      description: `${lineDescription}${variantSuffix}`,
      supplierDescription: supplierRow.name,
      qty,
      unitPrice,
      total,
      pricingSnapshot: {
        source: "pricing_engine",
        pricingMode: "rate_card",
        packageId: "",
        packageName: "",
        legId: null,
        legLabel: null,
        supplierId: supplierRow.id,
        supplierName: supplierRow.name,
        supplierKind: kind,
        routeId: routeRow.id,
        routeName: routeRow.name,
        suiteTypeId: suiteRow.id,
        suiteTypeName: suiteRow.name,
        rateCardId: card.id,
        rateTypeId: card.rate_type_id,
        rateTypeCode: rateTypeMetaById.get(card.rate_type_id)?.code ?? null,
        rateTypeName: rateTypeMetaById.get(card.rate_type_id)?.name ?? null,
        rateTypeInherited,
        travelDate,
        passengerKind,
        baseUnitPrice: unitPrice,
        markupPct: 0,
        singleSupplementPct: null,
        sourceCurrency: wasConverted ? cardCurrency : null,
        sourceUnitPrice: wasConverted ? sourceUnitPrice : null,
        fxRate: wasConverted ? converted.rate : null,
        fxRateAsOf: wasConverted ? fxRateAsOf : null,
        serviceType: kind === "transfers" ? "transfer" : kind === "vehicle_rental" ? "rental" : null,
        suiteVariants: variantGroups.length > 0 ? variantGroups : undefined,
        commission: commissionBreakdown,
        isExtra: true,
      },
    })
  }

  const unit = card.price_per_person
  if (kind === "hotel_property") {
    const nights = Math.max(1, quantity ?? 1)
    addLine(description, Math.max(1, job.no_of_suites) * nights, unit, "included")
  } else if (kind === "transfers") {
    addLine(description, 1, unit, "service")
  } else if (kind === "vehicle_rental") {
    addLine(description, Math.max(1, quantity ?? 1), unit, "service")
  } else {
    addLine(`${description} - Adult`, adultCount, unit, "adult")
    addLine(`${description} - Child`, childCount, card.child_price ?? unit, "child")
    addLine(
      `${description} - Infant`,
      infantCount,
      card.infant_price ?? card.child_price ?? unit,
      "infant",
    )
  }

  return { lineItems }
}
