import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { buildPackageQuoteLineItems } from "@/lib/quotes/build-from-package"
import { priceExtraLineItems } from "@/lib/quotes/price-extra-line"
import { loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import { safeSupabaseError } from "@/lib/api/responses"

/**
 * Build Booking's equivalent of POST /api/packages/[slug]/apply: prices booking_services instead
 * of a catalogue package's package_legs. Same request/response shape (jobId is the same id in
 * the URL, kept in the body too so this stays a drop-in swap for the client).
 */

const commissionOverrideSchema = z
  .object({
    type: z.enum(["percent", "per_person", "fixed"]),
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
  /** Manual-pricing legs only (e.g. airlines): the typed fare for this unit's cabin. */
  manualAdultPrice: z.number().nonnegative().nullable().optional(),
  manualChildPrice: z.number().nonnegative().nullable().optional(),
  manualInfantPrice: z.number().nonnegative().nullable().optional(),
})

const applyServicesSchema = z.object({
  jobId: z.string().uuid(),
  quoteId: z.string().uuid(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  rateTypeId: z.string().uuid().optional(),
  selections: z
    .array(
      z.object({
        legId: z.string().uuid(),
        selected: z.boolean().default(true),
        routeId: z.string().uuid().optional(),
        routeReversed: z.boolean().optional(),
        serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").nullable().optional(),
        suiteTypeId: z.string().uuid().optional(),
        units: z.array(unitSelectionSchema).optional(),
        nights: z.number().int().positive().optional(),
        rateTypeId: z.string().uuid().optional(),
        commissionOverride: commissionOverrideSchema,
      }),
    )
    .default([]),
  extras: z.array(extraSchema).default([]),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  let parsed: z.infer<typeof applyServicesSchema>
  try {
    parsed = applyServicesSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_number")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services-apply:load-booking", bookingError)
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

  const { detail } = await loadBookingServicesPackageDetail(supabase, id, booking.booking_number)

  const { data: rateTypeRows } = await supabase
    .from("rate_types")
    .select("id, code, name, is_default")
    .is("archived_at", null)

  const rateTypes = (rateTypeRows ?? []).map((rt) => ({ id: rt.id, code: rt.code, name: rt.name }))
  const fallbackRateTypeId = (rateTypeRows ?? []).find((rt) => rt.is_default)?.id ?? null

  // Carried through so re-pricing keeps the manual commission top-up the salesperson added.
  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("commission_bonus")
    .eq("id", parsed.quoteId)
    .maybeSingle()

  try {
    const { lineItems } = await buildPackageQuoteLineItems({
      supabase,
      packageDetail: detail,
      jobId: parsed.jobId,
      travelDate: parsed.travelDate,
      selections: parsed.selections,
      rateTypeId: parsed.rateTypeId ?? null,
      fallbackRateTypeId,
      rateTypes,
      commissionBonus: Number(quoteRow?.commission_bonus ?? 0),
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
    const message = error instanceof Error ? error.message : "Failed to build service line items"
    const status = message === "Job not found" ? 404 : 400

    return NextResponse.json({ error: message }, { status })
  }
}
