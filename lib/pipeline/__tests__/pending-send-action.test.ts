import { describe, expect, it } from "vitest"
import { resolvePendingSendAction } from "@/lib/pipeline/pending-send-action"
import type { GateFailure } from "@/lib/pipeline/validate-transition"

function failure(overrides: Partial<GateFailure> & Pick<GateFailure, "gateId" | "severity">): GateFailure {
  return {
    message: "message",
    fixHint: "fixHint",
    ...overrides,
  }
}

describe("resolvePendingSendAction", () => {
  it("maps invoice_correspondence to deposit_invoice", () => {
    expect(
      resolvePendingSendAction([failure({ gateId: "invoice_correspondence", severity: "block" })]),
    ).toBe("deposit_invoice")
  })

  it("maps final_invoice_correspondence to payment_confirmation", () => {
    expect(
      resolvePendingSendAction([failure({ gateId: "final_invoice_correspondence", severity: "block" })]),
    ).toBe("payment_confirmation")
  })

  it("maps voucher_correspondence to voucher", () => {
    expect(
      resolvePendingSendAction([failure({ gateId: "voucher_correspondence", severity: "block" })]),
    ).toBe("voucher")
  })

  it("returns null for gates with no pending-send mapping", () => {
    expect(
      resolvePendingSendAction([failure({ gateId: "customer_complete", severity: "block" })]),
    ).toBeNull()
  })

  it("returns null when a second blocking failure is present", () => {
    expect(
      resolvePendingSendAction([
        failure({ gateId: "invoice_correspondence", severity: "block" }),
        failure({ gateId: "customer_complete", severity: "block" }),
      ]),
    ).toBeNull()
  })

  it("tolerates co-occurring confirm-severity failures", () => {
    expect(
      resolvePendingSendAction([
        failure({ gateId: "voucher_correspondence", severity: "block" }),
        failure({ gateId: "final_payment_confirmation", severity: "confirm" }),
      ]),
    ).toBe("voucher")
  })

  it("returns null when there are no failures at all", () => {
    expect(resolvePendingSendAction([])).toBeNull()
  })
})
