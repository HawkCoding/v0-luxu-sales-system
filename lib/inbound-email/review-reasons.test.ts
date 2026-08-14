import { describe, expect, it } from "vitest"
import {
  buildReviewDecision,
  describeReviewReasons,
  REVIEW_REASON,
  REVIEW_REASON_DETAIL,
} from "@/lib/inbound-email/review-reasons"

const EMPTY = {
  missingFields: [],
  warnings: [],
  hasUnresolvedSuites: false,
  resolutionFailures: [],
  duplicateOfBookingId: null,
}

describe("REVIEW_REASON_DETAIL", () => {
  it("has copy for every reason the app can store", () => {
    for (const reason of Object.values(REVIEW_REASON)) {
      const detail = REVIEW_REASON_DETAIL[reason]
      expect(detail, `missing detail for "${reason}"`).toBeDefined()
      expect(detail.label.length).toBeGreaterThan(0)
      expect(detail.fixHint.length).toBeGreaterThan(0)
    }
  })
})

describe("buildReviewDecision", () => {
  it("does not flag a clean import", () => {
    expect(buildReviewDecision(EMPTY)).toEqual({
      needsReview: false,
      missingFields: [],
      warnings: [],
    })
  })

  it("names the duplicate instead of flagging silently", () => {
    const decision = buildReviewDecision({ ...EMPTY, duplicateOfBookingId: "booking-1" })

    expect(decision.needsReview).toBe(true)
    expect(decision.missingFields).toEqual([REVIEW_REASON.possibleDuplicate])
  })

  it("never flags without a reason, whatever the input", () => {
    const inputs = [
      { ...EMPTY, missingFields: [REVIEW_REASON.departureDate] },
      { ...EMPTY, hasUnresolvedSuites: true },
      { ...EMPTY, resolutionFailures: [REVIEW_REASON.supplierUnmatched] },
      { ...EMPTY, duplicateOfBookingId: "booking-1" },
      { ...EMPTY, warnings: ["Departure date parsed with low confidence"] },
    ]

    for (const input of inputs) {
      const decision = buildReviewDecision(input)
      expect(decision.needsReview).toBe(decision.missingFields.length > 0)
      if (decision.needsReview) expect(decision.missingFields.length).toBeGreaterThan(0)
    }
  })

  it("keeps warnings out of the blocking decision", () => {
    const decision = buildReviewDecision({
      ...EMPTY,
      warnings: ["Departure date parsed with low confidence"],
    })

    expect(decision.needsReview).toBe(false)
    expect(decision.warnings).toEqual(["Departure date parsed with low confidence"])
  })

  it("does not duplicate a reason already reported before resolution", () => {
    const decision = buildReviewDecision({
      ...EMPTY,
      missingFields: [REVIEW_REASON.suiteType],
      hasUnresolvedSuites: true,
    })

    expect(decision.missingFields).toEqual([REVIEW_REASON.suiteType])
  })
})

describe("describeReviewReasons", () => {
  it("returns label and fix hint for known reasons, blocking on missing fields", () => {
    const [described] = describeReviewReasons([REVIEW_REASON.departureDate], [])

    expect(described.reason).toBe(REVIEW_REASON.departureDate)
    expect(described.severity).toBe("block")
    expect(described.label).toBe(REVIEW_REASON_DETAIL[REVIEW_REASON.departureDate].label)
  })

  it("marks warnings as non-blocking", () => {
    const [described] = describeReviewReasons([], ["Departure date parsed with low confidence"])

    expect(described.severity).toBe("warn")
  })

  it("passes unknown legacy strings through verbatim", () => {
    const [described] = describeReviewReasons(["Some retired reason string"], [])

    expect(described.label).toBe("Some retired reason string")
    expect(described.fixHint.length).toBeGreaterThan(0)
  })

  it("falls back to a named reason rather than an empty banner", () => {
    const described = describeReviewReasons([], [])

    expect(described).toHaveLength(1)
    expect(described[0].reason).toBe(REVIEW_REASON.unspecified)
  })

  it("de-duplicates a reason stored in both lists", () => {
    expect(describeReviewReasons([REVIEW_REASON.suiteType], [REVIEW_REASON.suiteType])).toHaveLength(1)
  })

  it("tolerates null arrays from legacy rows", () => {
    expect(describeReviewReasons(null, undefined)).toHaveLength(1)
  })
})
