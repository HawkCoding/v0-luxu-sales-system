import { describe, expect, it } from "vitest"
import { shouldAutoAcceptOnQuoteSend } from "./auto-accept-on-quote-send"

const base = {
  kind: "quote",
  stageAfterSend: "quote_sent" as const,
  reservationFormReceivedAt: "2026-11-11T08:51:26.022Z",
  revisionResetAt: null,
}

describe("shouldAutoAcceptOnQuoteSend", () => {
  it("accepts a quote send when the reservation form was already received", () => {
    expect(shouldAutoAcceptOnQuoteSend(base)).toBe(true)
  })

  it("does nothing without a received reservation form", () => {
    expect(shouldAutoAcceptOnQuoteSend({ ...base, reservationFormReceivedAt: null })).toBe(false)
  })

  it("only applies to quote emails", () => {
    expect(shouldAutoAcceptOnQuoteSend({ ...base, kind: "reservation_received" })).toBe(false)
    expect(shouldAutoAcceptOnQuoteSend({ ...base, kind: undefined })).toBe(false)
  })

  it("ignores a tick from before a quote revision", () => {
    expect(
      shouldAutoAcceptOnQuoteSend({ ...base, revisionResetAt: "2026-11-12T09:00:00.000Z" }),
    ).toBe(false)
  })

  it("counts a tick made after the revision", () => {
    expect(
      shouldAutoAcceptOnQuoteSend({ ...base, revisionResetAt: "2026-11-10T09:00:00.000Z" }),
    ).toBe(true)
  })

  it("only moves a booking sitting at Quote Sent", () => {
    expect(shouldAutoAcceptOnQuoteSend({ ...base, stageAfterSend: "enquiry" })).toBe(false)
    expect(shouldAutoAcceptOnQuoteSend({ ...base, stageAfterSend: "accepted" })).toBe(false)
    expect(shouldAutoAcceptOnQuoteSend({ ...base, stageAfterSend: "deposit_requested" })).toBe(false)
  })
})
