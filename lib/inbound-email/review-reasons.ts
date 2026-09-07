import { SUITE_TYPE_MISSING_FIELD } from "@/lib/suites/missing-fields"
import type { SupplierKind } from "@/lib/types"

/**
 * Every reason an enquiry can be flagged Needs Review, in one place.
 *
 * The bug this exists to prevent: `email_import_needs_review` used to be computed separately from the
 * list of reasons, so a condition could set the flag while contributing no string -- a possible
 * duplicate did exactly that, and the review banner fell through to a placeholder that told the
 * consultant nothing. `buildReviewDecision` below makes that structurally impossible: the flag is
 * derived from the reasons, never alongside them.
 *
 * The stored value stays a plain string (`email_import_missing_fields` / `email_import_warnings` are
 * text arrays) so rows written before this catalogue keep rendering. The catalogue's job is to turn
 * that string into label + fix hint for the UI.
 */
export const REVIEW_REASON = {
  // Required fields the parser could not find at all (lib/import/parseEmailDraft.ts validateDraft).
  firstName: "First name (Customer)",
  surname: "Surname (Customer)",
  country: "Country",
  contact: "Email or Phone (Customer)",
  supplier: "Supplier",
  route: "Route / Direction",
  departureDate: "Departure date",
  adults: "Adults",
  suites: "Suites",
  // A standalone hotel enquiry (Kruger Shalati) states a stay instead of a journey, so it is
  // missing check-in/check-out rather than a route and a departure date. Same nine required
  // fields either way -- these three stand in for route, departure date and suites.
  checkIn: "Check-in date",
  checkOut: "Check-out date",
  rooms: "Rooms",
  // The same three slots again for the kinds a supplier can head a booking under once it is ticked
  // "Can be the main product". Every kind names its own start date, end date and unit count; see
  // INTAKE_REVIEW_REASONS below for which trio belongs to which.
  transferDate: "Transfer date",
  pickupDate: "Pickup date",
  returnDate: "Return date",
  tourDate: "Tour date",
  tourEndDate: "Tour end date",
  sailingDate: "Sailing date",
  vehicles: "Vehicles",
  tours: "Tours",
  cabins: "Cabins",
  // Parsed fine, but matched no active row once the DB lookups ran (lib/inbound-email/import-booking.ts).
  suiteType: SUITE_TYPE_MISSING_FIELD,
  supplierUnmatched: "Train operator not matched to an active supplier",
  routeUnmatched: "Route not matched to an active route",
  routeUnresolvedNoOperator: "Route not resolved - no train operator matched",
  possibleDuplicate: "Possible duplicate of an existing booking",
  // Manual / paste intake gaps (app/api/enquiries/route.ts).
  numberOfSuites: "Number of suites",
  direction: "Direction",
  // Only reachable for rows flagged before this catalogue existed.
  unspecified: "Flagged for review - reason not recorded",
} as const

export type ReviewReason = (typeof REVIEW_REASON)[keyof typeof REVIEW_REASON]

export type ReviewReasonSeverity = "block" | "warn"

export interface ReviewReasonDetail {
  /** What is wrong, in the consultant's language. */
  label: string
  /** What the consultant does about it. */
  fixHint: string
}

export interface DescribedReviewReason extends ReviewReasonDetail {
  /** The raw stored string, so callers can key off a specific reason (e.g. the duplicate link). */
  reason: string
  severity: ReviewReasonSeverity
}

const GENERIC_FIX_HINT = "Check this against the original email before quoting."

/**
 * Copy for every reason in REVIEW_REASON. Kept exhaustive by type: adding a reason above without a
 * detail here is a compile error, and review-reasons.test.ts asserts the same at runtime.
 */
export const REVIEW_REASON_DETAIL: Record<ReviewReason, ReviewReasonDetail> = {
  [REVIEW_REASON.firstName]: {
    label: "No first name was found in the email",
    fixHint: "Add the customer's first name on the enquiry tab.",
  },
  [REVIEW_REASON.surname]: {
    label: "No surname was found in the email",
    fixHint: "Add the customer's surname on the enquiry tab.",
  },
  [REVIEW_REASON.country]: {
    label: "No country was found in the email",
    fixHint: "Set the customer's country -- pricing and vouchers depend on it.",
  },
  [REVIEW_REASON.contact]: {
    label: "The email had neither an email address nor a phone number",
    fixHint: "Add a contact channel before replying to this enquiry.",
  },
  [REVIEW_REASON.supplier]: {
    label: "The email never named a supplier we sell",
    fixHint: "Set the supplier on the enquiry tab.",
  },
  [REVIEW_REASON.route]: {
    label: "No route or direction was found in the email",
    fixHint: "Set the direction on the enquiry tab.",
  },
  [REVIEW_REASON.departureDate]: {
    label: "No departure date was found in the email",
    fixHint: "Add the date from the original email before quoting.",
  },
  [REVIEW_REASON.adults]: {
    label: "No adult passenger count was found in the email",
    fixHint: "Set the number of adults travelling.",
  },
  [REVIEW_REASON.suites]: {
    label: "No suite count was found in the email",
    fixHint: "Set how many suites the party needs.",
  },
  [REVIEW_REASON.checkIn]: {
    label: "No check-in date was found in the email",
    fixHint: "Add the arrival date from the original email before quoting.",
  },
  [REVIEW_REASON.checkOut]: {
    label: "No check-out date was found in the email",
    fixHint: "Set the departure date -- the stay is priced per night, so its length decides the total.",
  },
  [REVIEW_REASON.rooms]: {
    label: "No room count was found in the email",
    fixHint: "Set how many rooms the party needs.",
  },
  [REVIEW_REASON.transferDate]: {
    label: "No transfer date was found in the email",
    fixHint: "Add the date of the transfer from the original email before quoting.",
  },
  [REVIEW_REASON.pickupDate]: {
    label: "No pickup date was found in the email",
    fixHint: "Add the collection date from the original email before quoting.",
  },
  [REVIEW_REASON.returnDate]: {
    label: "No return date was found in the email",
    fixHint: "Set the return date -- the rental is priced per day, so its length decides the total.",
  },
  [REVIEW_REASON.tourDate]: {
    label: "No start date was found in the email",
    fixHint: "Add the date the tour starts from the original email before quoting.",
  },
  [REVIEW_REASON.tourEndDate]: {
    label: "No end date was found in the email",
    fixHint: "Set the date the tour ends -- its length decides the dates on every other service.",
  },
  [REVIEW_REASON.sailingDate]: {
    label: "No sailing date was found in the email",
    fixHint: "Add the date the voyage departs from the original email before quoting.",
  },
  [REVIEW_REASON.vehicles]: {
    label: "No vehicle count was found in the email",
    fixHint: "Set how many vehicles the party needs.",
  },
  [REVIEW_REASON.tours]: {
    label: "No tour count was found in the email",
    fixHint: "Set how many tours the party is booking.",
  },
  [REVIEW_REASON.cabins]: {
    label: "No cabin count was found in the email",
    fixHint: "Set how many cabins the party needs.",
  },
  [REVIEW_REASON.suiteType]: {
    label: "A suite type could not be identified from the wording used",
    fixHint: "Pick the matching suite type -- a quote cannot be built without it.",
  },
  [REVIEW_REASON.supplierUnmatched]: {
    label: "The train operator named in the email doesn't match an active supplier",
    fixHint: "Add or activate the supplier, or correct the operator on the enquiry.",
  },
  [REVIEW_REASON.routeUnmatched]: {
    label: "This operator files no route matching the wording in the email",
    fixHint: "Correct the direction, or add the route to the supplier.",
  },
  [REVIEW_REASON.routeUnresolvedNoOperator]: {
    label: "The route could not be resolved because the train operator wasn't matched",
    fixHint: "Fix the supplier first -- the route resolves once the operator is known.",
  },
  [REVIEW_REASON.possibleDuplicate]: {
    label: "This looks like an enquiry that is already in the system",
    fixHint: "Open the linked booking; reject this import if it is the same trip.",
  },
  [REVIEW_REASON.numberOfSuites]: {
    label: "The enquiry was saved without a suite count",
    fixHint: "Set how many suites the party needs.",
  },
  [REVIEW_REASON.direction]: {
    label: "The enquiry was saved without a direction",
    fixHint: "Set the direction on the enquiry tab.",
  },
  [REVIEW_REASON.unspecified]: {
    label: "This enquiry was flagged before reasons were recorded",
    fixHint: "Check the parsed fields against the original email, then mark it reviewed.",
  },
}

/**
 * Which reason stands in for each of the three shape-dependent required fields, per supplier kind.
 *
 * The trio is always the same question -- when does it start, when does it end, how many of them --
 * asked in the customer's words for that product. `null` means the kind does not capture that field
 * at intake at all, so its absence is not a reason to flag anything.
 *
 * Lives here rather than in lib/types.ts because these are the catalogue's own strings, and
 * lib/types.ts must not import from lib/inbound-email/.
 */
export const INTAKE_REVIEW_REASONS: Record<
  SupplierKind,
  { startDate: ReviewReason; endDate: ReviewReason | null; unitCount: ReviewReason | null }
> = {
  train_operator: { startDate: REVIEW_REASON.departureDate, endDate: null, unitCount: REVIEW_REASON.suites },
  hotel_property: {
    startDate: REVIEW_REASON.checkIn,
    endDate: REVIEW_REASON.checkOut,
    unitCount: REVIEW_REASON.rooms,
  },
  transfers: { startDate: REVIEW_REASON.transferDate, endDate: null, unitCount: null },
  vehicle_rental: {
    startDate: REVIEW_REASON.pickupDate,
    endDate: REVIEW_REASON.returnDate,
    unitCount: null,
  },
  tour_operator: {
    startDate: REVIEW_REASON.tourDate,
    endDate: REVIEW_REASON.tourEndDate,
    unitCount: REVIEW_REASON.tours,
  },
  airline: {
    startDate: REVIEW_REASON.departureDate,
    endDate: REVIEW_REASON.returnDate,
    unitCount: REVIEW_REASON.cabins,
  },
  cruise_line: {
    startDate: REVIEW_REASON.sailingDate,
    endDate: REVIEW_REASON.returnDate,
    unitCount: REVIEW_REASON.cabins,
  },
}

function detailFor(reason: string): ReviewReasonDetail {
  return (
    REVIEW_REASON_DETAIL[reason as ReviewReason] ?? {
      // Unknown strings are legacy rows or a warning built at runtime ("Departure date parsed with
      // low confidence"). Show them verbatim rather than dropping information we can't classify.
      label: reason,
      fixHint: GENERIC_FIX_HINT,
    }
  )
}

/**
 * Turns stored reason strings into renderable rows. Missing fields block the stage transition
 * (lib/pipeline/validate-transition.ts); warnings are informational only.
 *
 * Never returns an empty array for a flagged booking: with nothing stored it falls back to the
 * `unspecified` reason so the banner still says something actionable.
 */
export function describeReviewReasons(
  missingFields: readonly string[] | null | undefined,
  warnings: readonly string[] | null | undefined,
): DescribedReviewReason[] {
  const seen = new Set<string>()
  const described: DescribedReviewReason[] = []

  const add = (reason: string, severity: ReviewReasonSeverity) => {
    const trimmed = reason.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    described.push({ reason: trimmed, severity, ...detailFor(trimmed) })
  }

  for (const reason of missingFields ?? []) add(reason, "block")
  for (const reason of warnings ?? []) add(reason, "warn")

  if (described.length === 0) add(REVIEW_REASON.unspecified, "block")

  return described
}

export interface ReviewDecisionInput {
  /** Pre-resolution gaps from validateDraft. */
  missingFields: readonly string[]
  /** Pre-resolution warnings from validateDraft -- never blocking on their own. */
  warnings: readonly string[]
  /** True when at least one suite unit could not be matched to a suite type. */
  hasUnresolvedSuites: boolean
  /** Gaps only visible after the DB lookups ran (unmatched supplier / route). */
  resolutionFailures: readonly string[]
  duplicateOfBookingId: string | null
}

export interface ReviewDecision {
  needsReview: boolean
  missingFields: string[]
  warnings: string[]
}

/**
 * The only supported way to decide the Needs Review flag: `needsReview` is `missingFields.length > 0`
 * by construction, so no condition can raise the flag without also naming itself in the banner.
 */
export function buildReviewDecision(input: ReviewDecisionInput): ReviewDecision {
  const missingFields = [...input.missingFields]

  const push = (reason: string) => {
    if (!missingFields.includes(reason)) missingFields.push(reason)
  }

  if (input.hasUnresolvedSuites) push(REVIEW_REASON.suiteType)
  for (const reason of input.resolutionFailures) push(reason)
  if (input.duplicateOfBookingId) push(REVIEW_REASON.possibleDuplicate)

  return {
    needsReview: missingFields.length > 0,
    missingFields,
    warnings: [...input.warnings],
  }
}
