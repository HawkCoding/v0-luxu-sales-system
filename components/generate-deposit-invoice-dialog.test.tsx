import { describe, expect, it } from "vitest"
import { billingQuote } from "./generate-deposit-invoice-dialog"
import type { Quote } from "@/lib/types"

function quote(overrides: Partial<Quote>): Quote {
  return {
    id: "q",
    itineraryId: "i",
    jobId: "j",
    status: "draft",
    validityUntil: "2026-12-31",
    lineItems: [],
    subtotal: 0,
    total: 0,
    currency: "ZAR",
    ...overrides,
  }
}

describe("billingQuote", () => {
  it("bills the accepted revision even when its superseded parent was updated later", () => {
    const parent = quote({ id: "q1", status: "superseded", total: 129_530, updatedAt: "2026-10-07T12:00:05Z" })
    const revision = quote({ id: "q2", status: "accepted", total: 121_020, updatedAt: "2026-10-07T12:00:00Z" })
    expect(billingQuote([parent, revision])?.id).toBe("q2")
  })

  it("falls back to the latest priced quote when none is accepted", () => {
    const older = quote({ id: "q1", status: "sent", total: 100, updatedAt: "2026-10-01T00:00:00Z" })
    const newer = quote({ id: "q2", status: "sent", total: 200, updatedAt: "2026-10-02T00:00:00Z" })
    const unpriced = quote({ id: "q3", status: "draft", total: 0, updatedAt: "2026-10-03T00:00:00Z" })
    expect(billingQuote([older, newer, unpriced])?.id).toBe("q2")
  })

  it("returns null with no priced quote", () => {
    expect(billingQuote([quote({ total: 0 })])).toBeNull()
  })
})
