import { describe, expect, it } from "vitest"

import {
  detectFieldConflicts,
  fieldConflictResponse,
  staleVersionResponse,
  valuesEqual,
} from "./concurrency"

describe("staleVersionResponse", () => {
  it("returns a 409 with STALE_VERSION code and the current updated_at", async () => {
    const response = staleVersionResponse("customer", "2026-08-06T09:00:00.000Z")
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe("STALE_VERSION")
    expect(body.currentUpdatedAt).toBe("2026-08-06T09:00:00.000Z")
  })
})

describe("fieldConflictResponse", () => {
  it("returns a 409 with FIELD_CONFLICT code and the conflicting field names", async () => {
    const response = fieldConflictResponse(
      "customer",
      [
        { field: "email", theirs: "a@x.com", yours: "b@x.com" },
        { field: "phone", theirs: "1", yours: "2" },
      ],
      "2026-08-06T09:00:00.000Z",
    )
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe("FIELD_CONFLICT")
    expect(body.fields).toEqual(["email", "phone"])
    expect(body.error).toContain("email")
    expect(body.error).toContain("phone")
  })
})

describe("valuesEqual", () => {
  it("treats null, undefined, and empty string as equal", () => {
    expect(valuesEqual(null, undefined)).toBe(true)
    expect(valuesEqual(null, "")).toBe(true)
    expect(valuesEqual(undefined, "")).toBe(true)
  })

  it("compares numbers and numeric strings by value", () => {
    expect(valuesEqual(5, "5")).toBe(true)
    expect(valuesEqual(5, 6)).toBe(false)
  })

  it("compares equal strings as equal, different strings as different", () => {
    expect(valuesEqual("a", "a")).toBe(true)
    expect(valuesEqual("a", "b")).toBe(false)
  })

  it("treats a real value as different from null", () => {
    expect(valuesEqual("a", null)).toBe(false)
    expect(valuesEqual(null, "a")).toBe(false)
  })
})

describe("detectFieldConflicts", () => {
  it("returns nothing when the other user changed a field the caller isn't touching", () => {
    // Caller is editing phone only; someone else's write to notes bumped
    // updated_at but shouldn't block this save.
    const patch = { phone: "new-phone", notes: "old-notes" }
    const baseline = { phone: "old-phone", notes: "old-notes" }
    const current = { phone: "old-phone", notes: "someone-else-changed-this" }

    const conflicts = detectFieldConflicts(patch, baseline, current)
    expect(conflicts).toEqual([])
  })

  it("returns a conflict when both the caller and someone else changed the same field", () => {
    const patch = { email: "mine@x.com" }
    const baseline = { email: "original@x.com" }
    const current = { email: "theirs@x.com" }

    const conflicts = detectFieldConflicts(patch, baseline, current)
    expect(conflicts).toEqual([{ field: "email", theirs: "theirs@x.com", yours: "mine@x.com" }])
  })

  it("does not flag a field the caller isn't actually changing, even if it also matches baseline", () => {
    const patch = { email: "same@x.com" }
    const baseline = { email: "same@x.com" }
    const current = { email: "same@x.com" }

    expect(detectFieldConflicts(patch, baseline, current)).toEqual([])
  })

  it("ignores baseline fields the patch doesn't include", () => {
    const patch = { phone: "new-phone" }
    const baseline = { phone: "old-phone", email: "original@x.com" }
    const current = { phone: "old-phone", email: "drifted@x.com" }

    expect(detectFieldConflicts(patch, baseline, current)).toEqual([])
  })

  it("treats null/empty-string drift as no conflict", () => {
    const patch = { fax: "123" }
    const baseline = { fax: null }
    const current = { fax: "" }

    expect(detectFieldConflicts(patch, baseline, current)).toEqual([])
  })
})
