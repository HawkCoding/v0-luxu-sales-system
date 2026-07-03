import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { buildPackageQuoteLineItems } from "@/lib/quotes/build-from-package"
import { priceExtraLineItems } from "@/lib/quotes/price-extra-line"
import { loadPackageDetail } from "../helpers"

const commissionOverrideSchema = z
  .object({
    type: z.enum(["percent", "per_person"]),
    value: z.number().finite().nonnegative(),
  })
  .nullable()
  .optional()

const extraSchema = z.object({
  supplierId: z.string().uuid(),
  routeId: z.string().uuid(),
  suiteTypeId: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
  rateTypeId: z.string().uuid().optional(),
  commissionOverride: commissionOverrideSchema,
})

const unitSelectionSchema = z.object({
  suiteTypeId: z.string().uuid(),
  bedroomTypeId: z.string().uuid().nullable().optional(),
  bedroomLayoutId: z.string().uuid().nullable().optional(),
  bathroomTypeId: z.string().uuid().nullable().optional(),
  adultCount: z.number().int().nonnegative().default(0),
  childCount: z.number().int().nonnegative().default(0),
  infantCount: z.number().int().nonnegative().default(0),
})

const applyPackageSchema = z.object({
  jobId: z.string().uuid(),
  quoteId: z.string().uuid(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  rateTypeId: z.string().uuid().optional(),
  selections: z.array(
    z.object({
      legId: z.string().uuid(),
      selected: z.boolean().default(true),
      routeId: z.string().uuid().optional(),
      /** Transfer/vehicle-rental legs only: the vehicle category. */
      suiteTypeId: z.string().uuid().optional(),
      /** Hotel/train/tour/airline legs: one entry per independent suite/room booked. */
      units: z.array(unitSelectionSchema).optional(),
      nights: z.number().int().positive().optional(),
      commissionOverride: commissionOverrideSchema,
    }),
  ).default([]),
  extras: z.array(extraSchema).default([]),
})

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { slug } = await params

  let parsed: z.infer<typeof applyPackageSchema>
  try {
    parsed = applyPackageSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existing = await loadPackageDetail(supabase, slug)
  if ("error" in existing) {
    return existing.error!
  }

  const { data: rateTypeRows } = await supabase
    .from("rate_types")
    .select("id, code, name, is_default")
    .is("archived_at", null)

  const rateTypes = (rateTypeRows ?? []).map((rt) => ({ id: rt.id, code: rt.code, name: rt.name }))
  const fallbackRateTypeId = (rateTypeRows ?? []).find((rt) => rt.is_default)?.id ?? null

  try {
    const { lineItems } = await buildPackageQuoteLineItems({
      supabase,
      packageDetail: existing.detail,
      jobId: parsed.jobId,
      travelDate: parsed.travelDate,
      selections: parsed.selections,
      rateTypeId: parsed.rateTypeId ?? null,
      fallbackRateTypeId,
      rateTypes,
    })

    const extraLineItems = (
      await Promise.all(
        parsed.extras.map((extra) =>
          priceExtraLineItems({
            supabase,
            jobId: parsed.jobId,
            travelDate: parsed.travelDate,
            fallbackRateTypeId,
            ...extra,
          }),
        ),
      )
    ).flatMap((result) => result.lineItems)

    return NextResponse.json({ lineItems: [...lineItems, ...extraLineItems] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build package line items"
    const status = message === "Job not found" ? 404 : 400

    return NextResponse.json({ error: message }, { status })
  }
}
