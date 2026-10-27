import { describe, expect, it } from "vitest"
import { normalizeRequestPath, shouldReport, SLOW_REQUEST_MS } from "./slow-request-reporter"

describe("normalizeRequestPath", () => {
  it("strips the query string and replaces UUIDs", () => {
    expect(
      normalizeRequestPath("/api/jobs/123e4567-e89b-42d3-a456-426614174000/services?x=1"),
    ).toBe("/api/jobs/:id/services")
  })
})

describe("shouldReport", () => {
  it("reports slow requests", () => {
    expect(shouldReport(SLOW_REQUEST_MS, 200)).toBe(true)
  })
  it("reports server errors even when fast", () => {
    expect(shouldReport(50, 500)).toBe(true)
  })
  it("ignores fast successful requests", () => {
    expect(shouldReport(SLOW_REQUEST_MS - 1, 200)).toBe(false)
  })
})
