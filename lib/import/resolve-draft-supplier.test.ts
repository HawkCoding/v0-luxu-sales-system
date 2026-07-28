import { describe, expect, it } from "vitest"
import { resolveDraftSupplierId } from "./resolve-draft-supplier"

describe("resolveDraftSupplierId", () => {
  it("resolves an exact (filler-stripped) match", () => {
    const suppliers = [
      { id: "sup-1", name: "The Blue Train" },
      { id: "sup-2", name: "Rovos Rail" },
    ]

    expect(resolveDraftSupplierId("Blue Train", suppliers)).toBe("sup-1")
    expect(resolveDraftSupplierId("Rovos Rail", suppliers)).toBe("sup-2")
  })

  it("never guesses: two suppliers sharing a normalized name resolve to null", () => {
    const suppliers = [
      { id: "sup-1", name: "Rovos Rail" },
      { id: "sup-2", name: "Rovos Rail" },
    ]

    expect(resolveDraftSupplierId("Rovos Rail", suppliers)).toBeNull()
  })

  it("does not resolve a partial mention below the confidence floor", () => {
    const suppliers = [{ id: "sup-1", name: "The Blue Train" }]

    expect(resolveDraftSupplierId("Blue", suppliers)).toBeNull()
  })

  it("returns null for blank text or an empty candidate pool", () => {
    expect(resolveDraftSupplierId("", [{ id: "sup-1", name: "Rovos Rail" }])).toBeNull()
    expect(resolveDraftSupplierId("Rovos Rail", [])).toBeNull()
  })
})
