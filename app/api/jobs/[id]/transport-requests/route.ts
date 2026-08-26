import { z } from "zod"
import { randomUUID } from "node:crypto"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { mapBookingTransportRequest } from "@/lib/suppliers"
import { recomputeBookingTripDates } from "@/lib/packages/recompute-trip-dates"
import { BOOKING_TRANSPORT_REQUEST_COLUMNS } from "@/lib/supabase/columns"
import type { Database, Json } from "@/lib/supabase/types"

type TransportRequestInsertRow = Database["public"]["Tables"]["booking_transport_requests"]["Insert"]

const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).optional()
const nullableDateTime = z.union([z.string().datetime({ offset: true }), z.literal(""), z.null()]).optional()
const nullableTime = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal(""), z.null()]).optional()

const rentalDetailsSchema = z.object({
  returnAt: nullableDateTime,
  returnCutoffTime: nullableTime,
}).nullable().optional()

const transportRequestSchema = z.object({
  id: z.string().uuid().optional(),
  serviceType: z.enum(["transfer", "rental"]),
  supplierId: nullableUuid,
  routeId: nullableUuid,
  suiteTypeId: nullableUuid,
  packageLegId: nullableUuid,
  /** Set instead of packageLegId for a Build Booking (booking_services) leg. */
  serviceId: nullableUuid,
  pickupPoint: z.string().trim().max(500),
  dropoffPoint: z.string().trim().max(500),
  pickupAt: nullableDateTime,
  /** Transfers only: `pre`/`post` derive pickupAt's date from the leg above it in the itinerary.
   *  Rejected on a rental below, which has no single "leg above" concept for its two dates. */
  dateAnchor: z.enum(["pre", "post", "custom"]).nullable().optional(),
  rentalDetails: rentalDetailsSchema,
  passengerCount: z.number().int().nonnegative().nullable().optional(),
  luggageCount: z.number().int().nonnegative().nullable().optional(),
  flightNumber: z.string().trim().max(100).nullable().optional(),
  priceOverride: z.number().nonnegative().nullable().optional(),
  complimentary: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Transfers only, always 'per_vehicle' for a rental. Omitted on a brand-new row lets the
   *  server fall back to the supplier's current default; once saved, a row keeps its own basis
   *  across later saves regardless of supplier changes — see the carry-forward below. */
  pricingBasis: z.enum(["per_vehicle", "per_person"]).optional(),
  /** Per-person mode only. Null means "use the booking's projected totals" -- see
   *  lib/pricing/transfer-basis.ts resolveTransferPax. Ignored (never rejected) on a per_vehicle
   *  row, so switching a row back and forth never loses a typed split. */
  adultCount: z.number().int().nonnegative().nullable().optional(),
  childCount: z.number().int().nonnegative().nullable().optional(),
  infantCount: z.number().int().nonnegative().nullable().optional(),
  /** Per-person mode only. priceOverride above is the adult override in that mode. */
  priceOverrideChild: z.number().nonnegative().nullable().optional(),
  priceOverrideInfant: z.number().nonnegative().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
}).superRefine((request, context) => {
  if (request.serviceType === "rental") {
    if (!normalizeNullableDateTime(request.rentalDetails?.returnAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rentalDetails", "returnAt"],
        message: "Return date/time is required for vehicle rentals",
      })
    }

    if (request.dateAnchor === "pre" || request.dateAnchor === "post") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateAnchor"],
        message: "A vehicle rental has no single leg to anchor its dates to — pick pickup/return dates directly",
      })
    }

    // Per-person pricing is scoped to transfers only (booking_transport_requests_rental_basis_check
    // enforces this in the DB too) -- a rental always prices per vehicle per day.
    if (request.pricingBasis === "per_person") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pricingBasis"],
        message: "A vehicle rental always prices per vehicle — per-person pricing is transfers only",
      })
    }
  }

  // A row can omit pricingBasis entirely and still be per-person (an existing row carries its own
  // basis forward without resending it — see the carry-forward in PUT below), so whether a child/
  // infant override is meaningful can't be decided from this payload alone when pricingBasis is
  // omitted. Only reject the combination when the payload itself explicitly says per_vehicle; the
  // omitted case is checked against the RESOLVED basis in the handler instead.
  if (request.pricingBasis === "per_vehicle") {
    if (request.priceOverrideChild != null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceOverrideChild"],
        message: "A child fare override only applies to a per-person transfer",
      })
    }
    if (request.priceOverrideInfant != null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceOverrideInfant"],
        message: "An infant fare override only applies to a per-person transfer",
      })
    }
  }
})

// `transportRequests` is required with no default on purpose: this PUT is a replace-the-set
// operation, so a payload that omits the key (a typo, an older client) used to parse as "replace
// with nothing" and silently delete every trip on the booking. Requiring it makes that a 400.
// Clearing the set is still possible — it just has to be asked for explicitly with `[]`.
const saveTransportRequestsSchema = z.object({
  transportRequests: z.array(transportRequestSchema),
})

function normalizeNullableUuid(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeNullableDateTime(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function normalizeNullableTime(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("booking_transport_requests")
    .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (error) return safeSupabaseError("transport-requests:list", error, "Failed to load transport requests")

  return Response.json((data ?? []).map(mapBookingTransportRequest))
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsedResult = saveTransportRequestsSchema.safeParse(raw)
  if (!parsedResult.success) return jsonZodError(parsedResult.error, "Invalid transport request payload")
  const parsed = parsedResult.data

  const { supabase, user } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("transport-requests:load-booking", bookingError, "Failed to validate booking")
  if (!booking) return jsonError("Booking not found", 404)

  // Carries an override's audit stamp, and a row's own pricing basis, across the delete/reinsert
  // cycle below: an unchanged amount keeps its original stamp, a changed or brand-new one gets a
  // fresh one. The basis carry-forward is the load-bearing part -- the RPC deletes and reinserts
  // every row on the booking, so if a saved row's pricingBasis is omitted from the payload (the
  // client resending everything else unchanged) and just fell through to the supplier's CURRENT
  // default, a two-month-old transfer would silently re-price the next time anything on the
  // booking was saved. Mirrors the hotel room override logic in
  // app/api/jobs/[id]/services/route.ts.
  const { data: existingRequests } = await supabase
    .from("booking_transport_requests")
    .select(
      "id, price_override, price_override_set_at, price_override_set_by, pricing_basis, price_override_child, price_override_infant",
    )
    .eq("booking_id", id)
  const existingProvenance = new Map((existingRequests ?? []).map((request) => [request.id, request]))
  const savedAt = new Date().toISOString()

  // Only rows with no saved basis of their own (brand new, or an id the client invented) need the
  // supplier's current default -- everything else uses its own carried-forward basis instead.
  const supplierIdsNeedingDefault = Array.from(
    new Set(
      parsed.transportRequests
        .filter((request) => {
          const previous = request.id ? existingProvenance.get(request.id) : undefined
          return !previous && !request.pricingBasis && request.serviceType === "transfer"
        })
        .map((request) => normalizeNullableUuid(request.supplierId))
        .filter((supplierId): supplierId is string => supplierId !== null),
    ),
  )
  const supplierTransferBasisById = new Map<string, "per_vehicle" | "per_person">()
  if (supplierIdsNeedingDefault.length > 0) {
    const { data: supplierRows } = await supabase
      .from("suppliers")
      .select("id, transfer_pricing_basis")
      .in("id", supplierIdsNeedingDefault)
    for (const row of supplierRows ?? []) {
      supplierTransferBasisById.set(row.id, row.transfer_pricing_basis)
    }
  }

  const rows: TransportRequestInsertRow[] = []
  for (const [index, request] of parsed.transportRequests.entries()) {
    const previous = request.id ? existingProvenance.get(request.id) : undefined
    const supplierId = normalizeNullableUuid(request.supplierId)
    // A transfer row's own basis (from the payload, or carried forward from the saved row) always
    // wins over the supplier's current default -- that default is only consulted for a row that
    // has neither, i.e. genuinely new. Rentals and rows with no supplier stay per_vehicle.
    const resolvedBasis: "per_vehicle" | "per_person" =
      request.serviceType !== "transfer"
        ? "per_vehicle"
        : request.pricingBasis ??
          previous?.pricing_basis ??
          (supplierId ? supplierTransferBasisById.get(supplierId) : undefined) ??
          "per_vehicle"

    const priceOverride = request.priceOverride ?? null
    // Child/infant overrides only persist in per-person mode -- outside it they're either already
    // rejected by the Zod refine (an explicit per_vehicle payload) or simply not meaningful (an
    // omitted-basis row that resolved to per_vehicle), so they're dropped rather than saved inert.
    const priceOverrideChild = resolvedBasis === "per_person" ? request.priceOverrideChild ?? null : null
    const priceOverrideInfant = resolvedBasis === "per_person" ? request.priceOverrideInfant ?? null : null

    if (resolvedBasis !== "per_person" && (request.priceOverrideChild != null || request.priceOverrideInfant != null)) {
      return jsonError(
        `Transport request ${index + 1}: a child/infant fare override only applies to a per-person transfer`,
        400,
      )
    }

    const hasAnyOverride = priceOverride !== null || priceOverrideChild !== null || priceOverrideInfant !== null
    const unchanged =
      hasAnyOverride &&
      previous !== undefined &&
      priceOverride === (previous.price_override ?? null) &&
      priceOverrideChild === (previous.price_override_child ?? null) &&
      priceOverrideInfant === (previous.price_override_infant ?? null)

    // Per-person mode only: the row's own typed counts win; otherwise leave null so the pricing
    // engine falls back to the booking's projected totals (see resolveTransferPax). The stored
    // passenger_count itself is always server-derived below, not taken from the payload.
    const adultCount = resolvedBasis === "per_person" ? request.adultCount ?? null : null
    const childCount = resolvedBasis === "per_person" ? request.childCount ?? null : null
    const infantCount = resolvedBasis === "per_person" ? request.infantCount ?? null : null
    const anyCountTyped = adultCount !== null || childCount !== null || infantCount !== null

    rows.push({
      id: request.id ?? randomUUID(),
      booking_id: id,
      service_type: request.serviceType,
      supplier_id: supplierId,
      route_id: normalizeNullableUuid(request.routeId),
      suite_type_id: normalizeNullableUuid(request.suiteTypeId),
      // package_leg_id was dropped from this table by 20260811140000_drop_catalogue_packages.sql
      // (superseded by service_id) and was never in replace_booking_transport_requests' column
      // list either -- request.packageLegId in the schema above is accepted but has been inert
      // since then. Not touched here beyond no longer writing a since-removed column.
      service_id: normalizeNullableUuid(request.serviceId),
      pickup_point: request.pickupPoint.trim(),
      dropoff_point: request.dropoffPoint.trim(),
      pickup_at: normalizeNullableDateTime(request.pickupAt),
      date_anchor: request.serviceType === "rental" ? null : request.dateAnchor ?? null,
      // "Total seats on this vehicle" stays meaningful for the voucher/worksheet/movement-times
      // consumers that read it regardless of basis: in per-person mode it's derived from the
      // typed counts (once any are typed) rather than taken from the payload directly, so it
      // can never silently disagree with the Adults/Children/Infants the quote actually priced.
      passenger_count: anyCountTyped
        ? (adultCount ?? 0) + (childCount ?? 0) + (infantCount ?? 0)
        : request.passengerCount ?? null,
      luggage_count: request.luggageCount ?? null,
      flight_number: normalizeNullableText(request.flightNumber),
      price_override: priceOverride,
      price_override_child: priceOverrideChild,
      price_override_infant: priceOverrideInfant,
      price_override_set_at: !hasAnyOverride ? null : unchanged ? previous?.price_override_set_at ?? savedAt : savedAt,
      price_override_set_by: !hasAnyOverride ? null : unchanged ? previous?.price_override_set_by ?? user.id : user.id,
      complimentary: request.complimentary ?? false,
      notes: normalizeNullableText(request.notes),
      sort_order: request.sortOrder ?? index,
      pricing_basis: resolvedBasis,
      adult_count: adultCount,
      child_count: childCount,
      infant_count: infantCount,
    })
  }
  const rentalRows = parsed.transportRequests.flatMap((request, index) => {
    if (request.serviceType !== "rental") return []

    return [{
      transport_request_id: rows[index]?.id ?? "",
      return_at: normalizeNullableDateTime(request.rentalDetails?.returnAt),
      return_cutoff_time: normalizeNullableTime(request.rentalDetails?.returnCutoffTime),
    }]
  })

  const { error: replaceError } = await supabase.rpc("replace_booking_transport_requests", {
    p_booking_id: id,
    p_transport_requests: rows as Json,
    p_rental_details: rentalRows as Json,
  })

  if (replaceError) return safeSupabaseError("transport-requests:replace", replaceError, "Failed to replace transport requests")

  // Rental returns / pickups can extend the trip, so re-derive the booking's trip dates.
  const recompute = await recomputeBookingTripDates(supabase, id)
  if (recompute.error) return jsonError(recompute.error, 500)

  const { data: savedRows, error: loadError } = await supabase
    .from("booking_transport_requests")
    .select(BOOKING_TRANSPORT_REQUEST_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order", { ascending: true })

  if (loadError) return safeSupabaseError("transport-requests:reload", loadError, "Failed to load saved transport requests")

  return Response.json((savedRows ?? []).map(mapBookingTransportRequest))
}
