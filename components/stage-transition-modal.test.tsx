import { describe, expect, it } from "vitest"
import { gateIdToTabPath } from "./stage-transition-modal"

describe("gateIdToTabPath", () => {
  it("routes customer-completeness failures to the enquiry tab", () => {
    expect(gateIdToTabPath("customer_complete")).toBe("?tab=enquiry")
  })

  it("routes quote-sent failures to the quotes tab", () => {
    expect(gateIdToTabPath("quote_sent_required")).toBe("?tab=quotes")
  })

  it("routes quote-acceptance failures to the quotes tab", () => {
    expect(gateIdToTabPath("quote_sent_or_accepted")).toBe("?tab=quotes")
  })
})
