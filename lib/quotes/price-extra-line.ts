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
import { fetchDefaultAgeBuckets, resolveAgeBuckets } from "@/lib/pricing/age-buckets"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "@/lib/pricing/commission"

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
  } = input

  const { data: job, error: jobError } = await supabase
    .from("bookings")
    .select("no_of_adults, no_of_children, no_of_suites, child_ages")
    .eq("id", jobId)
    .single()
  if (jobError || !job) throw new Error("Job not found")

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id, name, kind, infant_max_age, child_max_age")
    .eq("id", supplierId)
    .single()
  if (supplierError || !supplier) throw new Error("Supplier not found")

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

  const { data: rateCards } = await supabase
    .from("rate_cards")
    .select("id, rate_type_id, price_per_person, child_price, infant_price, valid_from, valid_to")
    .eq("route_id", routeId)
    .eq("suite_type_id", suiteTypeId)
    .order("valid_from", { ascending: true })

  const validCards = (rateCards ?? []).filter(
    (card) => card.valid_from <= travelDate && (card.valid_to === null || card.valid_to >= travelDate),
  )
  if (validCards.length === 0) {
    throw new Error(`No pricing available for "${supplier.name}" on ${travelDate}. Add a rate card first.`)
  }
  const chosen = rateTypeId ?? null
  const byRateType = (id: string | null) => (id ? validCards.find((card) => card.rate_type_id === id) : undefined)
  const card = byRateType(chosen) ?? byRateType(fallbackRateTypeId) ?? validCards[0]

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
  const infantCount = childAges.filter((age) => age <= buckets.infantMax).length
  const adultPromoted = childAges.filter((age) => age > buckets.childMax).length
  const childCount = Math.max(0, job.no_of_children - infantCount - adultPromoted)
  const adultCount = job.no_of_adults + adultPromoted

  // Re-bind to non-null locals so the addLine closure keeps the narrowing.
  const supplierRow = supplier
  const routeRow = route
  const suiteRow = suiteType
  const kind = supplierRow.kind as SupplierKind
  const description = [supplierRow.name, suiteRow.name, routeRow.name].filter(Boolean).join(" - ")
  const lineItems: QuoteLineItem[] = []

  function addLine(
    lineDescription: string,
    qty: number,
    unitPrice: number,
    passengerKind: PricingSnapshot["passengerKind"],
  ) {
    if (qty <= 0) return
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
        travelDate,
        passengerKind,
        baseUnitPrice: unitPrice,
        markupPct: 0,
        singleSupplementPct: null,
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
