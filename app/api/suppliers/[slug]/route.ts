import { NextResponse } from "next/server"
import { mapSupplierDetail } from "@/lib/suppliers"
import type { Database } from "@/lib/supabase/types"
import {
  allowedRoles,
  buildErrorResponse,
  checkDeletionDependencies,
  loadSupplierDetail,
  makeUuid,
  normalizeNullableDate,
  normalizeText,
  queryExistingIds,
  requireAuthenticatedUser,
} from "../helpers"
import {
  supplierDraftSaveSchema,
  supplierSaveSchema,
  type SupplierDraftSaveInput,
  type SupplierSaveInput,
} from "../schemas"

type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type SupplierEmailRow = Database["public"]["Tables"]["supplier_emails"]["Row"]

type NormalizedRateCard = Pick<
  RateCardRow,
  | "id"
  | "package_id"
  | "route_id"
  | "suite_type_id"
  | "price_per_person"
  | "currency"
  | "valid_from"
  | "valid_to"
  | "created_at"
>

interface RateCardConflictDetails {
  packageId: string
  suiteTypeId: string
  routeId: string | null
  validFrom: string
}

interface RateCardDateRangeDetails {
  validFrom: string
  validTo: string | null
}

interface RateCardOverlapConflictDetails {
  packageId: string
  suiteTypeId: string
  routeId: string | null
  firstRange: RateCardDateRangeDetails
  secondRange: RateCardDateRangeDetails
}

interface RateCardIdCollisionDetails {
  duplicateId: string
}

class DuplicateRateCardConflictError extends Error {
  details: RateCardConflictDetails

  constructor(details: RateCardConflictDetails) {
    super(
      "Duplicate rate cards are not allowed for the same package, suite type, route, and start date.",
    )
    this.name = "DuplicateRateCardConflictError"
    this.details = details
  }
}

class OverlappingRateCardConflictError extends Error {
  details: RateCardOverlapConflictDetails

  constructor(details: RateCardOverlapConflictDetails) {
    super(
      "Overlapping rate card periods are not allowed for the same package, suite type, and route.",
    )
    this.name = "OverlappingRateCardConflictError"
    this.details = details
  }
}

class RateCardIdCollisionError extends Error {
  details: RateCardIdCollisionDetails

  constructor(details: RateCardIdCollisionDetails) {
    super("Internal rate card ID collision detected. Please retry saving.")
    this.name = "RateCardIdCollisionError"
    this.details = details
  }
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

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function isDateString(value: string | null | undefined): value is string {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getRateCardBusinessKey(rateCard: {
  package_id: string
  suite_type_id: string
  route_id: string | null
  valid_from: string
}) {
  return [
    rateCard.package_id,
    rateCard.suite_type_id,
    rateCard.route_id ?? "__null__",
    rateCard.valid_from,
  ].join("|")
}

function areRateCardDateRangesOverlapping(
  firstRange: RateCardDateRangeDetails,
  secondRange: RateCardDateRangeDetails,
) {
  const firstStartsBeforeSecondEnds =
    !secondRange.validTo || firstRange.validFrom < secondRange.validTo
  const secondStartsBeforeFirstEnds =
    !firstRange.validTo || secondRange.validFrom < firstRange.validTo
  return firstStartsBeforeSecondEnds && secondStartsBeforeFirstEnds
}

function checkRateCardOverlaps(rateCards: NormalizedRateCard[]) {
  const groupedRateCards = new Map<string, NormalizedRateCard[]>()

  for (const rateCard of rateCards) {
    const groupKey = [
      rateCard.package_id,
      rateCard.suite_type_id,
      rateCard.route_id ?? "__null__",
    ].join("|")
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
        const overlapDetected = areRateCardDateRangesOverlapping(
          {
            validFrom: firstCard.valid_from,
            validTo: firstCard.valid_to,
          },
          {
            validFrom: secondCard.valid_from,
            validTo: secondCard.valid_to,
          },
        )
        if (!overlapDetected) {
          continue
        }

        throw new OverlappingRateCardConflictError({
          packageId: firstCard.package_id,
          suiteTypeId: firstCard.suite_type_id,
          routeId: firstCard.route_id ?? null,
          firstRange: {
            validFrom: firstCard.valid_from,
            validTo: firstCard.valid_to,
          },
          secondRange: {
            validFrom: secondCard.valid_from,
            validTo: secondCard.valid_to,
          },
        })
      }
    }
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { slug } = await params
  const detail = await loadSupplierDetail(auth.supabase, slug)
  if ("error" in detail) {
    return detail.error
  }

  return NextResponse.json(
    mapSupplierDetail(
      detail.supplier,
      detail.packages,
      detail.routes,
      detail.suiteTypes,
      detail.emails,
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
    return auth.error
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
    return detail.error
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

  const { data: packageRows, error: packageError } = await supabase
    .from("packages")
    .select("id")
    .eq("supplier_id", supplierId)

  if (packageError) {
    return NextResponse.json(
      { error: "Failed to validate supplier deletion" },
      { status: 500 },
    )
  }

  const packageIds = (packageRows ?? []).map((row) => row.id)

  if (packageIds.length > 0) {
    const { count: packageBookingCount, error: packageBookingError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("package_id", packageIds)
      .neq("stage", "closed")
      .neq("stage", "lost")

    if (packageBookingError) {
      return NextResponse.json(
        { error: "Failed to validate supplier deletion" },
        { status: 500 },
      )
    }

    if ((packageBookingCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "Cannot delete supplier with active bookings" },
        { status: 409 },
      )
    }

    const { data: routeRows, error: routeError } = await supabase
      .from("routes")
      .select("id")
      .in("package_id", packageIds)

    if (routeError) {
      return NextResponse.json(
        { error: "Failed to validate supplier deletion" },
        { status: 500 },
      )
    }

    const routeIds = (routeRows ?? []).map((row) => row.id)
    if (routeIds.length > 0) {
      const { count: routeBookingCount, error: routeBookingError } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("route_id", routeIds)
        .neq("stage", "closed")
        .neq("stage", "lost")

      if (routeBookingError) {
        return NextResponse.json(
          { error: "Failed to validate supplier deletion" },
          { status: 500 },
        )
      }

      if ((routeBookingCount ?? 0) > 0) {
        return NextResponse.json(
          { error: "Cannot delete supplier with active bookings" },
          { status: 409 },
        )
      }
    }
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
  const patchRequestStartedAt = performance.now()
  const phaseDurations = {
    authAndRoleMs: 0,
    payloadParseMs: 0,
    loadExistingMs: 0,
    normalizeValidateMs: 0,
    idValidationMs: 0,
    dbWritesMs: 0,
    loadUpdatedMs: 0,
  }
  const withPatchTimingHeaders = (response: NextResponse): NextResponse => {
    const totalMs = performance.now() - patchRequestStartedAt
    response.headers.set(
      "Server-Timing",
      [
        `auth;dur=${phaseDurations.authAndRoleMs.toFixed(1)}`,
        `parse;dur=${phaseDurations.payloadParseMs.toFixed(1)}`,
        `loadExisting;dur=${phaseDurations.loadExistingMs.toFixed(1)}`,
        `normalize;dur=${phaseDurations.normalizeValidateMs.toFixed(1)}`,
        `idValidation;dur=${phaseDurations.idValidationMs.toFixed(1)}`,
        `dbWrites;dur=${phaseDurations.dbWritesMs.toFixed(1)}`,
        `loadUpdated;dur=${phaseDurations.loadUpdatedMs.toFixed(1)}`,
        `total;dur=${totalMs.toFixed(1)}`,
      ].join(", "),
    )
    return response
  }

  const authAndRoleStartedAt = performance.now()
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    phaseDurations.authAndRoleMs = performance.now() - authAndRoleStartedAt
    return withPatchTimingHeaders(auth.error!)
  }

  const { supabase, user } = auth
  const { slug } = await params
  const isDraftSave = new URL(req.url).searchParams.get("draft") === "true"

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    phaseDurations.authAndRoleMs = performance.now() - authAndRoleStartedAt
    return withPatchTimingHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
  }
  phaseDurations.authAndRoleMs = performance.now() - authAndRoleStartedAt

  let parsed: SupplierSaveInput | SupplierDraftSaveInput
  const payloadParseStartedAt = performance.now()
  try {
    const body = await req.json()
    parsed = isDraftSave ? supplierDraftSaveSchema.parse(body) : supplierSaveSchema.parse(body)
  } catch {
    phaseDurations.payloadParseMs = performance.now() - payloadParseStartedAt
    return withPatchTimingHeaders(
      NextResponse.json({ error: "Invalid request payload" }, { status: 400 }),
    )
  }
  phaseDurations.payloadParseMs = performance.now() - payloadParseStartedAt

  const loadExistingStartedAt = performance.now()
  const existingDetail = await loadSupplierDetail(supabase, slug)
  if ("error" in existingDetail) {
    phaseDurations.loadExistingMs = performance.now() - loadExistingStartedAt
    return withPatchTimingHeaders(existingDetail.error!)
  }
  phaseDurations.loadExistingMs = performance.now() - loadExistingStartedAt
  const supplierId = existingDetail.supplier.id
  let normalizedEmails: Array<
    Pick<SupplierEmailRow, "id" | "supplier_id" | "email" | "label">
  > = []

  let normalizedSuiteTypes: Array<{
    id: string
    supplier_id: string
    name: string
    active: boolean
  }>
  let normalizedPackages: Array<
    PackageRow & {
      routes: Array<{
        id: string
        package_id: string
        name: string
        origin_location_id: string
        destination_location_id: string
        active: boolean
      }>
      rateCards: Array<RateCardRow>
    }
  >

  const normalizeValidateStartedAt = performance.now()
  try {
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
    normalizedEmails = emailCandidates.filter((entry) => {
      const normalizedKey = entry.email.toLowerCase()
      if (seenLowercaseEmails.has(normalizedKey)) {
        return false
      }
      seenLowercaseEmails.add(normalizedKey)
      return true
    })

    const existingRateCardByBusinessKey = new Map(
      existingDetail.rateCards.map((rateCard) => [getRateCardBusinessKey(rateCard), rateCard]),
    )
    const incomingRateCardKeys = new Set<string>()
    const clientProvidedRateCardIds = new Set<string>(
      parsed.packages.flatMap((pkg) =>
        pkg.rateCards.flatMap((rateCard) => (rateCard.id ? [rateCard.id] : [])),
      ),
    )

    normalizedSuiteTypes = parsed.suiteTypes.map((suiteType) => ({
      id: suiteType.id ?? makeUuid(),
      supplier_id: supplierId,
      name: suiteType.name.trim(),
      active: suiteType.active,
    }))
    const suiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))

    normalizedPackages = parsed.packages.map((pkg) => {
      const packageId = pkg.id ?? makeUuid()
      const normalizedRouteCandidates = pkg.routes.map((route) => ({
        id: route.id ?? makeUuid(),
        package_id: packageId,
        name: route.name.trim(),
        origin_location_id: route.originLocationId,
        destination_location_id: route.destinationLocationId,
        active: route.active,
      }))
      const normalizedRoutes = isDraftSave
        ? normalizedRouteCandidates.filter(
            (route) =>
              route.name.length > 0 &&
              isUuid(route.origin_location_id) &&
              isUuid(route.destination_location_id),
          )
        : normalizedRouteCandidates

      const routeIds = new Set(normalizedRoutes.map((route) => route.id))
      const normalizedRateCardCandidates = pkg.rateCards.map((rateCard) => ({
        id: rateCard.id ?? makeUuid(),
        package_id: packageId,
        route_id: rateCard.routeId,
        suite_type_id: rateCard.suiteTypeId,
        price_per_person: rateCard.pricePerPerson,
        currency:
          rateCard.currency.trim().toUpperCase() ||
          pkg.currency.trim().toUpperCase() ||
          "ZAR",
        valid_from: rateCard.validFrom,
        valid_to: normalizeNullableDate(rateCard.validTo),
        created_at: new Date().toISOString(),
      }))
      const normalizedRateCards = isDraftSave
        ? normalizedRateCardCandidates.filter((rateCard) => {
            if (!isUuid(rateCard.suite_type_id) || !isDateString(rateCard.valid_from)) {
              return false
            }
            if (rateCard.route_id && !routeIds.has(rateCard.route_id)) {
              return false
            }
            return suiteTypeIds.has(rateCard.suite_type_id)
          })
        : normalizedRateCardCandidates

      const mergedRateCards: NormalizedRateCard[] = normalizedRateCards.map((rateCard) => {
        const businessKey = getRateCardBusinessKey({
          package_id: rateCard.package_id,
          suite_type_id: rateCard.suite_type_id,
          route_id: rateCard.route_id ?? null,
          valid_from: rateCard.valid_from,
        })

        if (incomingRateCardKeys.has(businessKey)) {
          throw new DuplicateRateCardConflictError({
            packageId: rateCard.package_id,
            suiteTypeId: rateCard.suite_type_id,
            routeId: rateCard.route_id ?? null,
            validFrom: rateCard.valid_from,
          })
        }
        incomingRateCardKeys.add(businessKey)

        const existingRateCard = existingRateCardByBusinessKey.get(businessKey)
        if (!existingRateCard) {
          return rateCard
        }

        if (
          clientProvidedRateCardIds.has(existingRateCard.id) &&
          rateCard.id !== existingRateCard.id
        ) {
          return rateCard
        }

        // Reuse existing row id for business-key matches so save operations update instead of conflicting inserts.
        return {
          ...rateCard,
          id: existingRateCard.id,
          created_at: existingRateCard.created_at,
        }
      })

      if (
        !isDraftSave &&
        mergedRateCards.some(
          (rateCard) => rateCard.route_id && !routeIds.has(rateCard.route_id),
        )
      ) {
        throw new Error("Each rate card must reference a route from the same package.")
      }

      if (
        !isDraftSave &&
        mergedRateCards.some((rateCard) => !suiteTypeIds.has(rateCard.suite_type_id))
      ) {
        throw new Error("Each rate card must reference a suite type from this supplier.")
      }

      return {
        id: packageId,
        supplier_id: supplierId,
        name: pkg.name.trim(),
        description: normalizeText(pkg.description ?? ""),
        duration_nights: pkg.durationNights,
        single_supplement_pct: pkg.singleSupplementPct,
        currency: pkg.currency.trim().toUpperCase() || "ZAR",
        active: pkg.active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        routes: normalizedRoutes,
        rateCards: mergedRateCards,
      }
    })
    const mergedRateCards = normalizedPackages.flatMap((pkg) => pkg.rateCards)
    const seenRateCardIds = new Set<string>()
    for (const rateCard of mergedRateCards) {
      if (seenRateCardIds.has(rateCard.id)) {
        throw new RateCardIdCollisionError({ duplicateId: rateCard.id })
      }
      seenRateCardIds.add(rateCard.id)
    }
    checkRateCardOverlaps(mergedRateCards)
    phaseDurations.normalizeValidateMs = performance.now() - normalizeValidateStartedAt
  } catch (error) {
    phaseDurations.normalizeValidateMs = performance.now() - normalizeValidateStartedAt
    if (error instanceof DuplicateRateCardConflictError) {
      return withPatchTimingHeaders(
        NextResponse.json(
          {
            error: error.message,
            details: error.details,
          },
          { status: 409 },
        ),
      )
    }
    if (error instanceof OverlappingRateCardConflictError) {
      return withPatchTimingHeaders(
        NextResponse.json(
          {
            error: error.message,
            details: error.details,
          },
          { status: 409 },
        ),
      )
    }
    if (error instanceof RateCardIdCollisionError) {
      return withPatchTimingHeaders(
        NextResponse.json(
          {
            error: error.message,
            details: error.details,
          },
          { status: 409 },
        ),
      )
    }

    return withPatchTimingHeaders(
      buildErrorResponse(
        error instanceof Error ? error.message : "Invalid supplier package structure",
      ),
    )
  }

  // --- Optimistic concurrency check ---
  const expectedUpdatedAt = (parsed as Record<string, unknown>).expectedUpdatedAt
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== existingDetail.supplier.updated_at) {
    return withPatchTimingHeaders(
      NextResponse.json(
        {
          error:
            "This supplier was modified by another user since you started editing. Please refresh and try again.",
        },
        { status: 409 },
      ),
    )
  }

  // --- Dependency guard: block deletes of items still referenced by bookings ---
  const existingPackageIds = new Set(existingDetail.packages.map((pkg) => pkg.id))
  const existingRouteIds = new Set(existingDetail.routes.map((route) => route.id))
  const existingSuiteTypeIds = new Set(existingDetail.suiteTypes.map((suiteType) => suiteType.id))
  const existingEmailIds = new Set(existingDetail.emails.map((entry) => entry.id))
  const existingRateCardIds = new Set(existingDetail.rateCards.map((rateCard) => rateCard.id))

  const idValidationStartedAt = performance.now()
  try {
    const [
      conflictingPackageIds,
      conflictingRouteIds,
      conflictingSuiteTypeIds,
      conflictingEmailIds,
      conflictingRateCardIds,
    ] = await Promise.all([
      queryExistingIds(
        supabase,
        "packages",
        normalizedPackages
          .map((pkg) => pkg.id)
          .filter((packageId) => !existingPackageIds.has(packageId)),
      ),
      queryExistingIds(
        supabase,
        "routes",
        normalizedPackages
          .flatMap((pkg) => pkg.routes.map((route) => route.id))
          .filter((routeId) => !existingRouteIds.has(routeId)),
      ),
      queryExistingIds(
        supabase,
        "suite_types",
        normalizedSuiteTypes
          .map((suiteType) => suiteType.id)
          .filter((suiteTypeId) => !existingSuiteTypeIds.has(suiteTypeId)),
      ),
      queryExistingIds(
        supabase,
        "supplier_emails",
        normalizedEmails
          .map((entry) => entry.id)
          .filter((entryId) => !existingEmailIds.has(entryId)),
      ),
      queryExistingIds(
        supabase,
        "rate_cards",
        normalizedPackages
          .flatMap((pkg) => pkg.rateCards.map((rateCard) => rateCard.id))
          .filter((rateCardId) => !existingRateCardIds.has(rateCardId)),
      ),
    ])

    if (
      conflictingPackageIds.length > 0 ||
      conflictingRouteIds.length > 0 ||
      conflictingSuiteTypeIds.length > 0 ||
      conflictingEmailIds.length > 0 ||
      conflictingRateCardIds.length > 0
    ) {
      phaseDurations.idValidationMs = performance.now() - idValidationStartedAt
      return withPatchTimingHeaders(
        buildErrorResponse("One or more supplier records could not be updated safely."),
      )
    }
    phaseDurations.idValidationMs = performance.now() - idValidationStartedAt
  } catch {
    logSupplierMutationError("validation-id-lookup", supplierId, {
      message: "Failed to validate supplier updates",
    })
    phaseDurations.idValidationMs = performance.now() - idValidationStartedAt
    return withPatchTimingHeaders(
      NextResponse.json(
        { error: "Failed to validate supplier updates" },
        { status: 500 },
      ),
    )
  }

  const packageRows = normalizedPackages.map(({ routes, rateCards, ...pkg }) => pkg)
  const routeRows = normalizedPackages.flatMap((pkg) => pkg.routes)
  const suiteTypeRows = normalizedSuiteTypes.map((suiteType) => ({
    ...suiteType,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
  const rateCardRows = normalizedPackages.flatMap((pkg) => pkg.rateCards)

  const incomingPackageIds = new Set(packageRows.map((pkg) => pkg.id))
  const incomingRouteIds = new Set(routeRows.map((route) => route.id))
  const incomingSuiteTypeIds = new Set(normalizedSuiteTypes.map((suiteType) => suiteType.id))
  const incomingEmailIds = new Set(normalizedEmails.map((entry) => entry.id))
  const incomingRateCardIds = new Set(rateCardRows.map((rateCard) => rateCard.id))

  const rateCardIdsToDelete = existingDetail.rateCards
    .map((rateCard) => rateCard.id)
    .filter((rateCardId) => !incomingRateCardIds.has(rateCardId))
  const routeIdsToDelete = existingDetail.routes
    .map((route) => route.id)
    .filter((routeId) => !incomingRouteIds.has(routeId))
  const suiteTypeIdsToDelete = existingDetail.suiteTypes
    .map((suiteType) => suiteType.id)
    .filter((suiteTypeId) => !incomingSuiteTypeIds.has(suiteTypeId))
  const emailIdsToDelete = existingDetail.emails
    .map((entry) => entry.id)
    .filter((entryId) => !incomingEmailIds.has(entryId))
  const packageIdsToDelete = existingDetail.packages
    .map((pkg) => pkg.id)
    .filter((packageId) => !incomingPackageIds.has(packageId))

  if (packageIdsToDelete.length > 0 || routeIdsToDelete.length > 0 || suiteTypeIdsToDelete.length > 0) {
    const dependencyChecks = await checkDeletionDependencies(
      supabase,
      packageIdsToDelete,
      routeIdsToDelete,
      suiteTypeIdsToDelete,
    )

    if (dependencyChecks.length > 0) {
      return withPatchTimingHeaders(
        NextResponse.json(
          {
            error: "Cannot remove items that are still referenced by active bookings or offers.",
            details: dependencyChecks,
          },
          { status: 409 },
        ),
      )
    }
  }

  const dbWritesStartedAt = performance.now()
  const withDbTimingHeaders = (response: NextResponse): NextResponse => {
    phaseDurations.dbWritesMs = performance.now() - dbWritesStartedAt
    return withPatchTimingHeaders(response)
  }

  const { error: supplierUpdateError } = await supabase
    .from("suppliers")
    .update({
      name: parsed.name,
      kind: parsed.kind,
      email: normalizedEmails[0]?.email ?? null,
      phone: parsed.phone || null,
      website: parsed.website || null,
      location: parsed.location || null,
      notes: parsed.notes || null,
      active: isDraftSave ? false : parsed.active,
    })
    .eq("id", supplierId)

  if (supplierUpdateError) {
    logSupplierMutationError("supplier-update", supplierId, supplierUpdateError)
    return withDbTimingHeaders(NextResponse.json({ error: "Failed to update supplier" }, { status: 500 }))
  }

  if (normalizedEmails.length > 0) {
    const { error: supplierEmailsUpsertError } = await supabase
      .from("supplier_emails")
      .upsert(normalizedEmails, { onConflict: "id" })

    if (supplierEmailsUpsertError) {
      logSupplierMutationError("supplier-emails-upsert", supplierId, supplierEmailsUpsertError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to update supplier emails" },
          { status: 500 },
        ),
      )
    }
  }

  if (packageRows.length > 0) {
    const { error: packageError } = await supabase
      .from("packages")
      .upsert(packageRows, { onConflict: "id" })

    if (packageError) {
      logSupplierMutationError("packages-upsert", supplierId, packageError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to update supplier packages" },
          { status: 500 },
        ),
      )
    }
  }

  if (routeRows.length > 0) {
    const { error: routesError } = await supabase
      .from("routes")
      .upsert(routeRows, { onConflict: "id" })

    if (routesError) {
      logSupplierMutationError("routes-upsert", supplierId, routesError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to update supplier routes" },
          { status: 500 },
        ),
      )
    }
  }

  if (suiteTypeRows.length > 0) {
    const { error: suiteTypesError } = await supabase
      .from("suite_types")
      .upsert(suiteTypeRows, { onConflict: "id" })

    if (suiteTypesError) {
      logSupplierMutationError("suite-types-upsert", supplierId, suiteTypesError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to update supplier suite types" },
          { status: 500 },
        ),
      )
    }
  }

  if (rateCardRows.length > 0) {
    const { error: rateCardsError } = await supabase
      .from("rate_cards")
      .upsert(rateCardRows, { onConflict: "id" })

    if (rateCardsError) {
      logSupplierMutationError("rate-cards-upsert", supplierId, rateCardsError)
      if (rateCardsError.code === "23505") {
        return withDbTimingHeaders(
          NextResponse.json(
            {
              error:
                "A duplicate rate card exists for the same package, suite type, route, and start date. Update the existing one instead.",
            },
            { status: 409 },
          ),
        )
      }
      if (rateCardsError.code === "23P01") {
        return withDbTimingHeaders(
          NextResponse.json(
            {
              error:
                "Overlapping rate card periods are not allowed for the same package, suite type, and route.",
            },
            { status: 409 },
          ),
        )
      }
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to update supplier rate cards" },
          { status: 500 },
        ),
      )
    }
  }

  if (rateCardIdsToDelete.length > 0) {
    const { error: deleteRateCardsError } = await supabase
      .from("rate_cards")
      .delete()
      .in("id", rateCardIdsToDelete)

    if (deleteRateCardsError) {
      logSupplierMutationError("rate-cards-delete", supplierId, deleteRateCardsError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to remove old supplier rate cards" },
          { status: 500 },
        ),
      )
    }
  }

  if (emailIdsToDelete.length > 0) {
    const { error: deleteEmailsError } = await supabase
      .from("supplier_emails")
      .delete()
      .in("id", emailIdsToDelete)

    if (deleteEmailsError) {
      logSupplierMutationError("supplier-emails-delete", supplierId, deleteEmailsError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to remove old supplier emails" },
          { status: 500 },
        ),
      )
    }
  }

  if (routeIdsToDelete.length > 0) {
    const { error: deleteRoutesError } = await supabase
      .from("routes")
      .delete()
      .in("id", routeIdsToDelete)

    if (deleteRoutesError) {
      logSupplierMutationError("routes-delete", supplierId, deleteRoutesError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to remove old supplier routes" },
          { status: 500 },
        ),
      )
    }
  }

  if (suiteTypeIdsToDelete.length > 0) {
    const { error: deleteSuiteTypesError } = await supabase
      .from("suite_types")
      .delete()
      .in("id", suiteTypeIdsToDelete)

    if (deleteSuiteTypesError) {
      logSupplierMutationError("suite-types-delete", supplierId, deleteSuiteTypesError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to remove old supplier suite types" },
          { status: 500 },
        ),
      )
    }
  }

  if (packageIdsToDelete.length > 0) {
    const { error: deletePackagesError } = await supabase
      .from("packages")
      .delete()
      .in("id", packageIdsToDelete)

    if (deletePackagesError) {
      logSupplierMutationError("packages-delete", supplierId, deletePackagesError)
      return withDbTimingHeaders(
        NextResponse.json(
          { error: "Failed to remove old supplier packages" },
          { status: 500 },
        ),
      )
    }
  }

  phaseDurations.dbWritesMs = performance.now() - dbWritesStartedAt
  const loadUpdatedStartedAt = performance.now()
  const updatedDetail = await loadSupplierDetail(supabase, slug)
  if ("error" in updatedDetail) {
    phaseDurations.loadUpdatedMs = performance.now() - loadUpdatedStartedAt
    return withPatchTimingHeaders(updatedDetail.error!)
  }
  phaseDurations.loadUpdatedMs = performance.now() - loadUpdatedStartedAt

  return withPatchTimingHeaders(
    NextResponse.json(
      mapSupplierDetail(
        updatedDetail.supplier,
        updatedDetail.packages,
        updatedDetail.routes,
        updatedDetail.suiteTypes,
        updatedDetail.emails,
        updatedDetail.rateCards,
        updatedDetail.locations,
      ),
    ),
  )
}
