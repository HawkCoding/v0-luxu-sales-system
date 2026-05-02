import { NextResponse } from "next/server"
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

interface StaleVersionConflictPayload {
  error: string
  code: "STALE_VERSION"
  currentUpdatedAt: string
}

interface NormalizedRoute {
  id: string
  supplier_id: string
  name: string
  origin_location_id: string | null
  destination_location_id: string | null
  transport_service_type: "transfer" | "rental" | null
  pickup_point: string | null
  dropoff_point: string | null
  included_km_per_day: number | null
  extra_km_price: number | null
  security_deposit: number | null
  one_way_fee: number | null
  active: boolean
  created_at: string
  updated_at: string
}

interface NormalizedRateCard {
  id: string
  route_id: string
  suite_type_id: string
  price_per_person: number
  child_price: number | null
  infant_price: number | null
  currency: string
  valid_from: string
  valid_to: string | null
  created_at: string
}

interface RateCardDateRangeDetails {
  validFrom: string
  validTo: string | null
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
  valid_from: string
}) {
  return [rateCard.route_id, rateCard.suite_type_id, rateCard.valid_from].join("|")
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeOptionalUuid(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function areRateCardDateRangesOverlapping(
  firstRange: RateCardDateRangeDetails,
  secondRange: RateCardDateRangeDetails,
) {
  const firstStartsBeforeSecondEnds =
    !secondRange.validTo || firstRange.validFrom <= secondRange.validTo
  const secondStartsBeforeFirstEnds =
    !firstRange.validTo || secondRange.validFrom <= firstRange.validTo
  return firstStartsBeforeSecondEnds && secondStartsBeforeFirstEnds
}

function checkRateCardOverlaps(rateCards: NormalizedRateCard[]) {
  const groupedRateCards = new Map<string, NormalizedRateCard[]>()

  for (const rateCard of rateCards) {
    const groupKey = [rateCard.route_id, rateCard.suite_type_id].join("|")
    const nextGroup = groupedRateCards.get(groupKey) ?? []
    nextGroup.push(rateCard)
    groupedRateCards.set(groupKey, nextGroup)
  }

  for (const groupedCardSet of groupedRateCards.values()) {
    const sortedRateCards = [...groupedCardSet].sort((a, b) =>
      a.valid_from.localeCompare(b.valid_from),
    )

    for (let index = 0; index < sortedRateCards.length; index += 1) {
      const firstCard = sortedRateCards[index]
      for (let compareIndex = index + 1; compareIndex < sortedRateCards.length; compareIndex += 1) {
        const secondCard = sortedRateCards[compareIndex]
        if (
          areRateCardDateRangesOverlapping(
            { validFrom: firstCard.valid_from, validTo: firstCard.valid_to },
            { validFrom: secondCard.valid_from, validTo: secondCard.valid_to },
          )
        ) {
          throw new Error("Overlapping rate card periods are not allowed for the same route and suite type.")
        }
      }
    }
  }
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
    const staleVersionConflict: StaleVersionConflictPayload = {
      error:
        "This supplier was modified by another user since you started editing. Please refresh and try again.",
      code: "STALE_VERSION",
      currentUpdatedAt: existingDetail.supplier.updated_at,
    }
    return NextResponse.json(staleVersionConflict, { status: 409 })
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
  const normalizedSuiteTypes = parsed.suiteTypes
    .map((suiteType) => ({
      id: suiteType.id ?? makeUuid(),
      supplier_id: supplierId,
      name: suiteType.name.trim(),
      passenger_capacity: parsed.kind === "transfers" ? (suiteType.passengerCapacity ?? null) : null,
      luggage_capacity: parsed.kind === "transfers" ? (suiteType.luggageCapacity ?? null) : null,
      description: parsed.kind === "transfers" ? normalizeOptionalText(suiteType.description) : null,
      active: suiteType.active,
      created_at: now,
      updated_at: now,
    }))
    .filter((suiteType) => !isDraftSave || suiteType.name.length > 0)

  const normalizedRoutes: NormalizedRoute[] = parsed.routes
    .map((route) => ({
      id: route.id ?? makeUuid(),
      supplier_id: supplierId,
      name: route.name.trim(),
      origin_location_id: parsed.kind === "transfers" ? null : normalizeOptionalUuid(route.originLocationId),
      destination_location_id: parsed.kind === "transfers" ? null : normalizeOptionalUuid(route.destinationLocationId),
      transport_service_type: parsed.kind === "transfers" ? (route.transportServiceType ?? "transfer") : null,
      pickup_point: parsed.kind === "transfers" ? normalizeOptionalText(route.pickupPoint) : null,
      dropoff_point: parsed.kind === "transfers" ? normalizeOptionalText(route.dropoffPoint) : null,
      included_km_per_day:
        parsed.kind === "transfers" && route.transportServiceType === "rental"
          ? (route.includedKmPerDay ?? null)
          : null,
      extra_km_price:
        parsed.kind === "transfers" && route.transportServiceType === "rental"
          ? (route.extraKmPrice ?? null)
          : null,
      security_deposit:
        parsed.kind === "transfers" && route.transportServiceType === "rental"
          ? (route.securityDeposit ?? null)
          : null,
      one_way_fee:
        parsed.kind === "transfers" && route.transportServiceType === "rental"
          ? (route.oneWayFee ?? null)
          : null,
      active: route.active,
      created_at: now,
      updated_at: now,
    }))
    .filter((route) =>
      isDraftSave
        ? parsed.kind === "transfers"
          ? route.name.length > 0 && Boolean(route.pickup_point) && Boolean(route.dropoff_point)
          : route.name.length > 0 && Boolean(route.origin_location_id) && Boolean(route.destination_location_id)
        : true,
    )

  const routeIds = new Set(normalizedRoutes.map((route) => route.id))
  const suiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))
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
        .map((rateCard) => ({
          id: rateCard.id ?? makeUuid(),
          route_id: routeId,
          suite_type_id: rateCard.suiteTypeId,
          price_per_person: rateCard.pricePerPerson,
          child_price: parsed.kind === "transfers" ? null : rateCard.childPrice,
          infant_price: parsed.kind === "transfers" ? null : rateCard.infantPrice,
          currency: rateCard.currency.trim().toUpperCase() || "ZAR",
          valid_from: rateCard.validFrom,
          valid_to: normalizeNullableDate(rateCard.validTo),
          created_at: now,
        }))
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

    checkRateCardOverlaps(normalizedRateCards)
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

  const supplierUpdatePayload = {
    name: parsed.name.trim(),
    kind: parsed.kind,
    email: normalizedEmails[0]?.email ?? null,
    phone: parsed.phone || null,
    website: parsed.website || null,
    location: parsed.location || null,
    location_id: parsed.locationId ?? null,
    notes: parsed.notes || null,
    single_supplement_pct: parsed.singleSupplementPct,
    active: isDraftSave ? false : parsed.active,
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

    const staleVersionConflict: StaleVersionConflictPayload = {
      error:
        "This supplier was modified by another user since you started editing. Please refresh and try again.",
      code: "STALE_VERSION",
      currentUpdatedAt: latestSupplierSnapshot?.updated_at ?? existingDetail.supplier.updated_at,
    }
    return NextResponse.json(staleVersionConflict, { status: 409 })
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

  if (normalizedSuiteTypes.length > 0) {
    const { error: suiteTypesError } = await supabase
      .from("suite_types")
      .upsert(normalizedSuiteTypes, { onConflict: "id" })

    if (suiteTypesError) {
      logSupplierMutationError("suite-types-upsert", supplierId, suiteTypesError)
      return NextResponse.json(
        { error: "Failed to update supplier suite types" },
        { status: 500 },
      )
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
    ),
  )
}
