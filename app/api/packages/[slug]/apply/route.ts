import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuthenticatedUser } from "../../../suppliers/helpers"
import { loadPackageDetail } from "../helpers"

const applyPackageSchema = z.object({
  jobId: z.string().uuid(),
  quoteId: z.string().uuid(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  selections: z.array(
    z.object({
      legId: z.string().uuid(),
      selected: z.boolean().default(true),
      routeId: z.string().uuid().optional(),
      suiteTypeId: z.string().uuid().optional(),
    }),
  ).default([]),
})

type ApplyPackageInput = z.infer<typeof applyPackageSchema>

interface TransportRequestRow {
  service_type: "transfer" | "rental"
  route_id: string | null
  suite_type_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  return_at: string | null
}

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase } = auth
  const { slug } = await params

  let parsed: ApplyPackageInput
  try {
    parsed = applyPackageSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existing = await loadPackageDetail(supabase, slug)
  if ("error" in existing) {
    return existing.error!
  }

  const { detail } = existing

  const { data: job, error: jobError } = await supabase
    .from("bookings")
    .select("id, no_of_adults, no_of_children, no_of_suites, child_ages, departure_date")
    .eq("id", parsed.jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  const { data: transportRequests } = await supabase
    .from("booking_transport_requests")
    .select("service_type, route_id, suite_type_id, pickup_point, dropoff_point, pickup_at, return_at")
    .eq("booking_id", parsed.jobId)
    .order("sort_order", { ascending: true })

  const selectionMap = new Map(parsed.selections.map((entry) => [entry.legId, entry]))

  const lineItems: Array<{ description: string; qty: number; unitPrice: number; total: number }> = []
  const childAges = job.child_ages ?? []
  const infantCount = childAges.filter((age) => age <= 2).length
  const childCount = Math.max(0, job.no_of_children - infantCount)

  function addLineItem(description: string, qty: number, unitPrice: number) {
    if (qty <= 0) return

    lineItems.push({
      description,
      qty,
      unitPrice,
      total: Math.round(unitPrice * qty * 100) / 100,
    })
  }

  function getLegSelection(leg: typeof detail.legs[number]) {
    const isOptional = leg.supplierKind === "hotel_property" || leg.supplierKind === "transfers"
    return selectionMap.get(leg.id) ?? { legId: leg.id, selected: !isOptional }
  }

  function getRequiredRouteId(
    leg: typeof detail.legs[number],
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
    leg: typeof detail.legs[number],
    routeId: string,
    suiteTypeId: string,
  ) {
    const travelDate = parsed.travelDate
    return leg.rateCards.find(
      (rc) =>
        rc.routeId === routeId &&
        rc.suiteTypeId === suiteTypeId &&
        rc.validFrom <= travelDate &&
        (rc.validTo === null || rc.validTo >= travelDate),
    )
  }

  function getRouteName(leg: typeof detail.legs[number], routeId: string) {
    return leg.routes.find((route) => route.id === routeId)?.name ?? null
  }

  function getSuiteTypeName(leg: typeof detail.legs[number], suiteTypeId: string) {
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
    if (!request?.pickup_at || !request.return_at) return 1

    const pickupAt = new Date(request.pickup_at)
    const returnAt = new Date(request.return_at)
    if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(returnAt.getTime())) return 1

    const durationMs = returnAt.getTime() - pickupAt.getTime()
    if (durationMs <= 0) return 1

    return Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)))
  }

  if (detail.fixedPricePerPerson !== null) {
    const pricePerLeg = detail.legs.length > 0
      ? detail.fixedPricePerPerson / detail.legs.length
      : detail.fixedPricePerPerson
    const travellerCount = job.no_of_adults + job.no_of_children

    for (const leg of detail.legs) {
      const selection = getLegSelection(leg)
      const isOptional = leg.supplierKind === "hotel_property" || leg.supplierKind === "transfers"
      if (isOptional && !selection.selected) {
        continue
      }
      const unitPrice = Math.round(pricePerLeg * 100) / 100
      addLineItem(leg.label ?? leg.supplierName, travellerCount, unitPrice)
    }
  } else {
    for (const leg of detail.legs) {
      const selection = getLegSelection(leg)
      const isHotel = leg.supplierKind === "hotel_property"
      const isTransfer = leg.supplierKind === "transfers"
      const isOptional = isHotel || isTransfer

      if (isOptional && !selection.selected) {
        continue
      }

      const routeId = getRequiredRouteId(leg, selection)
      if (!routeId) {
        return NextResponse.json(
          { error: `No ${isHotel ? "meal plan" : "route"} selected for leg: ${leg.label ?? leg.supplierName}` },
          { status: 400 },
        )
      }

      const routeBelongsToLeg = leg.routes.some((route) => route.id === routeId)
      if (!routeBelongsToLeg) {
        return NextResponse.json(
          { error: `Selected route is not available for leg: ${leg.label ?? leg.supplierName}` },
          { status: 400 },
        )
      }

      const suiteTypeId = selection.suiteTypeId
      if (!suiteTypeId) {
        return NextResponse.json(
          { error: `No ${isHotel ? "room type" : "suite type"} selected for leg: ${leg.label ?? leg.supplierName}` },
          { status: 400 },
        )
      }

      const suiteBelongsToLeg = leg.suiteTypes.some((suiteType) => suiteType.id === suiteTypeId)
      if (!suiteBelongsToLeg) {
        return NextResponse.json(
          { error: `Selected type is not available for leg: ${leg.label ?? leg.supplierName}` },
          { status: 400 },
        )
      }

      const validRateCard = getValidRateCard(leg, routeId, suiteTypeId)

      if (!validRateCard) {
        const legLabel = leg.label ?? leg.supplierName
        return NextResponse.json(
          {
            error: `No pricing available for "${legLabel}" on ${parsed.travelDate}. Update the package rate cards first.`,
          },
          { status: 400 },
        )
      }

      const legLabel = leg.label ?? leg.supplierName
      const routeName = getRouteName(leg, routeId)
      const suiteTypeName = getSuiteTypeName(leg, suiteTypeId)
      const descriptionParts = [legLabel, suiteTypeName, routeName].filter(Boolean)
      const description = descriptionParts.join(" - ")

      if (isHotel) {
        const nights = Math.max(1, detail.durationNights ?? 1)
        const qty = Math.max(1, job.no_of_suites) * nights
        addLineItem(description, qty, validRateCard.pricePerPerson)
      } else if (isTransfer) {
        const serviceType = leg.routes.find((route) => route.id === routeId)?.transportServiceType ?? "transfer"
        const transportRequest = findTransportRequest(serviceType, routeId, suiteTypeId)
        const pointLabel =
          transportRequest
            ? `${transportRequest.pickup_point} -> ${transportRequest.dropoff_point}`
            : null
        const transportDescription = [description, pointLabel].filter(Boolean).join(" - ")

        if (serviceType === "rental") {
          addLineItem(
            transportDescription,
            getBillableRentalDays(transportRequest),
            validRateCard.pricePerPerson,
          )
        } else {
          addLineItem(transportDescription, 1, validRateCard.pricePerPerson)
        }
      } else {
        addLineItem(`${description} - Adult`, job.no_of_adults, validRateCard.pricePerPerson)
        addLineItem(
          `${description} - Child`,
          childCount,
          validRateCard.childPrice ?? validRateCard.pricePerPerson,
        )
        addLineItem(
          `${description} - Infant`,
          infantCount,
          validRateCard.infantPrice ??
            validRateCard.childPrice ??
            validRateCard.pricePerPerson,
        )
      }
    }
  }

  return NextResponse.json({ lineItems })
}
