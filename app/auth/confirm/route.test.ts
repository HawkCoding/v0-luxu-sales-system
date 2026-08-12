import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createSessionClient: vi.fn() }))

import { getSafeNextPath, resolveOtpType } from "./route"

describe("resolveOtpType", () => {
  it("accepts the email OTP types the app sends", () => {
    expect(resolveOtpType("recovery")).toBe("recovery")
    expect(resolveOtpType("magiclink")).toBe("magiclink")
    expect(resolveOtpType("invite")).toBe("invite")
  })

  it("rejects anything else", () => {
    expect(resolveOtpType(null)).toBeNull()
    expect(resolveOtpType("")).toBeNull()
    expect(resolveOtpType("sms")).toBeNull()
    expect(resolveOtpType("recovery; drop table")).toBeNull()
  })
})

describe("getSafeNextPath", () => {
  it("keeps a same-origin path", () => {
    expect(getSafeNextPath("/auth/set-new-password")).toBe("/auth/set-new-password")
  })

  it("falls back to /app for anything that could leave the origin", () => {
    expect(getSafeNextPath(null)).toBe("/app")
    expect(getSafeNextPath("https://evil.example")).toBe("/app")
    expect(getSafeNextPath("//evil.example")).toBe("/app")
    expect(getSafeNextPath("app/bookings")).toBe("/app")
  })
})
