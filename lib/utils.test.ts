import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("merges plain class strings", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center")
  })

  it("ignores falsy conditional values", () => {
    expect(cn("base", false && "hidden", undefined, null, "active")).toBe("base active")
  })

  it("resolves conflicting tailwind classes with the last value winning", () => {
    expect(cn("p-4 text-sm", "p-2", "text-lg")).toBe("p-2 text-lg")
  })
})
