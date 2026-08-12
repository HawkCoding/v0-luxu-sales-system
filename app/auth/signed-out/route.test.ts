import { describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}))

import { resolveSignedOutReason } from "./route"

describe("resolveSignedOutReason", () => {
  it("passes through the reasons the app layout uses", () => {
    expect(resolveSignedOutReason("account-inactive")).toBe("account-inactive")
    expect(resolveSignedOutReason("unauthorized")).toBe("unauthorized")
  })

  it("falls back to auth-failed for anything else", () => {
    expect(resolveSignedOutReason(null)).toBe("auth-failed")
    expect(resolveSignedOutReason("")).toBe("auth-failed")
    expect(resolveSignedOutReason("javascript:alert(1)")).toBe("auth-failed")
    expect(resolveSignedOutReason("../../admin")).toBe("auth-failed")
  })
})
