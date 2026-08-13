import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { buildPackageQuoteLineItems } from "@/lib/quotes/build-from-package"
import { priceExtraLineItems } from "@/lib/quotes/price-extra-line"
import { loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import { safeSupabaseError } from "@/lib/api/responses"
import { getCachedRates } from "@/lib/fx/rates"
import { BASE_CURRENCY, normaliseCurrency } from "@/lib/money"
import { MissingFxRateError } from "@/lib/pricing/convert-currency"
import { SUPPORTED_CURRENCY_VALUES } from "@/lib/types"

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
        /** Manual-pricing legs and transfer/rental overrides: the currency the typed fares on
         * this leg are in. Rate-card legs ignore it and use the card's own currency. */
        priceCurrency: z.enum(SUPPORTED_CURRENCY_VALUES).optional(),
        commissionOverride: commissionOverrideSchema,
      }),
    )
    .default([]),
  extras: z.array(extraSchema).default([]),
  /**
   * Rates the salesperson had on screen, keyed by currency (1 unit = N base units). Merged over
   * the server's cache so a hand-nudged rate is the one the quote is actually priced at —
   * otherwise the preview and the saved lines would disagree.
   *
   * Bounded rather than free: a fat-fingered decimal point would otherwise mis-price a booking
   * by an order of magnitude with no other guard in the path.
   */
  fxRates: z.record(z.enum(SUPPORTED_CURRENCY_VALUES), z.number().positive().max(10_000)).optional(),
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

  const { data: rateTypeRows } = await supabase
    .from("rate_types")
    .select("id, code, name, is_default")
    .is("archived_at", null)

  const rateTypes = (rateTypeRows ?? []).map((rt) => ({ id: rt.id, code: rt.code, name: rt.name }))
  const fallbackRateTypeId = (rateTypeRows ?? []).find((rt) => rt.is_default)?.id ?? null

  // Carried through so re-pricing keeps the manual commission top-up the salesperson added,
  // and so foreign supplier rates convert into the currency this quote is already denominated in.
  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("commission_bonus, currency")
    .eq("id", parsed.quoteId)
    .maybeSingle()

  const quoteCurrency = normaliseCurrency(quoteRow?.currency)
  // Cached only: a slow or unreachable FX provider must not add latency to Build Booking. The
  // dialog refreshes rates explicitly through /api/fx/rates instead.
  const fx = await getCachedRates(supabase)
  // What the salesperson saw wins over the cache, so the preview they approved is the price that
  // gets saved. The base currency is pinned to 1 regardless of what the client sent.
  const effectiveRates = { ...fx.rates, ...(parsed.fxRates ?? {}), [BASE_CURRENCY]: 1 }

  const { detail } = await loadBookingServicesPackageDetail(
    supabase,
    id,
    booking.booking_number,
    quoteCurrency,
  )

  try {
    const { lineItems } = await buildPackageQuoteLineItems({
      supabase,
      packageDetail: detail,
      jobId: parsed.jobId,
      travelDate: parsed.travelDate,
      selections: parsed.selections,
      fallbackRateTypeId,
      rateTypes,
      commissionBonus: Number(quoteRow?.commission_bonus ?? 0),
      quoteCurrency,
      fxRates: effectiveRates,
      fxRateAsOf: fx.rows[0]?.asOf ?? null,
    })

    const extraLineItems = (
      await Promise.all(
        parsed.extras.map((extra) =>
          priceExtraLineItems({
            supabase,
            jobId: parsed.jobId,
            travelDate: parsed.travelDate,
            fallbackRateTypeId,
            quoteCurrency,
            fxRates: effectiveRates,
            fxRateAsOf: fx.rows[0]?.asOf ?? null,
            ...extra,
          }),
        ),
      )
    ).flatMap((result) => result.lineItems)

    return NextResponse.json({
      lineItems: [...lineItems, ...extraLineItems],
      currency: quoteCurrency,
      // Let the dialog render its mixed-currency banner without a second round trip.
      fx: { rates: effectiveRates, asOf: fx.rows[0]?.asOf ?? null, stale: fx.stale },
    })
  } catch (error) {
    // A missing rate is the salesperson's problem to fix (refresh or type one), not a server
    // fault -- surface it the same way an unpriced rate card is surfaced.
    if (error instanceof MissingFxRateError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : "Failed to build service line items"
    const status = message === "Job not found" ? 404 : 400

    return NextResponse.json({ error: message }, { status })
  }
}
