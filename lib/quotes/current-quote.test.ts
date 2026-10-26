import { describe, expect, it } from "vitest"
import { pickCurrentQuote } from "./current-quote"

function quote(id: string, status: string, createdAt: string | null = "2026-10-01T08:00:00.000Z") {
  return { id, status, createdAt }
}

describe("pickCurrentQuote", () => {
  it("returns null for no quotes", () => {
    expect(pickCurrentQuote([])).toBeNull()
  })

  it("prefers the accepted quote over newer sent ones", () => {
    const accepted = quote("q1", "accepted", "2026-10-01T08:00:00.000Z")
    const sent = quote("q2", "sent", "2026-10-05T08:00:00.000Z")
    expect(pickCurrentQuote([sent, accepted])?.id).toBe("q1")
  })

  it("takes the newest sent quote when none is accepted", () => {
    const older = quote("q1", "sent", "2026-10-01T08:00:00.000Z")
    const newer = quote("q2", "sent", "2026-10-03T08:00:00.000Z")
    const draft = quote("q3", "draft", "2026-10-09T08:00:00.000Z")
    expect(pickCurrentQuote([older, draft, newer])?.id).toBe("q2")
  })

  it("falls back to an expired quote before a draft", () => {
    const expired = quote("q1", "expired", "2026-09-01T08:00:00.000Z")
    const draft = quote("q2", "draft", "2026-10-01T08:00:00.000Z")
    expect(pickCurrentQuote([draft, expired])?.id).toBe("q1")
  })

  it("takes the newest remaining quote that is not superseded or cancelled", () => {
    const ready = quote("q1", "ready", "2026-10-01T08:00:00.000Z")
    const pricing = quote("q2", "pricing_incomplete", "2026-10-02T08:00:00.000Z")
    const superseded = quote("q3", "superseded", "2026-10-08T08:00:00.000Z")
    const cancelled = quote("q4", "cancelled", "2026-10-09T08:00:00.000Z")
    expect(pickCurrentQuote([ready, superseded, pricing, cancelled])?.id).toBe("q2")
  })

  it("returns null when every quote is superseded or cancelled", () => {
    expect(pickCurrentQuote([quote("q1", "superseded"), quote("q2", "cancelled")])).toBeNull()
  })

  it("still picks a quote when created dates are missing", () => {
    expect(pickCurrentQuote([quote("q1", "sent", null)])?.id).toBe("q1")
  })
})
