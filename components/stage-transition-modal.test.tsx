import { describe, expect, it } from "vitest"
import { gateIdToTabPath } from "./stage-transition-modal"

describe("gateIdToTabPath", () => {
  it("routes customer-completeness failures to the enquiry tab", () => {
    expect(gateIdToTabPath("customer_complete")).toBe("?tab=enquiry")
  })
})
