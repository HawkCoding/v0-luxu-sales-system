import { describe, expect, it } from "vitest"
import {
  buildErrorResponse,
  makeUuid,
  normalizeNullableDate,
  normalizeText,
} from "./helpers"

describe("normalizeText", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello")
  })

  it("returns null for empty/whitespace-only values", () => {
    expect(normalizeText("")).toBeNull()
    expect(normalizeText("   ")).toBeNull()
  })
})

describe("normalizeNullableDate", () => {
  it("keeps valid date strings", () => {
    expect(normalizeNullableDate("2026-01-01")).toBe("2026-01-01")
  })

  it("returns null for null/blank values", () => {
    expect(normalizeNullableDate("")).toBeNull()
    expect(normalizeNullableDate("   ")).toBeNull()
    expect(normalizeNullableDate(null)).toBeNull()
  })
})

describe("buildErrorResponse", () => {
  it("returns default 400 error response", async () => {
    const response = buildErrorResponse("Invalid payload")
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" })
  })

  it("returns custom status when provided", async () => {
    const response = buildErrorResponse("Conflict", 409)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: "Conflict" })
  })
})

describe("makeUuid", () => {
  it("returns UUIDv4-looking values and different values per call", () => {
    const first = makeUuid()
    const second = makeUuid()

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    expect(first).toMatch(uuidPattern)
    expect(second).toMatch(uuidPattern)
    expect(first).not.toBe(second)
  })
})
