import { beforeEach, describe, expect, it, vi } from "vitest"

const brandingMocks = vi.hoisted(() => ({
  getAppBranding: vi.fn(),
}))

vi.mock("@/lib/branding/app-logo", () => ({
  getAppBranding: brandingMocks.getAppBranding,
}))

import { GET } from "./route"

describe("GET /api/branding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the branding payload without requiring auth", async () => {
    brandingMocks.getAppBranding.mockResolvedValue({
      logoUrl: "https://cdn.example.com/brand/app-logo.png",
      businessName: "Acme Travel",
    })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      logoUrl: "https://cdn.example.com/brand/app-logo.png",
      businessName: "Acme Travel",
    })
  })

  it("returns a null logo when none is uploaded", async () => {
    brandingMocks.getAppBranding.mockResolvedValue({ logoUrl: null, businessName: "Luxus Travel" })

    const body = await (await GET()).json()
    expect(body.logoUrl).toBeNull()
  })
})
