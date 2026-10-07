import { describe, expect, it, vi } from "vitest"
import {
  AMEND_UNFINISHED_WARNING,
  amendIneligibilityReason,
  createAmendServicesTracker,
  isVoucherSentOrLater,
} from "./amend-quote"

describe("createAmendServicesTracker", () => {
  function setup() {
    const warn = vi.fn()
    const clearWarning = vi.fn()
    return { warn, clearWarning, tracker: createAmendServicesTracker({ warn, clearWarning }) }
  }

  it("warns when the amend is abandoned after a Next step wrote the services", () => {
    const { warn, tracker } = setup()

    tracker.markWritten()
    tracker.abandon()

    expect(warn).toHaveBeenCalledWith(AMEND_UNFINISHED_WARNING)
    expect(AMEND_UNFINISHED_WARNING).toBe(
      "Service changes were saved, but the quote price was not amended. Open Amend again to finish, or undo the service changes.",
    )
  })

  it("stays quiet when nothing was written yet", () => {
    const { warn, tracker } = setup()
    tracker.abandon()
    expect(warn).not.toHaveBeenCalled()
  })

  it("keeps warning on a second abandon (confirm cancelled, then dialog closed)", () => {
    const { warn, tracker } = setup()
    tracker.markWritten()
    tracker.abandon()
    tracker.abandon()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it("clears the warning and stops tracking once the amend succeeds", () => {
    const { warn, clearWarning, tracker } = setup()

    tracker.markWritten()
    tracker.abandon()
    tracker.complete()
    tracker.abandon()

    expect(clearWarning).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("reset forgets the session without dismissing a warning already shown", () => {
    const { warn, clearWarning, tracker } = setup()

    tracker.markWritten()
    tracker.reset()
    tracker.abandon()

    expect(warn).not.toHaveBeenCalled()
    expect(clearWarning).not.toHaveBeenCalled()
  })
})

describe("isVoucherSentOrLater", () => {
  it.each([
    ["voucher_sent", true],
    ["trip_active", true],
    ["closed", true],
    ["final_paid", false],
    ["deposit_paid", false],
    [null, false],
  ])("%s → %s", (stage, expected) => {
    expect(isVoucherSentOrLater(stage)).toBe(expected)
  })
})

describe("amendIneligibilityReason", () => {
  it("allows an accepted quote on a live booking at any sold stage", () => {
    for (const stage of ["quote_accepted", "deposit_requested", "deposit_paid", "final_paid", "voucher_sent", "trip_active"]) {
      expect(amendIneligibilityReason({ quoteStatus: "accepted", bookingStage: stage, bookingCancelledAt: null })).toBeNull()
    }
  })

  it.each(["draft", "pricing_incomplete", "sent", "expired", "superseded", "cancelled"])(
    "refuses a %s quote",
    (quoteStatus) => {
      expect(
        amendIneligibilityReason({ quoteStatus, bookingStage: "deposit_paid", bookingCancelledAt: null }),
      ).toBe("Only an accepted quote can be amended.")
    },
  )

  it("refuses a cancelled booking, by stage or by cancelled_at", () => {
    expect(amendIneligibilityReason({ quoteStatus: "accepted", bookingStage: "lost", bookingCancelledAt: null })).toContain(
      "cancelled",
    )
    expect(
      amendIneligibilityReason({ quoteStatus: "accepted", bookingStage: "deposit_paid", bookingCancelledAt: "2026-10-01" }),
    ).toContain("cancelled")
  })

  it("refuses a closed booking", () => {
    expect(amendIneligibilityReason({ quoteStatus: "accepted", bookingStage: "closed", bookingCancelledAt: null })).toContain(
      "closed",
    )
  })
})
