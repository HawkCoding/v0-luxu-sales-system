export type ReadinessFailureCode =
  | "stage_not_eligible"
  | "balance_not_zero"
  | "departure_date_missing"
  | "customer_email_missing"
  | "leg_references_missing"
  | "quoted_leg_missing"

export interface ReadinessFailure {
  code: ReadinessFailureCode
  message: string
  fixHint: string
}

export type ReadinessWarningCode =
  | "supplier_contact_missing"
  | "supplier_address_missing"
  | "supplier_location_missing"
  | "service_times_missing"
  | "guest_counts_missing"
  | "flight_times_incomplete"
  | "flight_details_incomplete"

export interface ReadinessWarning {
  code: ReadinessWarningCode
  message: string
  fixHint: string
}

export interface VoucherReadinessResult {
  ready: boolean
  failures: ReadinessFailure[]
  /** Missing fields that don't block generation — surfaced so a consultant can fill them in,
   * but a voucher can still be sent without them (unlike `failures`). */
  warnings: ReadinessWarning[]
}

/** The minimal shape of a service block the warnings pass needs — deliberately narrower than
 * `VoucherServiceBlock` so this module doesn't have to depend on the render layer. */
export interface ReadinessBlockSummary {
  title: string
  serviceType: string
  supplierContactName?: string | null
  streetAddress?: string | null
  /** Train blocks are judged on this instead of `streetAddress` — see `buildWarnings`. */
  boardingPoint?: string | null
  /** The supplier's city (for a train, its free-text head office city). Trains aren't judged on
   *  this — their printed location comes from `boardingPoint` — see `buildWarnings`. */
  location?: string | null
  startTime?: string | null
  endTime?: string | null
  /** Flight blocks are judged on this too: a flight with no arrival date has no landing day to
   * print, which reads as a same-day arrival it may not have. */
  arrivalDate?: string | null
  hasGuestBreakdown: boolean
  cabin?: string | null
  handLuggageKg?: number | null
  checkedLuggageKg?: number | null
  departureAirportCode?: string | null
  arrivalAirportCode?: string | null
}

export interface VoucherReadinessInput {
  stage: string | null
  invoiceBalance: number | null
  departureDate: string | null
  customerEmail: string | null
  missingLegReferenceLabels: string[]
  /** Services the accepted quote priced that no longer exist in the booking's builder. Deleting a
   * service also cascades away its units, transport requests and supplier references, so there is
   * nothing left to print for it — generating anyway would ship a voucher silently missing
   * something the customer paid for. Empty when the booking has no accepted quote. */
  missingQuotedLegLabels?: string[]
  /** Omit to skip the warnings pass (e.g. a caller that only needs the hard gate). */
  serviceBlocks?: ReadinessBlockSummary[]
}

const PAID_IN_FULL_STAGES = new Set(["final_paid", "voucher_sent", "closed"])

/** Service types a supplier contact/times/etc. warning is meaningful for — additional_service and
 * tour blocks have no real supplier relationship to chase these fields on. */
const SUPPLIER_BACKED_TYPES = new Set(["train", "hotel", "transfer", "airline"])
// Airline is deliberately absent: a flight is judged by `flight_times_incomplete` instead, which
// wants both times AND an arrival date, and whose fix hint points at the flight rather than at the
// supplier's default times (meaningless for an airline — every booking is a different flight).
const TIMED_TYPES = new Set(["train", "hotel"])
const GUEST_COUNT_TYPES = new Set(["train", "hotel"])

function aggregateWarning(
  code: ReadinessWarningCode,
  label: string,
  fixHint: string,
  titles: string[],
): ReadinessWarning | null {
  if (titles.length === 0) return null
  return { code, message: `${label}: ${titles.join(", ")}.`, fixHint }
}

function buildWarnings(blocks: ReadinessBlockSummary[]): ReadinessWarning[] {
  const supplierBacked = blocks.filter((block) => SUPPLIER_BACKED_TYPES.has(block.serviceType))

  const warnings = [
    aggregateWarning(
      "supplier_contact_missing",
      "No named contact for",
      "Add a contact name on the Voucher Details tab.",
      supplierBacked.filter((b) => !b.supplierContactName?.trim()).map((b) => b.title),
    ),
    aggregateWarning(
      "supplier_address_missing",
      "No street address for",
      "Add a street address to the supplier record — for a train, a station address for the cities its route runs between.",
      // A train supplier has no single street address: it boards guests at a different station in
      // every city, so the address that matters to the guest is the leg's own boarding point.
      supplierBacked
        .filter((b) => (b.serviceType === "train" ? !b.boardingPoint?.trim() : !b.streetAddress?.trim()))
        .map((b) => b.title),
    ),
    aggregateWarning(
      "supplier_location_missing",
      "No city set for",
      "Pick a city on the supplier record.",
      // A train prints its free-text head office city, not a picked city, and is covered by the
      // address warning above instead (its boarding point is what actually matters to the guest).
      supplierBacked
        .filter((b) => b.serviceType !== "train" && !b.location?.trim())
        .map((b) => b.title),
    ),
    aggregateWarning(
      "service_times_missing",
      "No time set for",
      "Add a time on the supplier record, or set one for this leg.",
      blocks
        .filter((b) => TIMED_TYPES.has(b.serviceType) && !b.startTime?.trim() && !b.endTime?.trim())
        .map((b) => b.title),
    ),
    aggregateWarning(
      "guest_counts_missing",
      "No guest breakdown for",
      "Capture adult/child/infant counts on the suite units for this leg.",
      blocks.filter((b) => GUEST_COUNT_TYPES.has(b.serviceType) && !b.hasGuestBreakdown).map((b) => b.title),
    ),
    aggregateWarning(
      "flight_times_incomplete",
      "No departure time, arrival time or arrival date for",
      "Set the flight's schedule in Build Booking, or on the Transfer Times tab.",
      blocks
        .filter(
          (b) =>
            b.serviceType === "airline" &&
            (!b.startTime?.trim() || !b.endTime?.trim() || !b.arrivalDate?.trim()),
        )
        .map((b) => b.title),
    ),
    aggregateWarning(
      "flight_details_incomplete",
      "Missing cabin, airport codes or baggage allowance for",
      "Fill in the flight details in Build Booking — the cabin is the booked suite type.",
      blocks
        .filter(
          (b) =>
            b.serviceType === "airline" &&
            (!b.cabin?.trim() ||
              !b.departureAirportCode?.trim() ||
              !b.arrivalAirportCode?.trim() ||
              b.handLuggageKg == null ||
              b.checkedLuggageKg == null),
        )
        .map((b) => b.title),
    ),
  ]

  return warnings.filter((w): w is ReadinessWarning => w !== null)
}

export function checkVoucherReadiness(input: VoucherReadinessInput): VoucherReadinessResult {
  const failures: ReadinessFailure[] = []

  if (!PAID_IN_FULL_STAGES.has(input.stage ?? "")) {
    failures.push({
      code: "stage_not_eligible",
      message: "The booking must be in Paid in Full, Voucher Sent, or Closed stage.",
      fixHint: "Move the booking to Paid in Full before generating a voucher.",
    })
  }

  if (Number(input.invoiceBalance ?? NaN) !== 0) {
    failures.push({
      code: "balance_not_zero",
      message: "The invoice balance must be zero before generating a voucher.",
      fixHint: "Record all outstanding payments to clear the invoice balance.",
    })
  }

  if (!input.departureDate) {
    failures.push({
      code: "departure_date_missing",
      message: "A departure date is required before generating a voucher.",
      fixHint: "Set the departure date on the booking.",
    })
  }

  if (!input.customerEmail?.trim()) {
    failures.push({
      code: "customer_email_missing",
      message: "Customer email is required before generating a voucher.",
      fixHint: "Add an email address to the customer record.",
    })
  }

  if ((input.missingQuotedLegLabels ?? []).length > 0) {
    failures.push({
      code: "quoted_leg_missing",
      message: `Services on the accepted quote are no longer in the booking: ${(input.missingQuotedLegLabels ?? []).join(", ")}.`,
      fixHint: "Re-add the service under Edit Quote, or revise the quote to match what is being delivered.",
    })
  }

  if (input.missingLegReferenceLabels.length > 0) {
    failures.push({
      code: "leg_references_missing",
      message: `Supplier reference numbers are missing for: ${input.missingLegReferenceLabels.join(", ")}.`,
      fixHint: "Add a reference number for every leg on the Voucher References tab.",
    })
  }

  const warnings = input.serviceBlocks ? buildWarnings(input.serviceBlocks) : []

  return { ready: failures.length === 0, failures, warnings }
}
