import { describe, expect, it } from "vitest"
import { getApiErrorMessage, parseStageTransitionFailurePayload } from "./stage-transition-response"

describe("parseStageTransitionFailurePayload", () => {
  it("returns typed failures from a stage-gate response", () => {
    expect(
      parseStageTransitionFailurePayload({
        failures: [
          {
            gateId: "quote_sent_or_accepted",
            message: "At least one sent or accepted quote is required before quote acceptance.",
            fixHint: "Send a quote for this job before moving it to Quote Accepted.",
            severity: "block",
          },
        ],
        isManager: true,
      }),
    ).toEqual({
      failures: [
        {
          gateId: "quote_sent_or_accepted",
          message: "At least one sent or accepted quote is required before quote acceptance.",
          fixHint: "Send a quote for this job before moving it to Quote Accepted.",
          severity: "block",
        },
      ],
      isManager: true,
    })
  })

  it("rejects generic error responses", () => {
    expect(parseStageTransitionFailurePayload({ error: "Request failed" })).toBeNull()
    expect(parseStageTransitionFailurePayload({ failures: [{ gateId: "missing" }] })).toBeNull()
  })
})

describe("getApiErrorMessage", () => {
  it("uses the API error when present", () => {
    expect(getApiErrorMessage({ error: "Stage move failed" }, "Fallback")).toBe("Stage move failed")
  })

  it("uses the fallback for non-error payloads", () => {
    expect(getApiErrorMessage({ failures: [] }, "Fallback")).toBe("Fallback")
  })
})
