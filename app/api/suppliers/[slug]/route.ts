import { NextResponse } from "next/server"
import { staleVersionResponse } from "@/lib/concurrency"
import { mapPostgrestError, safeSupabaseError } from "@/lib/api/responses"
import { mapRateType, mapSupplierDetail } from "@/lib/suppliers"
import { resolveSupplierRateTiers } from "@/lib/rate-types/supplier-rate-tiers"
import {
  allowedRoles,
  checkDeletionDependencies,
  deleteInChunks,
  describeValidationIssue,
  loadSupplierDetail,
  makeUuid,
  normalizeNullableDate,
  requireAuthenticatedUser,
  supplierConflictMessage,
  type SessionClient,
} from "../helpers"
import {
  supplierDraftSaveSchema,
  supplierSaveSchema,
  type SupplierDraftSaveInput,
  type SupplierSaveInput,
} from "../schemas"
import {
  getSupplierVocabulary,
  isTransportSupplier,
  isTypePricedSupplier,
  type SupplierKind,
} from "@/lib/types"
import { buildRouteName } from "@/lib/routes/route-name"
import { areRateCardDateRangesOverlapping, checkRateCardOverlaps } from "@/lib/rate-cards/overlap"

interface NormalizedRoute {
  id: string
  supplier_id: string
  name: string
  origin_location_id: string | null
  destination_location_id: string | null
  pickup_point: string | null
  dropoff_point: string | null
  direction_mode: "one_way" | "round_trip" | "loop"
  duration_days: number | null
  departure_time: string | null
  arrival_time: string | null
  return_departure_time: string | null
  return_arrival_time: string | null
  /** Tour operators only: the tour type this itinerary describes. */
  suite_type_id: string | null
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

interface NormalizedVehicleRentalRouteDetails {
  route_id: string
  included_km_per_day: number | null
  extra_km_price: number | null
  security_deposit: number | null
  one_way_fee: number | null
  created_at: string
  updated_at: string
}

interface NormalizedRateCard {
  id: string
  /** Null on a tour operator's card: the tour type is priced across every itinerary. */
  route_id: string | null
  suite_type_id: string
  rate_type_id: string
  price_per_person: number
  child_price: number | null
  infant_price: number | null
  currency: string
  valid_from: string
  valid_to: string | null
  created_at: string
}

function logSupplierMutationError(
  operation: string,
  supplierId: string,
  error: unknown,
) {
  console.error(`Supplier mutation failed during ${operation}`, {
    supplierId,
    error,
  })
}

async function hasSupplierWriteAccess(
  supabase: SessionClient,
  userId: string,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", userId)
    .single()

  return !error && Boolean(profile && allowedRoles.has(profile.clearance_level))
}

function getRateCardBusinessKey(rateCard: {
  route_id: string | null
  suite_type_id: string
  rate_type_id: string
  valid_from: string
}) {
  return [
    rateCard.rate_type_id,
    // Route-agnostic (tour operator) cards share one key space, mirroring the COALESCE in the
    // rate_cards unique index and overlap constraint.
    rateCard.route_id ?? "__any_route__",
    rateCard.suite_type_id,
    rateCard.valid_from,
  ].join("|")
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeOptionalUuid(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function findDuplicateNames(items: Array<{ id: string; name: string }>): string | null {
  const seenByName = new Map<string, string>()
  for (const item of items) {
    const normalized = item.name.trim().toLowerCase()
    if (!normalized) continue
    const existingId = seenByName.get(normalized)
    if (existingId && existingId !== item.id) {
      return item.name
    }
    seenByName.set(normalized, item.id)
  }
  return null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { slug } = await params
  const detail = await loadSupplierDetail(auth.supabase, slug)
  if ("error" in detail) {
    return detail.error!
  }

  return NextResponse.json(
    mapSupplierDetail(
      detail.supplier,
      detail.suiteTypes,
      detail.emails,
      detail.routes,
      detail.rateCards,
      detail.locations,
      detail.vehicleRentalRouteDetails,
      {
        bedroomTypes: detail.bedroomTypes,
        bedroomLayouts: detail.bedroomLayouts,
        bathroomTypes: detail.bathroomTypes,
        suiteTypeBedroomTypes: detail.suiteTypeBedroomTypes,
        suiteTypeBedroomLayouts: detail.suiteTypeBedroomLayouts,
        suiteTypeBathroomTypes: detail.suiteTypeBathroomTypes,
        rateTypes: detail.rateTypes,
        rateAdjustments: detail.rateAdjustments,
        stationAddresses: detail.stationAddresses,
        inclusionLines: detail.inclusionLines,
        parentSupplier: detail.parentSupplier,
      },
    ),
  )
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase, user } = auth
  const { slug } = await params

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const detail = await loadSupplierDetail(supabase, slug)
  if ("error" in detail) {
    return detail.error!
  }

  const supplierId = detail.supplier.id
  const { count: directBookingCount, error: directBookingError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("hotel_supplier_id", supplierId)
    .neq("stage", "closed")
    .neq("stage", "lost")

  if (directBookingError) {
    return NextResponse.json(
      { error: "Failed to validate supplier deletion" },
      { status: 500 },
    )
  }

  if ((directBookingCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete supplier with active bookings" },
      { status: 409 },
    )
  }

  const dependencyChecks = await checkDeletionDependencies(
    supabase,
    detail.routes.map((route) => route.id),
    detail.suiteTypes.map((suiteType) => suiteType.id),
  )

  if (dependencyChecks.length > 0) {
    return NextResponse.json(
      {
        error: "Cannot delete supplier while route or suite type records are still referenced.",
        details: dependencyChecks,
      },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase.from("suppliers").delete().eq("id", supplierId)
  if (deleteError) {
    if (deleteError.code === "23503") {
      return NextResponse.json(
        {
          error:
            "Cannot delete supplier: related records still exist. Resolve active references and try again.",
        },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: "Failed to delete supplier" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase, user } = auth
  const { slug } = await params
  const isDraftSave = new URL(req.url).searchParams.get("draft") === "true"

  if (!(await hasSupplierWriteAccess(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: SupplierSaveInput | SupplierDraftSaveInput
  {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const result = isDraftSave
      ? supplierDraftSaveSchema.safeParse(body)
      : supplierSaveSchema.safeParse(body)
    if (!result.success) {
      // Surface the first field-level message, prefixed with which field/row it's about
      // ("Inclusion Lines #13 Text: String must contain at most 1000 character(s)") instead of a
      // bare Zod string the caller can't act on.
      const firstIssue = result.error.issues[0]
      return NextResponse.json(
        {
          error: firstIssue ? describeValidationIssue(firstIssue) : "Invalid request payload",
          details: result.error.issues,
        },
        { status: 400 },
      )
    }
    parsed = result.data
  }

  const existingDetail = await loadSupplierDetail(supabase, slug)
  if ("error" in existingDetail) {
    return existingDetail.error!
  }

  // Manual suppliers (see supplier_pricing_mode) don't manage rate_cards through this route at
  // all -- whatever exists stays exactly as-is, and nothing submitted for them is written or
  // diffed against. This is what lets a supplier flip to manual without losing its rate history.
  const isManualPricingSupplier = parsed.pricingMode === "manual"

  const supplierId = existingDetail.supplier.id
  const expectedUpdatedAt = parsed.expectedUpdatedAt
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== existingDetail.supplier.updated_at) {
    return staleVersionResponse("supplier", existingDetail.supplier.updated_at)
  }

  const parsedEmailRows = parsed.emails
    .map((entry, index) => ({
      id: entry.id ?? makeUuid(),
      supplier_id: supplierId,
      email: entry.email.trim(),
      label: entry.label.trim() || "General",
      // Array position is the order unless the client says otherwise; the first row becomes the
      // supplier's primary contact (see `email:` on the update payload below).
      sort_order: entry.sortOrder ?? index,
    }))
    .filter((entry) => entry.email.length > 0)

  const fallbackEmail = parsed.email.trim()
  const emailCandidates =
    parsedEmailRows.length > 0 || fallbackEmail.length === 0
      ? parsedEmailRows
      : [
          {
            id: makeUuid(),
            supplier_id: supplierId,
            email: fallbackEmail,
            label: "General",
            sort_order: 0,
          },
        ]

  const seenLowercaseEmails = new Set<string>()
  const normalizedEmails = emailCandidates.filter((entry) => {
    const normalizedKey = entry.email.toLowerCase()
    if (seenLowercaseEmails.has(normalizedKey)) {
      return false
    }
    seenLowercaseEmails.add(normalizedKey)
    return true
  })

  const now = new Date().toISOString()
  const isTransport = isTransportSupplier(parsed.kind)
  // A per-person transfer supplier still uses every other isTransport behaviour below (vehicle
  // categories as suite types, pickup/dropoff route points) -- only its rate cards carry real
  // child/infant fares instead of being nulled. Read from the INCOMING payload, not the stored
  // row: the server is authoritative, but if this read the old value, the very first save after
  // flipping the toggle would null the child/infant prices the consultant just typed in the same
  // round trip.
  const isFlatRateTransport = isTransport && !(parsed.kind === "transfers" && parsed.transferPricingBasis === "per_person")
  // Tour operators: rate cards price the tour type (no route), routes describe it.
  const isItineraryKind = isTypePricedSupplier(parsed.kind)
  const normalizedSuiteTypes = parsed.suiteTypes
    .map((suiteType, index) => ({
      id: suiteType.id ?? makeUuid(),
      supplier_id: supplierId,
      name: suiteType.name.trim(),
      passenger_capacity: isTransport ? (suiteType.passengerCapacity ?? null) : null,
      luggage_capacity: isTransport ? (suiteType.luggageCapacity ?? null) : null,
      description: isTransport ? normalizeOptionalText(suiteType.description) : null,
      active: suiteType.active,
      sort_order: suiteType.sortOrder ?? index,
      bedroomTypeIds: suiteType.bedroomTypeIds ?? [],
      bedroomLayoutIds: suiteType.bedroomLayoutIds ?? [],
      bathroomTypeIds: suiteType.bathroomTypeIds ?? [],
      created_at: now,
      updated_at: now,
    }))
    .filter((suiteType) => !isDraftSave || suiteType.name.length > 0)

  function normalizeVariantList<T extends { id?: string; name: string; sortOrder?: number; archivedAt?: string | null }>(
    entries: T[],
  ) {
    return entries
      .map((entry, index) => ({
        id: entry.id ?? makeUuid(),
        supplier_id: supplierId,
        name: entry.name.trim(),
        sort_order: entry.sortOrder ?? index,
        archived_at: entry.archivedAt ?? null,
        created_at: now,
        updated_at: now,
      }))
      .filter((entry) => entry.name.length > 0)
  }

  // Only train operators board guests at a station, so the station editor is trains-only. A save
  // for another kind leaves whatever rows already exist completely alone (see the guarded
  // delete/upsert below) rather than deleting them: a supplier mis-categorised as a hotel and put
  // back must come home intact -- same rule as the route locations carried forward below. Rows
  // without a city are half-filled editor rows and never reach the DB (location_id is NOT NULL).
  const supplierUsesStations = parsed.kind === "train_operator"
  const normalizedStationAddresses = supplierUsesStations
    ? (parsed.stationAddresses ?? []).flatMap((station) => {
        const locationId = normalizeOptionalUuid(station.locationId)
        if (!locationId) return []
        return [{
          id: station.id ?? makeUuid(),
          supplier_id: supplierId,
          location_id: locationId,
          station_name: normalizeOptionalText(station.stationName),
          street_address: normalizeOptionalText(station.streetAddress),
          notes: normalizeOptionalText(station.notes),
          created_at: now,
          updated_at: now,
        }]
      })
    : []

  const normalizedBedroomTypes = normalizeVariantList(parsed.bedroomTypes ?? [])
  const normalizedBedroomLayouts = normalizeVariantList(parsed.bedroomLayouts ?? [])
  const normalizedBathroomTypes = normalizeVariantList(parsed.bathroomTypes ?? [])

  const allowedBedroomTypeIds = new Set(normalizedBedroomTypes.map((row) => row.id))
  const allowedBedroomLayoutIds = new Set(normalizedBedroomLayouts.map((row) => row.id))
  const allowedBathroomTypeIds = new Set(normalizedBathroomTypes.map((row) => row.id))

  // Train routes auto-fill their name from origin/destination + direction, only when the client
  // sends an empty name; a user-provided name always wins. A tour operator's itinerary has no
  // name field at all (see derivedName below) so it never participates in this.
  const autoDeriveRouteName = parsed.kind === "train_operator"
  const locationNameById = new Map(existingDetail.locations.map((location) => [location.id, location.name]))

  // `existingDetail.locations` only covers cities the supplier's *stored* routes and stations
  // already reference, so a blank-named route pointing at a city this supplier has never used
  // would have nothing to derive from. Fetch the missing names before normalising, and only when
  // a name actually has to be derived.
  if (parsed.kind === "train_operator") {
    const missingLocationIds = [
      ...new Set(
        parsed.routes
          .filter((route) => route.name.trim().length === 0)
          .flatMap((route) => [route.originLocationId, route.destinationLocationId])
          .flatMap((locationId) => {
            const normalized = normalizeOptionalUuid(locationId)
            return normalized && !locationNameById.has(normalized) ? [normalized] : []
          }),
      ),
    ]

    if (missingLocationIds.length > 0) {
      const { data: extraLocations, error: extraLocationsError } = await supabase
        .from("locations")
        .select("id, name")
        .in("id", missingLocationIds)

      if (extraLocationsError) {
        logSupplierMutationError("route-name-locations", supplierId, extraLocationsError)
        return NextResponse.json({ error: "Failed to resolve route locations" }, { status: 500 })
      }

      for (const location of extraLocations ?? []) {
        locationNameById.set(location.id, location.name)
      }
    }
  }

  // Kinds whose route editor has no location fields (hotels, tour operators)
  // must never *acquire* location links — stray ids would invisibly block
  // location deletion. A route that already carries endpoints keeps them
  // though: a train mis-categorised as a hotel and put back must come home
  // with its origins and destinations intact, and a train route without both
  // cannot be saved at all (see supplierSaveSchema).
  const routeUsesLocations = !isTransport && getSupplierVocabulary(parsed.kind).routeHasLocations
  const routeUsesDuration = getSupplierVocabulary(parsed.kind).routeHasDuration
  const routeUsesSchedule = getSupplierVocabulary(parsed.kind).routeHasSchedule
  const existingRouteById = new Map(existingDetail.routes.map((route) => [route.id, route]))

  const normalizedRoutes: NormalizedRoute[] = parsed.routes
    .map((route) => {
      const storedRoute = route.id ? existingRouteById.get(route.id) : undefined
      const originLocationId = routeUsesLocations
        ? normalizeOptionalUuid(route.originLocationId)
        : storedRoute?.origin_location_id ?? null
      const destinationLocationId = routeUsesLocations
        ? normalizeOptionalUuid(route.destinationLocationId)
        : storedRoute?.destination_location_id ?? null
      const directionMode = route.directionMode ?? "one_way"
      const originName = originLocationId ? locationNameById.get(originLocationId) : undefined
      const destinationName = destinationLocationId ? locationNameById.get(destinationLocationId) : undefined
      const routeId = route.id ?? makeUuid()
      // A tour operator's itinerary has no name of its own -- it used to be auto-named after its
      // linked tour type, but that copy is exactly what let an itinerary look like (and, once
      // stamped on the wrong leg, be mistaken for) a different tour than the one actually booked.
      // See lib/invoices/describe-invoice-line.ts and lib/quotes/build-from-package.ts. It can't
      // simply be blank: routes carries a real UNIQUE(name, supplier_id) constraint (see
      // supabase/migrations/20260426110000_packages_multileg.sql), and a supplier can have more
      // than one itinerary. The route's own id is used instead -- trivially unique forever, and
      // never rendered anywhere (an itinerary has no name field in the supplier editor).
      const derivedName =
        parsed.kind === "tour_operator"
          ? routeId
          : autoDeriveRouteName && originName && destinationName
            ? buildRouteName(originName, destinationName, directionMode)
          : null
      return {
        id: routeId,
        supplier_id: supplierId,
        name: route.name.trim() || (derivedName ?? ""),
        origin_location_id: originLocationId,
        destination_location_id: destinationLocationId,
        pickup_point: isTransport ? normalizeOptionalText(route.pickupPoint) : null,
        dropoff_point: isTransport ? normalizeOptionalText(route.dropoffPoint) : null,
        direction_mode: directionMode,
        duration_days: routeUsesDuration ? route.durationDays ?? null : null,
        departure_time: routeUsesSchedule ? route.departureTime ?? null : null,
        arrival_time: routeUsesSchedule ? route.arrivalTime ?? null : null,
        // A one-way route never travels back, so flipping a route off round_trip must clear the
        // return pair — otherwise stale times would resurface if it were ever flipped back.
        return_departure_time:
          routeUsesSchedule && directionMode === "round_trip" ? route.returnDepartureTime ?? null : null,
        return_arrival_time:
          routeUsesSchedule && directionMode === "round_trip" ? route.returnArrivalTime ?? null : null,
        // Only tour operators hang an itinerary off a tour type; for every other kind the route is
        // a pricing dimension, so a stray link would be meaningless.
        suite_type_id: isItineraryKind ? normalizeOptionalUuid(route.suiteTypeId) : null,
        description: isItineraryKind ? normalizeOptionalText(route.description) : null,
        active: route.active,
        created_at: now,
        updated_at: now,
      }
    })
    .filter((route) =>
      isDraftSave
        ? isTransport
          ? route.name.length > 0 && Boolean(route.pickup_point) && Boolean(route.dropoff_point)
          : routeUsesLocations
            ? route.name.length > 0 && Boolean(route.origin_location_id) && Boolean(route.destination_location_id)
            : isItineraryKind
              // An itinerary has no name of its own -- a draft is worth keeping once it's linked
              // to a tour type or carries copy, same rule shouldSendRoute applies on full saves.
              ? Boolean(route.suite_type_id) || route.name.length > 0 || Boolean(route.description)
              : route.name.length > 0
        : true,
    )

  // Last line of defence for the blank name the schema now lets through: if the derive above
  // could not produce one (an endpoint that no longer exists, say), refuse the save rather than
  // filing a nameless route that nothing can pick out of a list.
  if (!isDraftSave && normalizedRoutes.some((route) => route.name.length === 0)) {
    return NextResponse.json(
      { error: "A route could not be named from its origin and destination. Give it a name." },
      { status: 400 },
    )
  }

  const routeIds = new Set(normalizedRoutes.map((route) => route.id))
  const normalizedVehicleRentalDetails: NormalizedVehicleRentalRouteDetails[] =
    parsed.kind === "vehicle_rental"
      ? parsed.routes.flatMap((route) => {
          const routeId = route.id ?? normalizedRoutes.find((candidate) => candidate.name === route.name.trim())?.id
          if (!routeId || !routeIds.has(routeId)) return []
          const details = route.vehicleRentalDetails ?? {}
          return [{
            route_id: routeId,
            included_km_per_day: details.includedKmPerDay ?? null,
            extra_km_price: details.extraKmPrice ?? null,
            security_deposit: details.securityDeposit ?? null,
            one_way_fee: details.oneWayFee ?? null,
            created_at: now,
            updated_at: now,
          }]
        })
      : []

  const suiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))
  const activeRateTypeIds = new Set(
    (existingDetail.rateTypes ?? []).filter((row) => !row.archived_at).map((row) => row.id),
  )
  // The baseline a rate card falls back to when the client didn't name a rate type: the supplier's
  // own base rate, else the system default. Resolved off the incoming payload (not the stored row)
  // so a save that changes the base rate in the same request tags new cards with the value the
  // user just chose.
  const requestedBaseRateTypeId = parsed.baseRateTypeId ?? null
  const requestedQuoteRateTypeId = parsed.quoteRateTypeId ?? null
  const rateTiers = resolveSupplierRateTiers((existingDetail.rateTypes ?? []).map(mapRateType), {
    baseRateTypeId: requestedBaseRateTypeId,
    quoteRateTypeId: requestedQuoteRateTypeId,
  })
  const defaultRateTypeId = rateTiers.baseRateTypeId

  if (requestedBaseRateTypeId && !activeRateTypeIds.has(requestedBaseRateTypeId)) {
    return NextResponse.json(
      { error: "The base rate must reference an active rate type." },
      { status: 400 },
    )
  }
  if (requestedQuoteRateTypeId && !activeRateTypeIds.has(requestedQuoteRateTypeId)) {
    return NextResponse.json(
      { error: "The quoted rate must reference an active rate type." },
      { status: 400 },
    )
  }
  const existingRateCardByBusinessKey = new Map(
    existingDetail.rateCards.map((rateCard) => [getRateCardBusinessKey(rateCard), rateCard]),
  )
  const clientProvidedRateCardIds = new Set(
    [
      ...parsed.routes.flatMap((route) => route.rateCards),
      ...parsed.rateCards,
    ].flatMap((rateCard) => (rateCard.id ? [rateCard.id] : [])),
  )
  const incomingRateCardKeys = new Set<string>()

  let normalizedRateCards: NormalizedRateCard[] = []
  try {
    const duplicateSuiteTypeName = findDuplicateNames(normalizedSuiteTypes)
    if (duplicateSuiteTypeName) {
      throw new Error(`Duplicate suite type name "${duplicateSuiteTypeName}". Rename one and try again.`)
    }
    const duplicateRouteName = findDuplicateNames(normalizedRoutes)
    if (duplicateRouteName) {
      throw new Error(`Duplicate route name "${duplicateRouteName}". Rename one and try again.`)
    }

    const normalizeRateCard = (
      rateCard: {
        id?: string
        suiteTypeId: string
        rateTypeId?: string
        pricePerPerson: number
        childPrice: number | null
        infantPrice: number | null
        currency: string
        validFrom: string
        validTo: string | null
      },
      routeId: string | null,
    ): NormalizedRateCard => {
      const requestedRateTypeId =
        "rateTypeId" in rateCard && typeof rateCard.rateTypeId === "string" && rateCard.rateTypeId.length > 0
          ? rateCard.rateTypeId
          : null
      const resolvedRateTypeId = requestedRateTypeId ?? defaultRateTypeId ?? ""
      return {
        id: rateCard.id ?? makeUuid(),
        route_id: routeId,
        suite_type_id: rateCard.suiteTypeId,
        rate_type_id: resolvedRateTypeId,
        price_per_person: rateCard.pricePerPerson,
        child_price: isFlatRateTransport ? null : rateCard.childPrice,
        infant_price: isFlatRateTransport ? null : rateCard.infantPrice,
        currency: rateCard.currency.trim().toUpperCase() || "ZAR",
        valid_from: rateCard.validFrom,
        valid_to: normalizeNullableDate(rateCard.validTo),
        created_at: now,
      }
    }

    // A draft may still be missing the pieces a card needs to mean anything; a full save has
    // already been through the schema, so nothing is dropped there.
    const keepOnDraftSave = (rateCard: NormalizedRateCard) =>
      !isDraftSave ||
      ((rateCard.route_id === null || routeIds.has(rateCard.route_id)) &&
        suiteTypeIds.has(rateCard.suite_type_id) &&
        rateCard.valid_from.length > 0)

    // Manual suppliers never touch rate_cards through this route -- see isManualPricingSupplier
    // above. Whatever the client sent for rate cards is ignored outright, existing rows
    // included, rather than diffed/validated against.
    normalizedRateCards = isManualPricingSupplier
      ? []
      : isItineraryKind
        ? // Tour operators price the tour type: one card per type, no itinerary attached.
          parsed.rateCards.map((rateCard) => normalizeRateCard(rateCard, null)).filter(keepOnDraftSave)
        : parsed.routes
            .flatMap((route) => {
              const routeId = route.id ?? normalizedRoutes.find((candidate) => candidate.name === route.name.trim())?.id
              if (!routeId || !routeIds.has(routeId)) {
                return []
              }
              return route.rateCards.map((rateCard) => normalizeRateCard(rateCard, routeId))
            })
            .filter(keepOnDraftSave)

    normalizedRateCards = normalizedRateCards.map((rateCard) => {
      if (rateCard.route_id !== null && !routeIds.has(rateCard.route_id)) {
        throw new Error("Each rate card must reference a route from this supplier.")
      }
      if (!suiteTypeIds.has(rateCard.suite_type_id)) {
        throw new Error("Each rate card must reference a suite type from this supplier.")
      }
      if (!rateCard.rate_type_id) {
        throw new Error("No rate type is configured. Add one in Settings → Rate Types and try again.")
      }
      if (!activeRateTypeIds.has(rateCard.rate_type_id)) {
        throw new Error("Each rate card must reference an active rate type.")
      }
      if (rateCard.valid_to && rateCard.valid_to < rateCard.valid_from) {
        throw new Error("Rate card Valid to must be after Valid from.")
      }

      const businessKey = getRateCardBusinessKey(rateCard)
      if (incomingRateCardKeys.has(businessKey)) {
        throw new Error("Duplicate rate cards are not allowed for the same route, suite type, and start date.")
      }
      incomingRateCardKeys.add(businessKey)

      const existingRateCard = existingRateCardByBusinessKey.get(businessKey)
      if (!existingRateCard) {
        return rateCard
      }
      if (clientProvidedRateCardIds.has(existingRateCard.id) && rateCard.id !== existingRateCard.id) {
        return rateCard
      }
      return {
        ...rateCard,
        id: existingRateCard.id,
        created_at: existingRateCard.created_at,
      }
    })

    checkRateCardOverlaps(
      normalizedRateCards.map((rc) => ({
        rateTypeId: rc.rate_type_id,
        routeId: rc.route_id,
        suiteTypeId: rc.suite_type_id,
        validFrom: rc.valid_from,
        validTo: rc.valid_to,
      })),
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid supplier route structure" },
      { status: 409 },
    )
  }

  const existingRouteIds = new Set(existingDetail.routes.map((route) => route.id))
  const existingSuiteTypeIds = new Set(existingDetail.suiteTypes.map((suiteType) => suiteType.id))
  const existingEmailIds = new Set(existingDetail.emails.map((entry) => entry.id))
  const existingRateCardIds = new Set(existingDetail.rateCards.map((rateCard) => rateCard.id))

  const incomingRouteIds = new Set(normalizedRoutes.map((route) => route.id))
  const incomingSuiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))
  const incomingEmailIds = new Set(normalizedEmails.map((entry) => entry.id))
  const incomingRateCardIds = new Set(normalizedRateCards.map((rateCard) => rateCard.id))

  const routeIdsToDelete = existingDetail.routes
    .map((route) => route.id)
    .filter((routeId) => !incomingRouteIds.has(routeId))
  const routeIdsToDeleteSet = new Set(routeIdsToDelete)
  // Manual suppliers keep their untouched rate_cards rows regardless of what the diff would
  // otherwise flag as "no longer incoming" -- the only exception is a route actually being
  // deleted, whose rate cards must go too (rate_cards.route_id has no ON DELETE CASCADE).
  // A route-agnostic card outlives any single route, so only routed cards follow a deleted route.
  const followsDeletedRoute = (rateCard: { route_id: string | null }) =>
    rateCard.route_id !== null && routeIdsToDeleteSet.has(rateCard.route_id)
  const rateCardIdsToDelete = isManualPricingSupplier
    ? existingDetail.rateCards.filter(followsDeletedRoute).map((rateCard) => rateCard.id)
    : Array.from(
        new Set(
          existingDetail.rateCards
            .filter(
              (rateCard) => !incomingRateCardIds.has(rateCard.id) || followsDeletedRoute(rateCard),
            )
            .map((rateCard) => rateCard.id),
        ),
      )
  const suiteTypeIdsToDelete = existingDetail.suiteTypes
    .map((suiteType) => suiteType.id)
    .filter((suiteTypeId) => !incomingSuiteTypeIds.has(suiteTypeId))
  const emailIdsToDelete = existingDetail.emails
    .map((entry) => entry.id)
    .filter((entryId) => !incomingEmailIds.has(entryId))
  const incomingStationAddressIds = new Set(normalizedStationAddresses.map((station) => station.id))
  // Non-train saves never diff stations, so nothing is ever queued for deletion for them.
  const stationAddressIdsToDelete = supplierUsesStations
    ? existingDetail.stationAddresses
        .map((station) => station.id)
        .filter((stationId) => !incomingStationAddressIds.has(stationId))
    : []

  const [
    conflictingRouteIds,
    conflictingSuiteTypeIds,
    conflictingEmailIds,
    conflictingRateCardIds,
  ] = await Promise.all([
    Promise.resolve(
      normalizedRoutes
        .map((route) => route.id)
        .filter((routeId) => !existingRouteIds.has(routeId)),
    ),
    Promise.resolve(
      normalizedSuiteTypes
        .map((suiteType) => suiteType.id)
        .filter((suiteTypeId) => !existingSuiteTypeIds.has(suiteTypeId)),
    ),
    Promise.resolve(
      normalizedEmails
        .map((entry) => entry.id)
        .filter((entryId) => !existingEmailIds.has(entryId)),
    ),
    Promise.resolve(
      normalizedRateCards
        .map((rateCard) => rateCard.id)
        .filter((rateCardId) => !existingRateCardIds.has(rateCardId)),
    ),
  ])

  if (
    new Set(conflictingRouteIds).size !== conflictingRouteIds.length ||
    new Set(conflictingSuiteTypeIds).size !== conflictingSuiteTypeIds.length ||
    new Set(conflictingEmailIds).size !== conflictingEmailIds.length ||
    new Set(conflictingRateCardIds).size !== conflictingRateCardIds.length
  ) {
    return NextResponse.json(
      { error: "One or more supplier records could not be updated safely." },
      { status: 400 },
    )
  }

  const dependencyChecks = await checkDeletionDependencies(
    supabase,
    routeIdsToDelete,
    suiteTypeIdsToDelete,
  )

  if (dependencyChecks.length > 0) {
    return NextResponse.json(
      {
        error: "Cannot remove items that are still referenced by active bookings.",
        details: dependencyChecks,
      },
      { status: 409 },
    )
  }

  // Station rows are replaced delete-then-upsert further down, and the writes are not in one
  // transaction -- an unknown location_id reaching the upsert would raise an FK violation *after*
  // the delete had already run, leaving the supplier with no station addresses at all. Reject the
  // whole save here, before anything is written.
  if (normalizedStationAddresses.length > 0) {
    const stationLocationIds = [
      ...new Set(normalizedStationAddresses.map((station) => station.location_id)),
    ]
    const { data: knownLocations, error: stationLocationsError } = await supabase
      .from("locations")
      .select("id")
      .in("id", stationLocationIds)

    if (stationLocationsError) {
      logSupplierMutationError("station-addresses-location-check", supplierId, stationLocationsError)
      return NextResponse.json(
        { error: "Failed to validate supplier station addresses" },
        { status: 500 },
      )
    }

    const knownLocationIds = new Set((knownLocations ?? []).map((location) => location.id))
    if (stationLocationIds.some((locationId) => !knownLocationIds.has(locationId))) {
      return NextResponse.json(
        { error: "A station address references a city that no longer exists." },
        { status: 400 },
      )
    }
  }

  // Omitting the key leaves the current link alone; sending null unlinks and keeps the last
  // mirrored contacts as this record's own.
  const nextParentSupplierId =
    parsed.parentSupplierId === undefined
      ? existingDetail.supplier.parent_supplier_id
      : parsed.parentSupplierId

  if (nextParentSupplierId) {
    if (nextParentSupplierId === supplierId) {
      return NextResponse.json(
        { error: "A supplier cannot inherit its contacts from itself." },
        { status: 400 },
      )
    }

    const { data: parentSupplier, error: parentError } = await supabase
      .from("suppliers")
      .select("id, name, kind, parent_supplier_id")
      .eq("id", nextParentSupplierId)
      .maybeSingle()

    if (parentError) {
      return NextResponse.json({ error: "Failed to update supplier" }, { status: 500 })
    }
    if (!parentSupplier) {
      return NextResponse.json(
        { error: "The supplier you linked to no longer exists." },
        { status: 400 },
      )
    }
    if (parentSupplier.parent_supplier_id) {
      return NextResponse.json(
        { error: `${parentSupplier.name} already inherits its contacts from another supplier.` },
        { status: 400 },
      )
    }
    if (parentSupplier.kind === parsed.kind) {
      return NextResponse.json(
        { error: "Link a supplier to a record in a different category." },
        { status: 400 },
      )
    }
  }

  // While linked, contacts are a mirror of the parent's -- the database trigger overwrites them on
  // every write. The editor sends the inherited values straight back, which is fine; only a genuine
  // change is rejected, so the user is told rather than having their edit silently discarded.
  const isLinked = Boolean(nextParentSupplierId)
  const wasAlreadyLinked = existingDetail.supplier.parent_supplier_id === nextParentSupplierId
  if (isLinked && wasAlreadyLinked) {
    const submittedEmails = normalizedEmails.map((row) => `${row.label}:${row.email.toLowerCase()}`)
    const inheritedEmails = existingDetail.emails.map(
      (row) => `${row.label}:${row.email.toLowerCase()}`,
    )
    const contactChanged =
      (parsed.phone || null) !== existingDetail.supplier.phone ||
      (parsed.website || null) !== existingDetail.supplier.website ||
      submittedEmails.join("|") !== inheritedEmails.join("|")

    if (contactChanged) {
      return NextResponse.json(
        {
          error:
            "These contact details are inherited from a linked supplier. Edit them on that supplier, or unlink this one first.",
        },
        { status: 400 },
      )
    }
  }

  const nextActive = isDraftSave ? false : parsed.active
  const nextStatus = isDraftSave ? "draft" : nextActive ? "active" : "inactive"
  const supplierUpdatePayload = {
    name: parsed.name.trim(),
    kind: parsed.kind,
    pricing_mode: parsed.pricingMode,
    // Normalized here rather than trusted from the payload as-is: the DB enforces "transfers only"
    // via suppliers_transfer_pricing_basis_kind_check, and this keeps that constraint from ever
    // actually firing regardless of what a stale client form happens to submit for another kind.
    transfer_pricing_basis: parsed.kind === "transfers" ? parsed.transferPricingBasis : "per_vehicle",
    parent_supplier_id: nextParentSupplierId,
    // Written for unlinked records only -- for a linked one the trigger replaces these with the
    // parent's values, so submitting them here would be theatre.
    email: normalizedEmails[0]?.email ?? null,
    phone: parsed.phone || null,
    website: parsed.website || null,
    // Free text only carries meaning for train operators -- a train has no single city. Every
    // other kind resolves its printed city from location_id (see supplierLocationName).
    location: parsed.kind === "train_operator" ? parsed.location || null : null,
    street_address: parsed.streetAddress?.trim() || null,
    location_id: parsed.locationId ?? null,
    description: parsed.description?.trim() || null,
    notes: parsed.notes || null,
    single_supplement_pct: parsed.singleSupplementPct,
    infant_max_age: parsed.infantMaxAge ?? null,
    child_max_age: parsed.childMaxAge ?? null,
    default_time_start: parsed.defaultTimeStart ?? null,
    default_time_end: parsed.defaultTimeEnd ?? null,
    // The flat inclusions/exclusions arrays are no longer written from this route -- the tagged
    // supplier_inclusion_lines rows below are the editor's write path now. The columns stay as an
    // unread fallback (see lib/voucher/build-service-blocks.ts) so they are left alone here rather
    // than wiped on every save.
    long_journey_min_days: parsed.kind === "train_operator" ? parsed.longJourneyMinDays ?? null : null,
    train_only_note: parsed.kind === "train_operator" ? normalizeOptionalText(parsed.trainOnlyNote) : null,
    quote_suite_detail: parsed.kind === "train_operator" ? parsed.quoteSuiteDetail ?? "type_only" : "type_only",
    // Every kind may word its full suite/room phrase, not just trains -- see
    // lib/templates/suite-phrase-pattern.ts.
    suite_phrase_pattern: normalizeOptionalText(parsed.suitePhrasePattern),
    // A train operator always heads its own bookings; every other kind is opt-in, which is
    // how a hotel sold on its own (Kruger Shalati) reaches the New Enquiry supplier list.
    sells_standalone: parsed.sellsStandalone ?? parsed.kind === "train_operator",
    email_match_phrases: normalizeOptionalText(parsed.emailMatchPhrases),
    base_rate_type_id: requestedBaseRateTypeId,
    // Normalised: nominating the base rate is the same as nominating nothing.
    quote_rate_type_id: rateTiers.quoteRateTypeId,
    active: nextActive,
    status: nextStatus,
  }

  let supplierUpdateQuery = supabase.from("suppliers").update(supplierUpdatePayload).eq("id", supplierId)
  if (typeof expectedUpdatedAt === "string") {
    supplierUpdateQuery = supplierUpdateQuery.eq("updated_at", expectedUpdatedAt)
  }

  const { data: updatedSupplier, error: supplierUpdateError } = await supplierUpdateQuery
    .select("updated_at")
    .maybeSingle()

  if (supplierUpdateError) {
    logSupplierMutationError("supplier-update", supplierId, supplierUpdateError)
    // Renaming into an existing name+category+location now collides on the composite index; say so
    // rather than leaking a raw conflict.
    if (supplierUpdateError.code === "23505") {
      return NextResponse.json(
        { error: supplierConflictMessage(supplierUpdateError, parsed.name.trim(), parsed.kind) },
        { status: 409 },
      )
    }
    return (
      mapPostgrestError("suppliers/[slug]", supplierUpdateError) ??
      safeSupabaseError("suppliers/[slug]", supplierUpdateError, "Failed to update supplier")
    )
  }

  if (!updatedSupplier) {
    const { data: latestSupplierSnapshot } = await supabase
      .from("suppliers")
      .select("updated_at")
      .eq("id", supplierId)
      .maybeSingle()

    return staleVersionResponse(
      "supplier",
      latestSupplierSnapshot?.updated_at ?? existingDetail.supplier.updated_at,
    )
  }

  // Outgoing email rows go first, before the upsert that replaces them. Deleting afterwards meant
  // that dropping a row and re-adding the same address in one save collided with
  // supplier_emails_supplier_id_email_unique_idx (supplier_id, lower(email)) while the old row was
  // still there -- a 500 raised *after* the suppliers row above had already been written. Nothing
  // references supplier_emails, so delete-then-insert is safe.
  // A linked record's email rows are maintained by the parent-propagation trigger, so this route
  // leaves them alone entirely -- writing here would only be overwritten on the next parent save.
  if (!isLinked && emailIdsToDelete.length > 0) {
    const { error: deleteEmailsError } = await deleteInChunks(
      supabase,
      "supplier_emails",
      emailIdsToDelete,
    )

    if (deleteEmailsError) {
      logSupplierMutationError("supplier-emails-delete", supplierId, deleteEmailsError)
      return NextResponse.json(
        { error: "Failed to remove old supplier emails" },
        { status: 500 },
      )
    }
  }

  if (!isLinked && normalizedEmails.length > 0) {
    const { error: supplierEmailsUpsertError } = await supabase
      .from("supplier_emails")
      .upsert(normalizedEmails, { onConflict: "id" })

    if (supplierEmailsUpsertError) {
      logSupplierMutationError("supplier-emails-upsert", supplierId, supplierEmailsUpsertError)
      // A duplicate address that survived the payload dedupe above is the user's mistake, not a
      // server fault -- name it instead of leaking a raw Postgres conflict as a 500, the same way
      // the rate-card upsert below maps its own 23505.
      if (supplierEmailsUpsertError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "That email address is already listed on this supplier. Remove the duplicate row and save again.",
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: "Failed to update supplier emails" },
        { status: 500 },
      )
    }
  }

  // Replace the tagged inclusion/exclusion rows wholesale (delete-then-upsert, same convention as
  // supplier_emails above). sort_order is each row's position within its own list on the wire --
  // the client sends inclusions and exclusions as two ordered arrays, so it is recomputed here per
  // list rather than trusted from the payload.
  {
    const listCounters: Record<"inclusions" | "exclusions", number> = { inclusions: 0, exclusions: 0 }
    const normalizedInclusionLines = parsed.inclusionLines
      .filter((line) => line.text.trim().length > 0)
      .map((line) => ({
        id: line.id ?? makeUuid(),
        supplier_id: supplierId,
        list: line.list,
        kind: line.kind,
        text: line.text.trim(),
        journey_tag: line.journeyTag ?? null,
        rate_tag: line.rateTag ?? null,
        sort_order: listCounters[line.list]++,
      }))

    const existingInclusionLineIds = new Set(existingDetail.inclusionLines.map((row) => row.id))
    const incomingInclusionLineIds = new Set(normalizedInclusionLines.map((row) => row.id))
    const inclusionLineIdsToDelete = [...existingInclusionLineIds].filter(
      (id) => !incomingInclusionLineIds.has(id),
    )

    if (inclusionLineIdsToDelete.length > 0) {
      const { error: deleteInclusionLinesError } = await deleteInChunks(
        supabase,
        "supplier_inclusion_lines",
        inclusionLineIdsToDelete,
      )
      if (deleteInclusionLinesError) {
        logSupplierMutationError("supplier-inclusion-lines-delete", supplierId, deleteInclusionLinesError)
        return NextResponse.json(
          { error: "Failed to remove old supplier inclusion lines" },
          { status: 500 },
        )
      }
    }

    if (normalizedInclusionLines.length > 0) {
      const { error: inclusionLinesUpsertError } = await supabase
        .from("supplier_inclusion_lines")
        .upsert(normalizedInclusionLines, { onConflict: "id" })

      if (inclusionLinesUpsertError) {
        logSupplierMutationError("supplier-inclusion-lines-upsert", supplierId, inclusionLinesUpsertError)
        return NextResponse.json(
          { error: "Failed to update supplier inclusion lines" },
          { status: 500 },
        )
      }
    }
  }

  // Upsert vocabulary tables BEFORE suite_types so the M:N joins can resolve.
  if (normalizedBedroomTypes.length > 0) {
    const { error: bedroomTypesError } = await supabase
      .from("bedroom_types")
      .upsert(
        normalizedBedroomTypes.map(({ id, supplier_id, name, sort_order, archived_at }) => ({
          id,
          supplier_id,
          name,
          sort_order,
          archived_at,
        })),
        { onConflict: "id" },
      )
    if (bedroomTypesError) {
      logSupplierMutationError("bedroom-types-upsert", supplierId, bedroomTypesError)
      return NextResponse.json(
        { error: "Failed to update bedroom types" },
        { status: 500 },
      )
    }
  }
  if (normalizedBedroomLayouts.length > 0) {
    const { error: bedroomLayoutsError } = await supabase
      .from("bedroom_layouts")
      .upsert(
        normalizedBedroomLayouts.map(({ id, supplier_id, name, sort_order, archived_at }) => ({
          id,
          supplier_id,
          name,
          sort_order,
          archived_at,
        })),
        { onConflict: "id" },
      )
    if (bedroomLayoutsError) {
      logSupplierMutationError("bedroom-layouts-upsert", supplierId, bedroomLayoutsError)
      return NextResponse.json(
        { error: "Failed to update bedroom layouts" },
        { status: 500 },
      )
    }
  }
  if (normalizedBathroomTypes.length > 0) {
    const { error: bathroomTypesError } = await supabase
      .from("bathroom_types")
      .upsert(
        normalizedBathroomTypes.map(({ id, supplier_id, name, sort_order, archived_at }) => ({
          id,
          supplier_id,
          name,
          sort_order,
          archived_at,
        })),
        { onConflict: "id" },
      )
    if (bathroomTypesError) {
      logSupplierMutationError("bathroom-types-upsert", supplierId, bathroomTypesError)
      return NextResponse.json(
        { error: "Failed to update bathroom types" },
        { status: 500 },
      )
    }
  }

  if (normalizedSuiteTypes.length > 0) {
    const suiteTypeRowsForUpsert = normalizedSuiteTypes.map((suiteType) => ({
      id: suiteType.id,
      supplier_id: suiteType.supplier_id,
      name: suiteType.name,
      passenger_capacity: suiteType.passenger_capacity,
      luggage_capacity: suiteType.luggage_capacity,
      description: suiteType.description,
      active: suiteType.active,
      sort_order: suiteType.sort_order,
      created_at: suiteType.created_at,
      updated_at: suiteType.updated_at,
    }))
    const { error: suiteTypesError } = await supabase
      .from("suite_types")
      .upsert(suiteTypeRowsForUpsert, { onConflict: "id" })

    if (suiteTypesError) {
      logSupplierMutationError("suite-types-upsert", supplierId, suiteTypesError)
      return NextResponse.json(
        { error: "Failed to update supplier suite types" },
        { status: 500 },
      )
    }

    // Replace M:N memberships for each suite type (delete then insert).
    const suiteTypeIds = normalizedSuiteTypes.map((suiteType) => suiteType.id)
    const [
      { error: deleteBedroomTypeLinksError },
      { error: deleteBedroomLayoutLinksError },
      { error: deleteBathroomTypeLinksError },
    ] = await Promise.all([
      supabase.from("suite_type_bedroom_types").delete().in("suite_type_id", suiteTypeIds),
      supabase.from("suite_type_bedroom_layouts").delete().in("suite_type_id", suiteTypeIds),
      supabase.from("suite_type_bathroom_types").delete().in("suite_type_id", suiteTypeIds),
    ])

    const deleteLinksError =
      deleteBedroomTypeLinksError ?? deleteBedroomLayoutLinksError ?? deleteBathroomTypeLinksError
    if (deleteLinksError) {
      logSupplierMutationError("suite-type-variant-links-delete", supplierId, deleteLinksError)
      return NextResponse.json(
        { error: "Failed to update suite type variants" },
        { status: 500 },
      )
    }

    const bedroomTypeLinks = normalizedSuiteTypes.flatMap((suiteType) =>
      suiteType.bedroomTypeIds
        .filter((id) => allowedBedroomTypeIds.has(id))
        .map((id) => ({ suite_type_id: suiteType.id, bedroom_type_id: id })),
    )
    const bedroomLayoutLinks = normalizedSuiteTypes.flatMap((suiteType) =>
      suiteType.bedroomLayoutIds
        .filter((id) => allowedBedroomLayoutIds.has(id))
        .map((id) => ({ suite_type_id: suiteType.id, bedroom_layout_id: id })),
    )
    const bathroomTypeLinks = normalizedSuiteTypes.flatMap((suiteType) =>
      suiteType.bathroomTypeIds
        .filter((id) => allowedBathroomTypeIds.has(id))
        .map((id) => ({ suite_type_id: suiteType.id, bathroom_type_id: id })),
    )

    if (bedroomTypeLinks.length > 0) {
      const { error: bedroomTypeLinksError } = await supabase
        .from("suite_type_bedroom_types")
        .insert(bedroomTypeLinks)
      if (bedroomTypeLinksError) {
        logSupplierMutationError("suite-type-bedroom-types-insert", supplierId, bedroomTypeLinksError)
        return NextResponse.json(
          { error: "Failed to update suite type bedroom types" },
          { status: 500 },
        )
      }
    }
    if (bedroomLayoutLinks.length > 0) {
      const { error: bedroomLayoutLinksError } = await supabase
        .from("suite_type_bedroom_layouts")
        .insert(bedroomLayoutLinks)
      if (bedroomLayoutLinksError) {
        logSupplierMutationError("suite-type-bedroom-layouts-insert", supplierId, bedroomLayoutLinksError)
        return NextResponse.json(
          { error: "Failed to update suite type bedroom layouts" },
          { status: 500 },
        )
      }
    }
    if (bathroomTypeLinks.length > 0) {
      const { error: bathroomTypeLinksError } = await supabase
        .from("suite_type_bathroom_types")
        .insert(bathroomTypeLinks)
      if (bathroomTypeLinksError) {
        logSupplierMutationError("suite-type-bathroom-types-insert", supplierId, bathroomTypeLinksError)
        return NextResponse.json(
          { error: "Failed to update suite type bathroom types" },
          { status: 500 },
        )
      }
    }
  }

  if (normalizedRoutes.length > 0) {
    const { error: routesError } = await supabase
      .from("routes")
      .upsert(normalizedRoutes, { onConflict: "id" })

    if (routesError) {
      logSupplierMutationError("routes-upsert", supplierId, routesError)
      return NextResponse.json(
        { error: "Failed to update supplier routes" },
        { status: 500 },
      )
    }
  }

  // Removed stations go first: moving a city's station to a fresh row would otherwise collide with
  // the outgoing row on the (supplier_id, location_id) unique index before the delete could run.
  if (stationAddressIdsToDelete.length > 0) {
    const { error: deleteStationAddressesError } = await deleteInChunks(
      supabase,
      "supplier_station_addresses",
      stationAddressIdsToDelete,
    )

    if (deleteStationAddressesError) {
      logSupplierMutationError("station-addresses-delete", supplierId, deleteStationAddressesError)
      return NextResponse.json(
        { error: "Failed to remove old supplier station addresses" },
        { status: 500 },
      )
    }
  }

  if (normalizedStationAddresses.length > 0) {
    const { error: stationAddressesError } = await supabase
      .from("supplier_station_addresses")
      .upsert(normalizedStationAddresses, { onConflict: "id" })

    if (stationAddressesError) {
      logSupplierMutationError("station-addresses-upsert", supplierId, stationAddressesError)
      if (stationAddressesError.code === "23505") {
        return NextResponse.json(
          { error: "Each city may only have one station address for this supplier." },
          { status: 409 },
        )
      }
      // Belt and braces for the pre-flight check above: a city deleted between that read and this
      // write still lands here rather than as an opaque 500.
      if (stationAddressesError.code === "23503") {
        return NextResponse.json(
          { error: "A station address references a city that no longer exists." },
          { status: 400 },
        )
      }
      return NextResponse.json(
        { error: "Failed to update supplier station addresses" },
        { status: 500 },
      )
    }
  }

  if (parsed.kind === "vehicle_rental") {
    if (normalizedVehicleRentalDetails.length > 0) {
      const { error: vehicleRentalDetailsError } = await supabase
        .from("vehicle_rental_route_details")
        .upsert(normalizedVehicleRentalDetails, { onConflict: "route_id" })

      if (vehicleRentalDetailsError) {
        logSupplierMutationError("vehicle-rental-details-upsert", supplierId, vehicleRentalDetailsError)
        return NextResponse.json(
          { error: "Failed to update vehicle rental route details" },
          { status: 500 },
        )
      }
    }
  } else {
    const routeIdsForSupplier = existingDetail.routes.map((route) => route.id)
    if (routeIdsForSupplier.length > 0) {
      const { error: deleteRentalDetailsError } = await supabase
        .from("vehicle_rental_route_details")
        .delete()
        .in("route_id", routeIdsForSupplier)

      if (deleteRentalDetailsError) {
        logSupplierMutationError("vehicle-rental-details-delete", supplierId, deleteRentalDetailsError)
        return NextResponse.json(
          { error: "Failed to remove vehicle rental route details" },
          { status: 500 },
        )
      }
    }
  }

  if (normalizedRateCards.length > 0) {
    const { error: rateCardsError } = await supabase
      .from("rate_cards")
      .upsert(normalizedRateCards, { onConflict: "id" })

    if (rateCardsError) {
      logSupplierMutationError("rate-cards-upsert", supplierId, rateCardsError)
      if (rateCardsError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "A duplicate rate card exists for the same route, suite type, and start date. Update the existing one instead.",
          },
          { status: 409 },
        )
      }
      if (rateCardsError.code === "23P01") {
        return NextResponse.json(
          {
            error:
              "Overlapping rate card periods are not allowed for the same route and suite type.",
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: "Failed to update supplier rate cards" },
        { status: 500 },
      )
    }
  }

  if (rateCardIdsToDelete.length > 0) {
    const { error: deleteRateCardsError } = await deleteInChunks(
      supabase,
      "rate_cards",
      rateCardIdsToDelete,
    )

    if (deleteRateCardsError) {
      logSupplierMutationError("rate-cards-delete", supplierId, deleteRateCardsError)
      return NextResponse.json(
        { error: "Failed to remove old supplier rate cards" },
        { status: 500 },
      )
    }
  }

  if (routeIdsToDelete.length > 0) {
    const { error: deleteRoutesError } = await deleteInChunks(
      supabase,
      "routes",
      routeIdsToDelete,
    )

    if (deleteRoutesError) {
      logSupplierMutationError("routes-delete", supplierId, deleteRoutesError)
      return NextResponse.json(
        { error: "Failed to remove old supplier routes" },
        { status: 500 },
      )
    }
  }

  if (suiteTypeIdsToDelete.length > 0) {
    const { error: deleteSuiteTypesError } = await deleteInChunks(
      supabase,
      "suite_types",
      suiteTypeIdsToDelete,
    )

    if (deleteSuiteTypesError) {
      logSupplierMutationError("suite-types-delete", supplierId, deleteSuiteTypesError)
      return NextResponse.json(
        { error: "Failed to remove old supplier suite types" },
        { status: 500 },
      )
    }
  }

  // Delete removed vocabulary rows at the end (cascade removes any leftover join rows).
  const incomingBedroomTypeIds = new Set(normalizedBedroomTypes.map((row) => row.id))
  const incomingBedroomLayoutIds = new Set(normalizedBedroomLayouts.map((row) => row.id))
  const incomingBathroomTypeIds = new Set(normalizedBathroomTypes.map((row) => row.id))

  const bedroomTypeIdsToDelete = existingDetail.bedroomTypes
    .map((row) => row.id)
    .filter((id) => !incomingBedroomTypeIds.has(id))
  const bedroomLayoutIdsToDelete = existingDetail.bedroomLayouts
    .map((row) => row.id)
    .filter((id) => !incomingBedroomLayoutIds.has(id))
  const bathroomTypeIdsToDelete = existingDetail.bathroomTypes
    .map((row) => row.id)
    .filter((id) => !incomingBathroomTypeIds.has(id))

  if (bedroomTypeIdsToDelete.length > 0) {
    const { error } = await deleteInChunks(supabase, "bedroom_types", bedroomTypeIdsToDelete)
    if (error) {
      logSupplierMutationError("bedroom-types-delete", supplierId, error)
      return NextResponse.json(
        { error: "Failed to remove bedroom types" },
        { status: 500 },
      )
    }
  }
  if (bedroomLayoutIdsToDelete.length > 0) {
    const { error } = await deleteInChunks(supabase, "bedroom_layouts", bedroomLayoutIdsToDelete)
    if (error) {
      logSupplierMutationError("bedroom-layouts-delete", supplierId, error)
      return NextResponse.json(
        { error: "Failed to remove bedroom layouts" },
        { status: 500 },
      )
    }
  }
  if (bathroomTypeIdsToDelete.length > 0) {
    const { error } = await deleteInChunks(supabase, "bathroom_types", bathroomTypeIdsToDelete)
    if (error) {
      logSupplierMutationError("bathroom-types-delete", supplierId, error)
      return NextResponse.json(
        { error: "Failed to remove bathroom types" },
        { status: 500 },
      )
    }
  }

  // Sync per-supplier rate adjustments (applicable rates + markdown vs default).
  {
    const incoming = new Map<string, number>()
    for (const adjustment of parsed.rateAdjustments ?? []) {
      incoming.set(adjustment.rateTypeId, adjustment.discountPct)
    }
    const incomingRateTypeIds = [...incoming.keys()]

    if (incomingRateTypeIds.length > 0) {
      const archivedAdjustmentId = incomingRateTypeIds.find((id) => !activeRateTypeIds.has(id))
      if (archivedAdjustmentId) {
        return NextResponse.json(
          { error: "Each rate adjustment must reference an active rate type." },
          { status: 400 },
        )
      }
    }

    let deleteAdjustmentsQuery = supabase
      .from("supplier_rate_adjustments")
      .delete()
      .eq("supplier_id", supplierId)
    if (incomingRateTypeIds.length > 0) {
      deleteAdjustmentsQuery = deleteAdjustmentsQuery.not(
        "rate_type_id",
        "in",
        `(${incomingRateTypeIds.join(",")})`,
      )
    }
    const { error: deleteAdjustmentsError } = await deleteAdjustmentsQuery
    if (deleteAdjustmentsError) {
      logSupplierMutationError("rate-adjustments-delete", supplierId, deleteAdjustmentsError)
      return NextResponse.json(
        { error: "Failed to update supplier rate adjustments" },
        { status: 500 },
      )
    }

    if (incomingRateTypeIds.length > 0) {

      const now = new Date().toISOString()
      const { error: upsertAdjustmentsError } = await supabase
        .from("supplier_rate_adjustments")
        .upsert(
          incomingRateTypeIds.map((rateTypeId) => ({
            supplier_id: supplierId,
            rate_type_id: rateTypeId,
            discount_pct: incoming.get(rateTypeId) ?? 0,
            updated_at: now,
          })),
          { onConflict: "supplier_id,rate_type_id" },
        )
      if (upsertAdjustmentsError) {
        logSupplierMutationError("rate-adjustments-upsert", supplierId, upsertAdjustmentsError)
        return NextResponse.json(
          { error: "Failed to update supplier rate adjustments" },
          { status: 500 },
        )
      }
    }
  }

  const updatedDetail = await loadSupplierDetail(supabase, slug)
  if ("error" in updatedDetail) {
    return updatedDetail.error!
  }

  return NextResponse.json(
    mapSupplierDetail(
      updatedDetail.supplier,
      updatedDetail.suiteTypes,
      updatedDetail.emails,
      updatedDetail.routes,
      updatedDetail.rateCards,
      updatedDetail.locations,
      updatedDetail.vehicleRentalRouteDetails,
      {
        bedroomTypes: updatedDetail.bedroomTypes,
        bedroomLayouts: updatedDetail.bedroomLayouts,
        bathroomTypes: updatedDetail.bathroomTypes,
        suiteTypeBedroomTypes: updatedDetail.suiteTypeBedroomTypes,
        suiteTypeBedroomLayouts: updatedDetail.suiteTypeBedroomLayouts,
        suiteTypeBathroomTypes: updatedDetail.suiteTypeBathroomTypes,
        rateTypes: updatedDetail.rateTypes,
        rateAdjustments: updatedDetail.rateAdjustments,
        stationAddresses: updatedDetail.stationAddresses,
        inclusionLines: updatedDetail.inclusionLines,
        parentSupplier: updatedDetail.parentSupplier,
      },
    ),
  )
}
