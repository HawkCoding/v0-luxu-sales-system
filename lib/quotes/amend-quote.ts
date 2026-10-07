/**
 * "Amend" changes the services on an ACCEPTED quote in place — the fast path for a client who asks
 * for an extra hotel night or tour after the reservation form / invoice stage. Unlike Revise
 * (lib/quotes/revision-reset.ts) nothing is rewound: the booking keeps its stage, payments, deposit
 * flags and reservation-form tick, no invoice is voided and no email is sent. The salesperson takes
 * responsibility for telling the client, which is what the confirmation below asks them to accept.
 *
 * The deposit invoice row keeps its old amount; the balance and final amount follow the new total
 * because both are derived from the live accepted quote (calculateInvoiceBalance,
 * buildUnifiedTotals, syncBookingPaymentState).
 */

/** Shown in the confirmation dialog before an amendment is saved. */
export const AMEND_CONFIRM_MESSAGE =
  "This changes the price on an accepted booking. Make sure the client knows about this change and the new price. No emails are sent."

export const AMEND_NOTE_MAX_LENGTH = 500

/** Shown (and kept on screen) when Build Booking saved service changes in amend mode but the
 *  amendment itself was never confirmed — the booking's services and the quote now disagree. */
export const AMEND_UNFINISHED_WARNING =
  "Service changes were saved, but the quote price was not amended. Open Amend again to finish, or undo the service changes."

/** Stages at which the voucher has already gone out — a higher total there is money still owed. */
const VOUCHER_SENT_OR_LATER_STAGES = new Set(["voucher_sent", "trip_active", "closed"])

export function isVoucherSentOrLater(stage: string | null | undefined): boolean {
  return stage ? VOUCHER_SENT_OR_LATER_STAGES.has(stage) : false
}

export interface AmendServicesTracker {
  /** A Next step in amend mode wrote to the booking's services. */
  markWritten: () => void
  /** The confirmation was cancelled or the dialog closed without a successful amend. */
  abandon: () => void
  /** The amendment was saved — services and quote agree again. */
  complete: () => void
  /** Forget the session (after the dialog closes) without touching any warning already shown. */
  reset: () => void
}

/**
 * Tracks whether an amend session left the booking's services changed while the quote price was
 * not amended, and warns once per abandon. Kept free of React and toast so it can be unit tested;
 * the dialog wires `warn` / `clearWarning` to a persistent toast.
 */
export function createAmendServicesTracker(handlers: {
  warn: (message: string) => void
  clearWarning: () => void
}): AmendServicesTracker {
  let written = false
  return {
    markWritten: () => {
      written = true
    },
    abandon: () => {
      if (written) handlers.warn(AMEND_UNFINISHED_WARNING)
    },
    complete: () => {
      written = false
      handlers.clearWarning()
    },
    reset: () => {
      written = false
    },
  }
}

/** Booking stages an accepted quote can no longer be amended in — the booking is finished or off. */
const NON_AMENDABLE_BOOKING_STAGES = new Set(["closed", "lost"])

export interface AmendEligibilityInput {
  quoteStatus: string
  bookingStage: string | null | undefined
  bookingCancelledAt: string | null | undefined
}

/** Returns why the quote can't be amended, or null when it can. */
export function amendIneligibilityReason(input: AmendEligibilityInput): string | null {
  if (input.quoteStatus !== "accepted") {
    return "Only an accepted quote can be amended."
  }
  if (input.bookingCancelledAt || input.bookingStage === "lost") {
    return "This booking is cancelled, so its quote can't be amended."
  }
  if (input.bookingStage && NON_AMENDABLE_BOOKING_STAGES.has(input.bookingStage)) {
    return "This booking is closed, so its quote can't be amended."
  }
  return null
}
