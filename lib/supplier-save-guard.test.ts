import { describe, expect, it } from "vitest"
import {
  parseStaleVersionConflictPayload,
  SupplierPatchWriteLock,
} from "@/lib/supplier-save-guard"

describe("parseStaleVersionConflictPayload", () => {
  it("returns normalized payload for stale-version conflicts", () => {
    const parsed = parseStaleVersionConflictPayload({
      error: "Supplier changed",
      code: "STALE_VERSION",
      currentUpdatedAt: "2026-03-30T09:00:00.000Z",
    })

    expect(parsed).toEqual({
      error: "Supplier changed",
      code: "STALE_VERSION",
      currentUpdatedAt: "2026-03-30T09:00:00.000Z",
    })
  })

  it("returns null for unrelated payloads", () => {
    expect(parseStaleVersionConflictPayload({ error: "Bad request" })).toBeNull()
    expect(
      parseStaleVersionConflictPayload({
        error: "Supplier changed",
        code: "STALE_VERSION",
      }),
    ).toBeNull()
  })
})

describe("SupplierPatchWriteLock", () => {
  it("allows only one concurrent acquisition", () => {
    const lock = new SupplierPatchWriteLock()
    expect(lock.tryAcquire()).toBe(true)
    expect(lock.tryAcquire()).toBe(false)
    lock.release()
    expect(lock.tryAcquire()).toBe(true)
  })
})
