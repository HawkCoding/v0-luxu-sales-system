import { describe, expect, it } from "vitest"

import { formatRateCardValidityRange } from "./rate-card-validity"

describe("formatRateCardValidityRange", () => {
  it("formats a fixed date range as day/month/year", () => {
    expect(formatRateCardValidityRange("2026-03-03", "2026-10-03")).toBe(
      "03/03/2026 - 03/10/2026",
    )
  })

  it("formats an open-ended date range as ongoing", () => {
    expect(formatRateCardValidityRange("2026-10-04", null)).toBe("04/10/2026 - Ongoing")
  })

  it("supports screen-specific date formatting", () => {
    expect(
      formatRateCardValidityRange("2026-03-03", null, (value) => value.replaceAll("-", "/")),
    ).toBe("2026/03/03 - Ongoing")
  })
})
