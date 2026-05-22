import {
  isOptionalPackageLegKind,
  type CommissionBreakdown,
  type PackageDetail,
  type QuoteLineItem,
  type ResolvedCommission,
  type RouteDirection,
  type RouteDirectionMode,
  type SupplierKind,
} from "@/lib/types"
import { buildCommissionBreakdown, calculateCommissionAmount } from "@/lib/pricing/commission"

export interface PackageLegSelection {
  legId: string
  selected?: boolean
  routeId?: string
  suiteTypeId?: string
  rateTypeId?: string
  direction?: RouteDirection
}

function getDirectionMultiplier(directionMode: RouteDirectionMode, direction: RouteDirection): number {
  if (directionMode !== "round_trip") return 1
  return direction === "round_trip" ? 2 : 1
}

function defaultDirectionFor(directionMode: RouteDirectionMode): RouteDirection {
  return directionMode === "round_trip" ? "round_trip" : "outbound"
}

export interface PricingBookingInput {
  noOfAdults: number
  noOfChildren: number
  noOfSuites: number
  childAges: number[] | null
}

export interface PricingAgeBuckets {
  infantMax: number
  childMax: number
}

export interface PricingTransportRequest {
  serviceType: "transfer" | "rental"
  routeId: string | null
  suiteTypeId: string | null
  pickupPoint: string
  dropoffPoint: string
  pickupAt: string | null
  rentalDetails?: { returnAt: string | null } | { returnAt: string | null }[] | null
}

export interface CommissionResolverContext {
  supplierId: string | null
  routeId: string | null
  legId: string
}

export type CommissionResolver = (
  context: CommissionResolverContext,
) => ResolvedCommission | null

interface BuildPackagePricingInput {
  packageDetail: PackageDetail
  booking: PricingBookingInput
  travelDate: string
  selections?: PackageLegSelection[]
  transportRequests?: PricingTransportRequest[]
  ageBuckets?: PricingAgeBuckets
  commissionResolver?: CommissionResolver
}

const DEFAULT_AGE_BUCKETS: PricingAgeBuckets = { infantMax: 2, childMax: 12 }

type PassengerKind = "adult" | "child" | "infant" | "single_supplement" | "service" | "included"
type PricingMode = "rate_card" | "fixed_package"

interface SnapshotInput {
  packageDetail: PackageDetail
  leg?: PackageDetail["legs"][number]
  routeId?: string | null
  routeName?: string | null
  suiteTypeId?: string | null
  suiteTypeName?: string | null
  rateCardId?: string | null
  rateTypeId?: string | null
  travelDate: string
  passengerKind: PassengerKind
  pricingMode: PricingMode
  baseUnitPrice: number
  markupPct: number
  singleSupplementPct?: number | null
  serviceType?: "transfer" | "rental" | null
  directionMode?: RouteDirectionMode | null
  direction?: RouteDirection | null
  markupAmount?: number | null
  commission?: CommissionBreakdown | null
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function applyMarkup(value: number, markupPct: number): number {
  return roundMoney(value * (1 + markupPct / 100))
}

export function calculateQuoteTotals(lineItems: QuoteLineItem[]) {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0))
  const vat = roundMoney(subtotal * 0.15)
  const total = roundMoney(subtotal + vat)

  return { subtotal, vat, total }
}

export function inferSingleAdultCount(booking: PricingBookingInput): number {
  const totalTravellers = booking.noOfAdults + booking.noOfChildren
  return Math.min(booking.noOfAdults, Math.max(0, booking.noOfSuites * 2 - totalTravellers))
}

function snapshot({
  packageDetail,
  leg,
  routeId,
  routeName,
  suiteTypeId,
  suiteTypeName,
  rateCardId,
  rateTypeId = null,
  travelDate,
  passengerKind,
  pricingMode,
  baseUnitPrice,
  markupPct,
  singleSupplementPct = null,
  serviceType = null,
  directionMode = null,
  direction = null,
  markupAmount = null,
  commission = null,
}: SnapshotInput): NonNullable<QuoteLineItem["pricingSnapshot"]> {
  return {
    source: "pricing_engine",
    pricingMode,
    packageId: packageDetail.id,
    packageName: packageDetail.name,
    legId: leg?.id ?? null,
    legLabel: leg?.label ?? leg?.supplierName ?? null,
    supplierId: leg?.supplierId ?? null,
    supplierName: leg?.supplierName ?? null,
    supplierKind: leg?.supplierKind ?? null,
    routeId: routeId ?? null,
    routeName: routeName ?? null,
    suiteTypeId: suiteTypeId ?? null,
    suiteTypeName: suiteTypeName ?? null,
    rateCardId: rateCardId ?? null,
    rateTypeId: rateTypeId ?? null,
    travelDate,
    passengerKind,
    baseUnitPrice: roundMoney(baseUnitPrice),
    markupPct,
    singleSupplementPct,
    serviceType,
    directionMode,
    direction,
    markupAmount,
    commission,
  }
}

function getRouteName(leg: PackageDetail["legs"][number], routeId: string): string | null {
  return leg.routes.find((route) => route.id === routeId)?.name ?? null
}

function getSuiteTypeName(leg: PackageDetail["legs"][number], suiteTypeId: string): string | null {
  return leg.suiteTypes.find((suiteType) => suiteType.id === suiteTypeId)?.name ?? null
}

function getRequiredRouteId(
  leg: PackageDetail["legs"][number],
  selection: { routeId?: string },
): string | null {
  if (selection.routeId) return selection.routeId
  if (leg.routes.length === 1) return leg.routes[0].id
  return null
}

function getValidRateCard(
  leg: PackageDetail["legs"][number],
  routeId: string,
  suiteTypeId: string,
  travelDate: string,
  rateTypeId?: string | null,
) {
  return leg.rateCards.find(
    (rateCard) =>
      rateCard.routeId === routeId &&
      rateCard.suiteTypeId === suiteTypeId &&
      (!rateTypeId || rateCard.rateTypeId === rateTypeId) &&
      rateCard.validFrom <= travelDate &&
      (rateCard.validTo === null || rateCard.validTo >= travelDate),
  )
}

function getLegSelection(
  leg: PackageDetail["legs"][number],
  selectionMap: Map<string, PackageLegSelection>,
): PackageLegSelection {
  const isOptional = isOptionalPackageLegKind(leg.supplierKind)
  return selectionMap.get(leg.id) ?? { legId: leg.id, selected: !isOptional }
}

function getBillableRentalDays(request: PricingTransportRequest | null): number {
  const rentalDetails = Array.isArray(request?.rentalDetails)
    ? request?.rentalDetails[0]
    : request?.rentalDetails
  if (!request?.pickupAt || !rentalDetails?.returnAt) return 1

  const pickupAt = new Date(request.pickupAt)
  const returnAt = new Date(rentalDetails.returnAt)
  if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(returnAt.getTime())) return 1

  const durationMs = returnAt.getTime() - pickupAt.getTime()
  if (durationMs <= 0) return 1

  return Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)))
}

function findTransportRequest(
  requests: PricingTransportRequest[],
  serviceType: "transfer" | "rental",
  routeId: string,
  suiteTypeId: string,
): PricingTransportRequest | null {
  return (
    requests.find(
      (request) =>
        request.serviceType === serviceType &&
        (request.routeId === routeId || request.suiteTypeId === suiteTypeId),
    ) ?? null
  )
}

function isSupplementableKind(kind: SupplierKind): boolean {
  return kind === "train_operator" || kind === "tour_operator" || kind === "airline"
}

export function buildPackagePricing({
  packageDetail,
  booking,
  travelDate,
  selections = [],
  transportRequests = [],
  ageBuckets = DEFAULT_AGE_BUCKETS,
  commissionResolver,
}: BuildPackagePricingInput): QuoteLineItem[] {
  const selectionMap = new Map(selections.map((entry) => [entry.legId, entry]))
  const lineItems: QuoteLineItem[] = []
  const childAges = booking.childAges ?? []
  const infantCount = childAges.filter((age) => age <= ageBuckets.infantMax).length
  const childCount = Math.max(0, booking.noOfChildren - infantCount)
  const singleAdultCount = inferSingleAdultCount(booking)
  const markupPct = packageDetail.markupPct ?? 0

  function addLineItem(
    description: string,
    qty: number,
    baseUnitPrice: number,
    snapshotInput: Omit<SnapshotInput, "packageDetail" | "travelDate" | "baseUnitPrice" | "markupPct">,
    supplierDescription?: string | null,
  ) {
    if (qty <= 0) return

    const unitPrice = applyMarkup(baseUnitPrice, markupPct)
    const lineSubtotal = roundMoney(unitPrice * qty)
    const markupAmount = roundMoney((unitPrice - baseUnitPrice) * qty)

    let commission: CommissionBreakdown | null = null
    let commissionAmount = 0
    if (commissionResolver && snapshotInput.leg) {
      const resolved = commissionResolver({
        supplierId: snapshotInput.leg.supplierId ?? null,
        routeId: snapshotInput.routeId ?? null,
        legId: snapshotInput.leg.id,
      })
      if (resolved && resolved.type !== null) {
        commissionAmount = calculateCommissionAmount({
          amountAfterMarkup: lineSubtotal,
          passengerCount: qty,
          resolved,
        })
        commission = buildCommissionBreakdown(resolved, commissionAmount)
      }
    }

    const total = roundMoney(lineSubtotal + commissionAmount)
    lineItems.push({
      description,
      supplierDescription: supplierDescription ?? null,
      qty,
      unitPrice,
      total,
      pricingSnapshot: snapshot({
        ...snapshotInput,
        packageDetail,
        travelDate,
        baseUnitPrice,
        markupPct,
        markupAmount,
        commission,
      }),
    })
  }

  if (packageDetail.fixedPricePerPerson !== null) {
    const travellerCount = booking.noOfAdults + booking.noOfChildren

    for (const leg of packageDetail.legs) {
      const selection = getLegSelection(leg, selectionMap)
      const isOptional = isOptionalPackageLegKind(leg.supplierKind)
      if (isOptional && !selection.selected) continue

      addLineItem(
        leg.label ?? leg.supplierName,
        travellerCount > 0 ? 1 : 0,
        0,
        {
          leg,
          passengerKind: "included",
          pricingMode: "fixed_package",
        },
        leg.supplierDescription,
      )
    }

    addLineItem(
      `${packageDetail.name} - Package Total`,
      travellerCount,
      packageDetail.fixedPricePerPerson,
      {
        passengerKind: "service",
        pricingMode: "fixed_package",
      },
    )

    if (singleAdultCount > 0 && packageDetail.singleSupplementPct > 0) {
      addLineItem(
        `${packageDetail.name} - Single supplement`,
        singleAdultCount,
        packageDetail.fixedPricePerPerson * (packageDetail.singleSupplementPct / 100),
        {
          passengerKind: "single_supplement",
          pricingMode: "fixed_package",
          singleSupplementPct: packageDetail.singleSupplementPct,
        },
      )
    }

    return lineItems
  }

  for (const leg of packageDetail.legs) {
    const selection = getLegSelection(leg, selectionMap)
    const isHotel = leg.supplierKind === "hotel_property"
    const isTransfer = leg.supplierKind === "transfers"
    const isVehicleRental = leg.supplierKind === "vehicle_rental"
    const isOptional = isOptionalPackageLegKind(leg.supplierKind)

    if (isOptional && !selection.selected) continue

    const routeId = getRequiredRouteId(leg, selection)
    if (!routeId) {
      throw new Error(`No ${isHotel ? "meal plan" : "route"} selected for leg: ${leg.label ?? leg.supplierName}`)
    }

    if (!leg.routes.some((route) => route.id === routeId)) {
      throw new Error(`Selected route is not available for leg: ${leg.label ?? leg.supplierName}`)
    }

    const suiteTypeId = selection.suiteTypeId
    if (!suiteTypeId) {
      throw new Error(`No ${isHotel ? "room type" : "suite type"} selected for leg: ${leg.label ?? leg.supplierName}`)
    }

    if (!leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)) {
      throw new Error(`Selected type is not available for leg: ${leg.label ?? leg.supplierName}`)
    }

    const validRateCard = getValidRateCard(leg, routeId, suiteTypeId, travelDate, selection.rateTypeId)
    if (!validRateCard) {
      const legLabel = leg.label ?? leg.supplierName
      throw new Error(`No pricing available for "${legLabel}" on ${travelDate}. Update the package rate cards first.`)
    }

    const legLabel = leg.label ?? leg.supplierName
    const routeName = getRouteName(leg, routeId)
    const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
    const routeMeta = leg.routes.find((route) => route.id === routeId) ?? null
    const directionMode: RouteDirectionMode = routeMeta?.directionMode ?? "one_way"
    const direction: RouteDirection = selection.direction ?? defaultDirectionFor(directionMode)
    const directionMultiplier = getDirectionMultiplier(directionMode, direction)
    const descriptionParts = [legLabel, suiteTypeName, routeName].filter(Boolean)
    const description = descriptionParts.join(" - ")
    const snapshotBase = {
      leg,
      routeId,
      routeName,
      suiteTypeId,
      suiteTypeName,
      rateCardId: validRateCard.id,
      rateTypeId: validRateCard.rateTypeId,
      pricingMode: "rate_card" as const,
      directionMode,
      direction,
    }

    if (isHotel) {
      const nights = Math.max(1, packageDetail.durationNights ?? 1)
      const qty = Math.max(1, booking.noOfSuites) * nights
      addLineItem(
        description,
        qty,
        validRateCard.pricePerPerson,
        { ...snapshotBase, passengerKind: "service" },
        leg.supplierDescription,
      )
    } else if (isTransfer || isVehicleRental) {
      const serviceType = isVehicleRental ? "rental" : "transfer"
      const transportRequest = findTransportRequest(transportRequests, serviceType, routeId, suiteTypeId)
      const pointLabel = transportRequest
        ? `${transportRequest.pickupPoint} -> ${transportRequest.dropoffPoint}`
        : null
      const transportDescription = [description, pointLabel].filter(Boolean).join(" - ")
      const qty = isVehicleRental ? getBillableRentalDays(transportRequest) : 1

      addLineItem(
        transportDescription,
        qty,
        validRateCard.pricePerPerson,
        { ...snapshotBase, passengerKind: "service", serviceType },
        leg.supplierDescription,
      )
    } else {
      const adultBase = validRateCard.pricePerPerson * directionMultiplier
      const childBase = (validRateCard.childPrice ?? validRateCard.pricePerPerson) * directionMultiplier
      const infantBase =
        (validRateCard.infantPrice ?? validRateCard.childPrice ?? validRateCard.pricePerPerson) * directionMultiplier
      addLineItem(
        `${description} - Adult`,
        booking.noOfAdults,
        adultBase,
        { ...snapshotBase, passengerKind: "adult" },
        leg.supplierDescription,
      )
      addLineItem(
        `${description} - Child`,
        childCount,
        childBase,
        { ...snapshotBase, passengerKind: "child" },
        leg.supplierDescription,
      )
      addLineItem(
        `${description} - Infant`,
        infantCount,
        infantBase,
        { ...snapshotBase, passengerKind: "infant" },
        leg.supplierDescription,
      )

      if (isSupplementableKind(leg.supplierKind) && singleAdultCount > 0 && packageDetail.singleSupplementPct > 0) {
        addLineItem(
          `${description} - Single supplement`,
          singleAdultCount,
          adultBase * (packageDetail.singleSupplementPct / 100),
          {
            ...snapshotBase,
            passengerKind: "single_supplement",
            singleSupplementPct: packageDetail.singleSupplementPct,
          },
          leg.supplierDescription,
        )
      }
    }
  }

  return lineItems
}

export function isPricingEngineLineItem(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.source === "pricing_engine"
}
