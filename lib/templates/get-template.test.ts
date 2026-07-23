import { describe, expect, it } from "vitest"
import { DEFAULT_TEMPLATES } from "./get-template"

// Regression test for the double-Rand bug: money tokens (amountDue,
// depositAmount, etc.) are resolved via Intl.NumberFormat ZAR currency
// style, which already includes the "R" symbol (e.g. "R 12 345,00"). A
// template that also hardcodes a literal "R"/"R " before the token renders
// "R R 12 345,00" in sent emails. Guard against reintroducing that.
const MONEY_TOKENS = [
  "amountDue",
  "depositAmount",
  "finalAmount",
  "receivedAmount",
  "outstandingAmount",
  "total",
  "amountReceived",
]

describe("DEFAULT_TEMPLATES", () => {
  for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
    for (const token of MONEY_TOKENS) {
      it(`${key} does not hardcode a literal "R" before {{${token}}}`, () => {
        expect(template.bodyHtml).not.toContain(`R {{${token}}}`)
        expect(template.bodyHtml).not.toContain(`R{{${token}}}`)
      })
    }
  }
})
