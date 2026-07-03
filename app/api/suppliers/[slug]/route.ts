import { NextResponse } from "next/server"
import { staleVersionResponse } from "@/lib/concurrency"
import { mapSupplierDetail } from "@/lib/suppliers"
import {
  allowedRoles,
  checkDeletionDependencies,
  deleteInChunks,
  loadSupplierDetail,
  makeUuid,
  normalizeNullableDate,
  requireAuthenticatedUser,
  type SessionClient,
} from "../helpers"
import {
  supplierDraftSaveSchema,
  supplierSaveSchema,
  type SupplierDraftSaveInput,
  type SupplierSaveInput,
} from "../schemas"
import { getSupplierVocabulary, isTransportSupplier } from "@/lib/types"
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
  route_id: string
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
  route_id: string
  suite_type_id: string
  rate_type_id: string
  valid_from: string
}) {
  return [rateCard.rate_type_id, rateCard.route_id, rateCard.suite_type_id, rateCard.valid_from].join("|")
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
        kindDefaultRateTypes: detail.kindDefaultRateTypes,
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

  if (profileError || !profile || profile.clearance_level !== "admin") {
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
  try {
    const body = await req.json()
    parsed = isDraftSave ? supplierDraftSaveSchema.parse(body) : supplierSaveSchema.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existingDetail = await loadSupplierDetail(supabase, slug)
  if ("error" in existingDetail) {
    return existingDetail.error!
  }

  const supplierId = existingDetail.supplier.id
  const expectedUpdatedAt = parsed.expectedUpdatedAt
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== existingDetail.supplier.updated_at) {
    return staleVersionResponse("supplier", existingDetail.supplier.updated_at)
  }

  const parsedEmailRows = parsed.emails
    .map((entry) => ({
      id: entry.id ?? makeUuid(),
      supplier_id: supplierId,
      email: entry.email.trim(),
      label: entry.label.trim() || "General",
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

  const normalizedBedroomTypes = normalizeVariantList(parsed.bedroomTypes ?? [])
  const normalizedBedroomLayouts = normalizeVariantList(parsed.bedroomLayouts ?? [])
  const normalizedBathroomTypes = normalizeVariantList(parsed.bathroomTypes ?? [])

  const allowedBedroomTypeIds = new Set(normalizedBedroomTypes.map((row) => row.id))
  const allowedBedroomLayoutIds = new Set(normalizedBedroomLayouts.map((row) => row.id))
  const allowedBathroomTypeIds = new Set(normalizedBathroomTypes.map((row) => row.id))

  // Train routes auto-fill their name from origin/destination + direction only when the client
  // sends an empty name; a user-provided name always wins. Other kinds keep their free-text name.
  const autoDeriveRouteName = parsed.kind === "train_operator"
  const locationNameById = new Map(existingDetail.locations.map((location) => [location.id, location.name]))

  // Kinds whose route editor has no location fields (hotels, tour operators)
  // must never persist location links — stray ids would invisibly block
  // location deletion.
  const routeUsesLocations = !isTransport && getSupplierVocabulary(parsed.kind).routeHasLocations

  const normalizedRoutes: NormalizedRoute[] = parsed.routes
    .map((route) => {
      const originLocationId = routeUsesLocations ? normalizeOptionalUuid(route.originLocationId) : null
      const destinationLocationId = routeUsesLocations ? normalizeOptionalUuid(route.destinationLocationId) : null
      const directionMode = route.directionMode ?? "one_way"
      const originName = originLocationId ? locationNameById.get(originLocationId) : undefined
      const destinationName = destinationLocationId ? locationNameById.get(destinationLocationId) : undefined
      const derivedName =
        autoDeriveRouteName && originName && destinationName
          ? buildRouteName(originName, destinationName, directionMode)
          : null
      return {
        id: route.id ?? makeUuid(),
        supplier_id: supplierId,
        name: route.name.trim() || (derivedName ?? ""),
        origin_location_id: originLocationId,
        destination_location_id: destinationLocationId,
        pickup_point: isTransport ? normalizeOptionalText(route.pickupPoint) : null,
        dropoff_point: isTransport ? normalizeOptionalText(route.dropoffPoint) : null,
        direction_mode: directionMode,
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
            : route.name.length > 0
        : true,
    )

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
  const defaultRateTypeId =
    (existingDetail.rateTypes ?? []).find((row) => row.is_default && !row.archived_at)?.id
    ?? (existingDetail.rateTypes ?? []).find((row) => !row.archived_at)?.id
    ?? null
  const existingRateCardByBusinessKey = new Map(
    existingDetail.rateCards.map((rateCard) => [getRateCardBusinessKey(rateCard), rateCard]),
  )
  const clientProvidedRateCardIds = new Set(
    parsed.routes.flatMap((route) => route.rateCards.flatMap((rateCard) => (rateCard.id ? [rateCard.id] : []))),
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

    normalizedRateCards = parsed.routes.flatMap((route) => {
      const routeId = route.id ?? normalizedRoutes.find((candidate) => candidate.name === route.name.trim())?.id
      if (!routeId || !routeIds.has(routeId)) {
        return []
      }

      return route.rateCards
        .map((rateCard) => {
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
            child_price: isTransport ? null : rateCard.childPrice,
            infant_price: isTransport ? null : rateCard.infantPrice,
            currency: rateCard.currency.trim().toUpperCase() || "ZAR",
            valid_from: rateCard.validFrom,
            valid_to: normalizeNullableDate(rateCard.validTo),
            created_at: now,
          }
        })
        .filter((rateCard) => {
          if (!isDraftSave) return true
          return (
            routeIds.has(rateCard.route_id) &&
            suiteTypeIds.has(rateCard.suite_type_id) &&
            rateCard.valid_from.length > 0
          )
        })
    })

    normalizedRateCards = normalizedRateCards.map((rateCard) => {
      if (!routeIds.has(rateCard.route_id)) {
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
  const rateCardIdsToDelete = Array.from(
    new Set(
      existingDetail.rateCards
        .filter(
          (rateCard) =>
            !incomingRateCardIds.has(rateCard.id) || routeIdsToDeleteSet.has(rateCard.route_id),
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

  const nextActive = isDraftSave ? false : parsed.active
  const nextStatus = isDraftSave ? "draft" : nextActive ? "active" : "inactive"
  const supplierUpdatePayload = {
    name: parsed.name.trim(),
    kind: parsed.kind,
    email: normalizedEmails[0]?.email ?? null,
    phone: parsed.phone || null,
    website: parsed.website || null,
    location: parsed.location || null,
    location_detail: parsed.locationDetail?.trim() || null,
    location_id: parsed.locationId ?? null,
    description: parsed.description?.trim() || null,
    notes: parsed.notes || null,
    single_supplement_pct: parsed.singleSupplementPct,
    infant_max_age: parsed.infantMaxAge ?? null,
    child_max_age: parsed.childMaxAge ?? null,
    default_time_start: parsed.defaultTimeStart ?? null,
    default_time_end: parsed.defaultTimeEnd ?? null,
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
    return NextResponse.json({ error: "Failed to update supplier" }, { status: 500 })
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

  if (normalizedEmails.length > 0) {
    const { error: supplierEmailsUpsertError } = await supabase
      .from("supplier_emails")
      .upsert(normalizedEmails, { onConflict: "id" })

    if (supplierEmailsUpsertError) {
      logSupplierMutationError("supplier-emails-upsert", supplierId, supplierEmailsUpsertError)
      return NextResponse.json(
        { error: "Failed to update supplier emails" },
        { status: 500 },
      )
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

  if (emailIdsToDelete.length > 0) {
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
        kindDefaultRateTypes: updatedDetail.kindDefaultRateTypes,
      },
    ),
  )
}
