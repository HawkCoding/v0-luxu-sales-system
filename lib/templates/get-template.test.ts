import { describe, expect, it } from "vitest"
import { DEFAULT_TEMPLATES } from "./get-template"
import { SYSTEM_TEMPLATE_KEYS, getTokenSpecs } from "./registry"

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

// The template editor previews with registry samples. A bare-number sample makes
// a hardcoded literal "R" look correct in preview while a real send emits "RR",
// which is how the bug reached production. Samples must carry the symbol.
describe("registry money-token samples", () => {
  const specs = getTokenSpecs(SYSTEM_TEMPLATE_KEYS[0])

  for (const token of MONEY_TOKENS) {
    const spec = specs.find((s) => s.name === token)
    if (!spec) continue

    it(`${token} sample includes the R currency symbol`, () => {
      expect(spec.sample.startsWith("R")).toBe(true)
    })
  }
})
