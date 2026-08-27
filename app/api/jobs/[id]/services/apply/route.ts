import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { buildPackageQuoteLineItems } from "@/lib/quotes/build-from-package"
import { priceExtraLineItems } from "@/lib/quotes/price-extra-line"
import { loadBookingServicesPackageDetail } from "@/lib/quotes/adapters/from-booking-services"
import { loadRoomOverrideProvenance, loadTourOverrideProvenance } from "@/lib/quotes/room-override-provenance"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { getCachedRates } from "@/lib/fx/rates"
import { BASE_CURRENCY, isSupportedCurrency, normaliseCurrency } from "@/lib/money"
import { MissingFxRateError, roundFxRate } from "@/lib/pricing/convert-currency"

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
  // Optional for a type-priced supplier (tour operator) — no itinerary is required to price it.
  routeId: z.string().uuid().nullable().optional(),
  suiteTypeId: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
  rateTypeId: z.string().uuid().optional(),
  commissionOverride: commissionOverrideSchema,
})

const unitSelectionSchema = z.object({
  /** booking_service_units.id, when this room has been saved. Used only to look the room's
   * override provenance up server-side — the client never states who set a price. */
  unitId: z.string().uuid().optional(),
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
  /** Hotel legs only: the typed price per room per night that replaces this room's rate card. */
  manualRoomPrice: z.number().nonnegative().nullable().optional(),
  /** Hotel legs only: the hotel gifted this room's first night, so the line prices nights - 1. */
  complimentaryFirstNight: z.boolean().optional(),
  /** Tour legs only: the typed flat price that replaces this unit's rate-card-computed total. */
  manualTourPrice: z.number().nonnegative().nullable().optional(),
  /** Tour legs only: this unit's own rate type, overriding the leg-level rateTypeId below. */
  rateTypeId: z.string().uuid().nullable().optional(),
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
         * this leg are in. Rate-card legs ignore it and use the card's own currency. Read
         * straight off booking_services.price_currency, a free-text column with no CHECK
         * constraint, so this normalises rather than rejects — a legacy/unsupported code must
         * not 400 the whole quote build. */
        priceCurrency: z
          .string()
          .nullable()
          .optional()
          .transform((value) => (value ? normaliseCurrency(value) : undefined)),
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
   * Any currency the server doesn't support, or an out-of-range rate (a fat-fingered decimal
   * point), is dropped rather than failing the whole request — this is convenience data the
   * cache already has a fallback for, not something worth blocking a save over.
   */
  fxRates: z.record(z.string(), z.number()).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const rawBody: unknown = await req.json().catch(() => null)
  const parseResult = applyServicesSchema.safeParse(rawBody)
  if (!parseResult.success) {
    return jsonZodError(parseResult.error, "Invalid request payload", "jobs:services-apply")
  }
  const parsed = parseResult.data

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
  // Only a currency the server actually supports, with a sane positive rate, overrides the cache
  // — anything else (an unsupported code, a zero/negative/absurd rate) is dropped rather than
  // failing the whole request, and the cached rate is kept instead.
  const clientRates = Object.fromEntries(
    Object.entries(parsed.fxRates ?? {}).filter(
      ([currency, rate]) => isSupportedCurrency(currency) && Number.isFinite(rate) && rate > 0 && rate <= 10_000,
    ).map(([currency, rate]) => [currency, roundFxRate(rate)]),
  )
  // What the salesperson saw wins over the cache, so the preview they approved is the price that
  // gets saved. The base currency is pinned to 1 regardless of what the client sent.
  const effectiveRates = { ...fx.rates, ...clientRates, [BASE_CURRENCY]: 1 }

  const { detail } = await loadBookingServicesPackageDetail(
    supabase,
    id,
    booking.booking_number,
    quoteCurrency,
  )

  // The dialog saves the rooms (PATCH /services) before asking for this preview, so the stored
  // provenance is already current. Read it here rather than trusting the payload — the price is
  // the salesperson's to type, but who typed it is the server's to say.
  const unitIds = parsed.selections.flatMap((selection) =>
    (selection.units ?? []).map((unit) => unit.unitId).filter((unitId): unitId is string => Boolean(unitId)),
  )
  const [roomOverrideProvenance, tourOverrideProvenance] = await Promise.all([
    loadRoomOverrideProvenance(supabase, unitIds),
    loadTourOverrideProvenance(supabase, unitIds),
  ])

  const selections = parsed.selections.map((selection) => ({
    ...selection,
    units: selection.units?.map((unit) => {
      const roomProvenance = unit.unitId ? roomOverrideProvenance.get(unit.unitId) : undefined
      const tourProvenance = unit.unitId ? tourOverrideProvenance.get(unit.unitId) : undefined
      return {
        ...unit,
        manualRoomPriceSetAt: roomProvenance?.setAt ?? null,
        manualRoomPriceSetByName: roomProvenance?.setByName ?? null,
        manualTourPriceSetAt: tourProvenance?.setAt ?? null,
        manualTourPriceSetByName: tourProvenance?.setByName ?? null,
      }
    }),
  }))

  try {
    const { lineItems, incompleteLegs } = await buildPackageQuoteLineItems({
      supabase,
      packageDetail: detail,
      jobId: parsed.jobId,
      travelDate: parsed.travelDate,
      selections,
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

    // Nothing this route does is persisted -- it prices a preview -- so an unconfigured leg is
    // reported alongside the legs that did price instead of losing the whole preview to a 400.
    // The client must refuse to save while incompleteLegs is non-empty.
    const pricedALeg = lineItems.some((item) => item.pricingSnapshot?.legId)
    if (incompleteLegs.length > 0 && !pricedALeg) {
      return NextResponse.json(
        { error: incompleteLegs[0].message, incompleteLegs },
        { status: 400 },
      )
    }

    return NextResponse.json({
      lineItems: [...lineItems, ...extraLineItems],
      incompleteLegs,
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
