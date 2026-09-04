import { SUPPLIER_KIND_LABELS, SUPPLIER_VOCABULARY, type SupplierKind } from "@/lib/types"

export type ReadinessState = "not_built" | "auto_built" | "confirmed"

export interface ReadinessServiceRow {
  serviceId: string
  supplierName: string | null
  supplierKind: SupplierKind | null
  kindLabel: string
  selected: boolean
  origin: "auto" | "consultant"
  serviceDate: string | null
  serviceDateDisplay: string | null
  nights: number | null
  unitCount: number
  issues: string[]
}

export interface ReadinessNote {
  id: string
  severity: "block" | "warn" | "info"
  title: string
  detail: string | null
}

/** The one blocker with structured detail instead of a flat string — reused from the review-reasons
 * catalogue so the panel can render it exactly like the old email-only banner did (list of reasons,
 * duplicate-booking link). Every other blocker/gap is plain title + detail text. */
export interface NeedsReviewBlocker extends ReadinessNote {
  id: "needs_review"
  missingFields: string[]
  warnings: string[]
  duplicateOfBookingId: string | null
}

export interface EnquiryReadiness {
  state: ReadinessState
  servicesConfirmedAt: string | null
  servicesConfirmedByName: string | null
  services: ReadinessServiceRow[]
  /** "Asked for, not built" — divergence between the enquiry and booking_services. */
  gaps: ReadinessNote[]
  /** Hard stops on starting/pricing the quote. */
  blockers: (ReadinessNote | NeedsReviewBlocker)[]
  /** Only populated when services.length === 0 — the intake reason auto-build logged. */
  autoBuildSkipReason: string | null
}

export interface ReadinessServiceInput {
  id: string
  supplierId: string | null
  supplierName: string | null
  supplierKind: SupplierKind | null
  selected: boolean
  origin: "auto" | "consultant"
  serviceDate: string | null
  serviceDateDisplay: string | null
  nights: number | null
  routeId: string | null
  sortOrder: number
  unitCount: number
  unitsMissingSuiteType: number
}

export interface ReadinessSuiteInput {
  suiteTypeId: string | null
  sourcePhrase: string | null
}

export interface BuildEnquiryReadinessInput {
  services: ReadinessServiceInput[]
  suites: ReadinessSuiteInput[]
  noOfSuites: number
  /** Resolved hotel supplier name, falling back to the customer's raw wording — same value the
   * Enquiry tab's Hotel & Additional Services card shows as "Hotel". */
  hotelOptionResolved: string | null
  hotelPhase: string | null
  extendStay: boolean
  extraNights: number | null
  additionalServicesRequested: boolean
  additionalServicesDetails: string | null
  packageOption: string | null
  flightBookingRaw: string | null
  supplierResolved: boolean
  supplierRaw: string | null
  customer: {
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    country: string | null
  } | null
  emailImportNeedsReview: boolean
  emailImportMissingFields: string[]
  emailImportWarnings: string[]
  emailImportDuplicateOfBookingId: string | null
  emailImportReviewResolvedAt: string | null
  servicesConfirmedAt: string | null
  servicesConfirmedByName: string | null
  /** Only read when services.length === 0 — the newest booking_auto_built audit row's reason. */
  autoBuildSkipReason: string | null
}

const TRANSPORT_KINDS = new Set<SupplierKind>(["transfers", "vehicle_rental"])
const NON_TRANSPORT_UNIT_KINDS = new Set<SupplierKind>([
  "train_operator",
  "hotel_property",
  "tour_operator",
  "airline",
])
/**
 * Kinds whose leg cannot be priced without a route row chosen. A hotel's "route" is its meal plan
 * (SUPPLIER_VOCABULARY relabels the same table per kind), and rate_cards key off it — so a hotel
 * leg with none set prices off nothing and renders an empty {{mealPlan}} on the quote email. This
 * was invisible while Kruger Shalati filed exactly one meal plan and auto-build filled it in;
 * a second one, or any other lodge, makes it reachable. Transfers and rentals are deliberately
 * absent: their route is optional, and flagging it would fire on legs that are already complete.
 */
const ROUTE_REQUIRED_KINDS = new Set<SupplierKind>(["train_operator", "hotel_property"])

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

/** Pure — no Supabase client, no formatting concerns beyond what the panel needs. Every gap and
 * blocker here is derivable from current state; nothing is persisted or goes stale (see the
 * autoBuildSkipReason exception, the one fact current state cannot explain on its own). */
export function buildEnquiryReadiness(input: BuildEnquiryReadinessInput): EnquiryReadiness {
  const orderedServices = [...input.services].sort((a, b) => a.sortOrder - b.sortOrder)

  // The blockers below are derived from these same facts rather than by matching the issue
  // strings back out of the row. Wording is per-supplier vocabulary now ("no meal plan chosen" on
  // a lodge), so a string match would have silently stopped blocking the moment the words changed.
  const assessed = orderedServices.map((service) => {
    const vocabulary = service.supplierKind ? SUPPLIER_VOCABULARY[service.supplierKind] : null

    // A hotel's "route" is its meal plan, and rate cards key off it -- an unset one prices off
    // nothing, so it blocks exactly as a train with no route does.
    const missingRoute = Boolean(
      service.supplierKind && ROUTE_REQUIRED_KINDS.has(service.supplierKind) && !service.routeId,
    )
    const missingUnits =
      service.supplierKind &&
      NON_TRANSPORT_UNIT_KINDS.has(service.supplierKind) &&
      service.unitsMissingSuiteType > 0
        ? service.unitsMissingSuiteType
        : 0

    const unitsIssue =
      missingUnits > 0 && vocabulary
        ? `${missingUnits} ${missingUnits === 1 ? vocabulary.unitNoun : vocabulary.unitNounPlural} ` +
          `${missingUnits === 1 ? "has" : "have"} no ${vocabulary.suiteType.toLowerCase()}`
        : null

    const issues: string[] = []
    if (service.selected && !service.serviceDate) issues.push("No date set")
    if (missingRoute && vocabulary) issues.push(`No ${vocabulary.route.toLowerCase()} chosen`)
    if (unitsIssue) issues.push(unitsIssue)

    const row: ReadinessServiceRow = {
      serviceId: service.id,
      supplierName: service.supplierName,
      supplierKind: service.supplierKind,
      kindLabel: service.supplierKind ? SUPPLIER_KIND_LABELS[service.supplierKind] : "Service",
      selected: service.selected,
      origin: service.origin,
      serviceDate: service.serviceDate,
      serviceDateDisplay: service.serviceDateDisplay,
      nights: service.nights,
      unitCount: service.unitCount,
      issues,
    }
    return { row, vocabulary, missingRoute, unitsIssue }
  })

  const services: ReadinessServiceRow[] = assessed.map((entry) => entry.row)

  const state: ReadinessState =
    services.length === 0
      ? "not_built"
      : input.servicesConfirmedAt
        ? "confirmed"
        : "auto_built"

  // --- Gaps: asked for, not built. ---
  const gaps: ReadinessNote[] = []

  const trainService = orderedServices.find((s) => s.supplierKind === "train_operator")
  const trainUnitCount = trainService?.unitCount ?? 0
  if (trainService && input.noOfSuites > trainUnitCount) {
    gaps.push({
      id: "suites_short",
      severity: "warn",
      title: `Enquiry asks for ${input.noOfSuites} suites; the booking is built with ${trainUnitCount}.`,
      detail:
        "Suite phrases that didn't match a suite type are skipped when the booking is built. Add the missing suites in Build Booking, step 2.",
    })
  }

  const unresolvedSuites = input.suites.filter((suite) => !suite.suiteTypeId)
  if (unresolvedSuites.length > 0) {
    const phrases = unresolvedSuites.map((s) => s.sourcePhrase).filter((p): p is string => Boolean(p))
    gaps.push({
      id: "suites_unresolved",
      severity: "warn",
      title:
        unresolvedSuites.length === 1
          ? "1 suite request couldn't be matched to a suite type."
          : `${unresolvedSuites.length} suite requests couldn't be matched to a suite type.`,
      detail:
        phrases.length > 0
          ? `Requested as: ${phrases.map((p) => `"${p}"`).join(", ")}. Choose the real suite type in Build Booking.`
          : "Choose the real suite type in Build Booking.",
    })
  }

  const hotelService = orderedServices.find((s) => s.supplierKind === "hotel_property")
  const hotelRequested = hasText(input.hotelOptionResolved) || hasText(input.hotelPhase)
  if (hotelRequested && !hotelService) {
    gaps.push({
      id: "hotel_requested_not_built",
      severity: "warn",
      title: "A hotel stay was requested but none is on the booking.",
      detail: `Asked for: ${input.hotelOptionResolved ?? "a hotel stay"}${
        input.hotelPhase ? ` (${input.hotelPhase === "pre" ? "pre" : "post"}-departure)` : ""
      }. Add a hotel in Build Booking, step 1.`,
    })
  } else if (hotelService && !hotelService.selected) {
    gaps.push({
      id: "hotel_not_included",
      severity: "warn",
      title: "The hotel stay is not included in the quote.",
      detail: "Tick it in Build Booking, step 2 to price it.",
    })
  } else if (hotelService && input.extraNights && input.extraNights > 0) {
    const nights = hotelService.nights ?? 0
    if (nights < input.extraNights) {
      gaps.push({
        id: "extra_nights_unbuilt",
        severity: "warn",
        title: `${input.extraNights} extra night(s) requested; the hotel leg is booked for ${nights}.`,
        detail: "Extra nights are never applied automatically — set the night count in Build Booking.",
      })
    }
  } else if (hotelService && input.extendStay && !input.extraNights) {
    gaps.push({
      id: "extra_nights_unbuilt",
      severity: "warn",
      title: "An extended stay was requested; check the hotel leg's night count.",
      detail: "Extra nights are never applied automatically — set the night count in Build Booking.",
    })
  }

  const hasAdditionalServiceBuilt = orderedServices.some(
    (s) => s.supplierKind && (TRANSPORT_KINDS.has(s.supplierKind) || s.supplierKind === "tour_operator"),
  )
  if (input.additionalServicesRequested && !hasAdditionalServiceBuilt) {
    gaps.push({
      id: "additional_services_unbuilt",
      severity: "warn",
      title: "Additional services were requested but nothing has been built for them.",
      detail: `${
        input.additionalServicesDetails ?? "No detail was captured."
      } Transfers, rentals and tours are never built automatically — add them in Build Booking, step 1.`,
    })
  }

  if (hasText(input.packageOption)) {
    gaps.push({
      id: "package_option_unread",
      severity: "info",
      title: `Package requested: ${input.packageOption}.`,
      detail: "The system never reads this — check the services below match what the package includes.",
    })
  }

  const hasAirlineService = orderedServices.some((s) => s.supplierKind === "airline")
  if (hasText(input.flightBookingRaw) && !hasAirlineService) {
    gaps.push({
      id: "flight_requested_not_built",
      severity: "info",
      title: `A flight was requested: ${input.flightBookingRaw}.`,
      detail: "Flights are never built automatically — add an airline service in Build Booking if you're quoting one.",
    })
  }

  if (!input.supplierResolved && hasText(input.supplierRaw)) {
    gaps.push({
      id: "supplier_unresolved",
      severity: "warn",
      title: `The supplier is still the customer's wording: "${input.supplierRaw}".`,
      detail: "Confirm the supplier on the service row above.",
    })
  }

  // --- Blockers: hard stops before the quote can go out. ---
  const blockers: (ReadinessNote | NeedsReviewBlocker)[] = []

  if (services.length === 0) {
    blockers.push({
      id: "no_services",
      severity: "block",
      title: "Nothing is built.",
      // Kind-neutral: Luxus also sells standalone stays (Kruger Shalati), which have no journey
      // to add and were being told to add a train.
      detail: "The quote cannot be priced until the booking has at least one service.",
    })
  }

  if (input.emailImportNeedsReview && !input.emailImportReviewResolvedAt) {
    blockers.push({
      id: "needs_review",
      severity: "block",
      title: "This enquiry needs review before it can move to Quote Sent.",
      detail: null,
      missingFields: input.emailImportMissingFields,
      warnings: input.emailImportWarnings,
      duplicateOfBookingId: input.emailImportDuplicateOfBookingId,
    })
  }

  const missingCustomerFields = [
    ["first name", input.customer?.firstName],
    ["last name", input.customer?.lastName],
    ["email", input.customer?.email],
    ["phone", input.customer?.phone],
    ["country", input.customer?.country],
  ]
    .filter(([, value]) => !hasText(value as string | null))
    .map(([label]) => label as string)

  if (missingCustomerFields.length > 0) {
    blockers.push({
      id: "customer_incomplete",
      severity: "block",
      title: `Customer profile is missing ${missingCustomerFields.join(", ")}.`,
      detail: "Complete it on the customer record before starting a quote.",
    })
  }

  for (const { row: service, vocabulary, missingRoute, unitsIssue } of assessed) {
    if (service.selected && !service.serviceDate) {
      blockers.push({
        id: `service_missing_date_${service.serviceId}`,
        severity: "block",
        title: `${service.kindLabel} has no date.`,
        detail: null,
      })
    }
    if (missingRoute && vocabulary) {
      blockers.push({
        // Id kept as-is so anything keyed on it keeps working; only trains and lodges reach here.
        id: `train_missing_route_${service.serviceId}`,
        severity: "block",
        title:
          service.supplierKind === "train_operator"
            ? "The train journey has no route."
            : `${service.kindLabel} has no ${vocabulary.route.toLowerCase()}.`,
        detail: null,
      })
    }
    if (unitsIssue) {
      blockers.push({
        id: `unit_missing_suite_type_${service.serviceId}`,
        severity: "block",
        title: `${service.kindLabel}: ${unitsIssue.charAt(0).toLowerCase()}${unitsIssue.slice(1)}`,
        detail: null,
      })
    }
  }

  return {
    state,
    servicesConfirmedAt: input.servicesConfirmedAt,
    servicesConfirmedByName: input.servicesConfirmedByName,
    services,
    gaps,
    blockers,
    autoBuildSkipReason: services.length === 0 ? input.autoBuildSkipReason : null,
  }
}
