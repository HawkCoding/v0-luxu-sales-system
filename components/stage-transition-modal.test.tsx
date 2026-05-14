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

  it("routes voucher balance failures to the payments tab", () => {
    expect(gateIdToTabPath("voucher_balance_zero")).toBe("?tab=payments")
  })

  it("routes voucher booking and customer readiness failures to the enquiry tab", () => {
    expect(gateIdToTabPath("voucher_departure_date")).toBe("?tab=enquiry")
    expect(gateIdToTabPath("voucher_customer_email")).toBe("?tab=enquiry")
  })

  it("keeps voucher document and correspondence failures on their owning tabs", () => {
    expect(gateIdToTabPath("voucher_document")).toBe("?tab=documents")
    expect(gateIdToTabPath("voucher_correspondence")).toBe("?tab=correspondence")
  })
})
