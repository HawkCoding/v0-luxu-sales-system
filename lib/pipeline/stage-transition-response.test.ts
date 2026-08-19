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
        canOverride: true,
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
      canOverride: true,
    })
  })

  it("rejects generic error responses", () => {
    expect(parseStageTransitionFailurePayload({ error: "Request failed" })).toBeNull()
    expect(parseStageTransitionFailurePayload({ failures: [{ gateId: "missing" }] })).toBeNull()
  })

  it("returns typed failures from the standard error details shape", () => {
    expect(
      parseStageTransitionFailurePayload({
        error: "Stage transition blocked",
        details: {
          failures: [
            {
              gateId: "voucher_balance_zero",
              message: "The invoice balance must be zero before generating a voucher.",
              fixHint: "Record all outstanding payments to clear the invoice balance.",
              severity: "block",
            },
          ],
          canOverride: false,
        },
      }),
    ).toEqual({
      failures: [
        {
          gateId: "voucher_balance_zero",
          message: "The invoice balance must be zero before generating a voucher.",
          fixHint: "Record all outstanding payments to clear the invoice balance.",
          severity: "block",
        },
      ],
      canOverride: false,
    })
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
