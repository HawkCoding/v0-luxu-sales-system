import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuthenticatedUser } from "../../../suppliers/helpers"
import { loadPackageDetail } from "../helpers"

const applyPackageSchema = z.object({
  jobId: z.string().uuid(),
  quoteId: z.string().uuid(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  legSuiteTypes: z.array(
    z.object({
      legId: z.string().uuid(),
      suiteTypeId: z.string().uuid(),
    }),
  ),
})

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

  let parsed
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
    .select("id, no_of_adults, no_of_children, child_ages, departure_date")
    .eq("id", parsed.jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  const suiteTypeMap = new Map(
    parsed.legSuiteTypes.map((entry) => [entry.legId, entry.suiteTypeId]),
  )

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

  if (detail.fixedPricePerPerson !== null) {
    const pricePerLeg = detail.legs.length > 0
      ? detail.fixedPricePerPerson / detail.legs.length
      : detail.fixedPricePerPerson
    const travellerCount = job.no_of_adults + job.no_of_children

    for (const leg of detail.legs) {
      const unitPrice = Math.round(pricePerLeg * 100) / 100
      addLineItem(leg.label ?? leg.supplierName, travellerCount, unitPrice)
    }
  } else {
    for (const leg of detail.legs) {
      const suiteTypeId = suiteTypeMap.get(leg.id)
      if (!suiteTypeId) {
        return NextResponse.json(
          { error: `No suite type selected for leg: ${leg.label ?? leg.supplierName}` },
          { status: 400 },
        )
      }

      const travelDate = parsed.travelDate
      const validRateCard = leg.rateCards.find(
        (rc) =>
          rc.suiteTypeId === suiteTypeId &&
          rc.validFrom <= travelDate &&
          (rc.validTo === null || rc.validTo >= travelDate),
      )

      if (!validRateCard) {
        const legLabel = leg.label ?? leg.supplierName
        return NextResponse.json(
          {
            error: `No pricing available for "${legLabel}" on ${travelDate}. Update the package rate cards first.`,
          },
          { status: 400 },
        )
      }

      const legLabel = leg.label ?? leg.supplierName
      addLineItem(`${legLabel} - Adult`, job.no_of_adults, validRateCard.pricePerPerson)
      addLineItem(
        `${legLabel} - Child`,
        childCount,
        validRateCard.childPrice ?? validRateCard.pricePerPerson,
      )
      addLineItem(
        `${legLabel} - Infant`,
        infantCount,
        validRateCard.infantPrice ??
          validRateCard.childPrice ??
          validRateCard.pricePerPerson,
      )
    }
  }

  return NextResponse.json({ lineItems })
}
