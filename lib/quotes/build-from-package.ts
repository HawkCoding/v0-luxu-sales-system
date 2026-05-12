import { isOptionalPackageLegKind } from "@/lib/types"
import type { PackageDetail, QuoteLineItem } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface PackageLegSelection {
  legId: string
  selected?: boolean
  routeId?: string
  suiteTypeId?: string
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

interface BuildPackageQuoteLineItemsInput {
  supabase: SupabaseClient<Database>
  packageDetail: PackageDetail
  jobId: string
  travelDate: string
  selections?: PackageLegSelection[]
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

  const selectionMap = new Map(selections.map((entry) => [entry.legId, entry]))
  const lineItems: QuoteLineItem[] = []
  const childAges = job.child_ages ?? []
  const infantCount = childAges.filter((age) => age <= 2).length
  const childCount = Math.max(0, job.no_of_children - infantCount)

  function addLineItem(description: string, qty: number, unitPrice: number, supplierDescription?: string | null) {
    if (qty <= 0) return

    lineItems.push({
      description,
      supplierDescription: supplierDescription ?? null,
      qty,
      unitPrice,
      total: Math.round(unitPrice * qty * 100) / 100,
    })
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
  ) {
    return leg.rateCards.find(
      (rc) =>
        rc.routeId === routeId &&
        rc.suiteTypeId === suiteTypeId &&
        rc.validFrom <= travelDate &&
        (rc.validTo === null || rc.validTo >= travelDate),
    )
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

    addLineItem(
      `${packageDetail.name} — Package Total`,
      travellerCount,
      packageDetail.fixedPricePerPerson,
    )
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

      const validRateCard = getValidRateCard(leg, routeId, suiteTypeId)
      if (!validRateCard) {
        const legLabel = leg.label ?? leg.supplierName
        throw new Error(`No pricing available for "${legLabel}" on ${travelDate}. Update the package rate cards first.`)
      }

      const legLabel = leg.label ?? leg.supplierName
      const routeName = getRouteName(leg, routeId)
      const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
      const descriptionParts = [legLabel, suiteTypeName, routeName].filter(Boolean)
      const description = descriptionParts.join(" - ")
      const supplierDescription = leg.supplierDescription ?? null

      if (isHotel) {
        const nights = Math.max(1, packageDetail.durationNights ?? 1)
        const qty = Math.max(1, job.no_of_suites) * nights
        addLineItem(description, qty, validRateCard.pricePerPerson, supplierDescription)
      } else if (isTransfer || isVehicleRental) {
        const serviceType = isVehicleRental ? "rental" : "transfer"
        const transportRequest = findTransportRequest(serviceType, routeId, suiteTypeId)
        const pointLabel =
          transportRequest
            ? `${transportRequest.pickup_point} -> ${transportRequest.dropoff_point}`
            : null
        const transportDescription = [description, pointLabel].filter(Boolean).join(" - ")

        if (isVehicleRental) {
          addLineItem(
            transportDescription,
            getBillableRentalDays(transportRequest),
            validRateCard.pricePerPerson,
            supplierDescription,
          )
        } else {
          addLineItem(transportDescription, 1, validRateCard.pricePerPerson, supplierDescription)
        }
      } else {
        addLineItem(`${description} - Adult`, job.no_of_adults, validRateCard.pricePerPerson, supplierDescription)
        addLineItem(
          `${description} - Child`,
          childCount,
          validRateCard.childPrice ?? validRateCard.pricePerPerson,
          supplierDescription,
        )
        addLineItem(
          `${description} - Infant`,
          infantCount,
          validRateCard.infantPrice ??
            validRateCard.childPrice ??
            validRateCard.pricePerPerson,
          supplierDescription,
        )
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
