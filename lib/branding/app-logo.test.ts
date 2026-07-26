import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceClientMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: serviceClientMocks.createServiceClient,
}))

import { getAppBranding } from "./app-logo"

function makeSupabase(rows: Array<{ key: string; value: string }> | null, error: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({ data: rows, error })),
    })),
  }
}

describe("getAppBranding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the uploaded logo and business name", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase([
        { key: "app_logo_url", value: "https://cdn.example.com/brand/app-logo.png?t=1" },
        { key: "business_name", value: "Acme Travel" },
      ]),
    )

    expect(await getAppBranding()).toEqual({
      logoUrl: "https://cdn.example.com/brand/app-logo.png?t=1",
      businessName: "Acme Travel",
    })
  })

  it("falls back to null logo and default business name when unset", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(makeSupabase([]))

    expect(await getAppBranding()).toEqual({ logoUrl: null, businessName: "Luxus Travel" })
  })

  it("treats a blank stored value as no logo", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase([{ key: "app_logo_url", value: "" }]),
    )

    expect((await getAppBranding()).logoUrl).toBeNull()
  })

  it("rejects an SVG logo URL", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase([{ key: "app_logo_url", value: "https://cdn.example.com/logo.svg" }]),
    )

    expect((await getAppBranding()).logoUrl).toBeNull()
  })

  it("never throws — falls back to defaults on a query error", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase(null, { message: "db down" }),
    )

    expect(await getAppBranding()).toEqual({ logoUrl: null, businessName: "Luxus Travel" })
  })

  it("never throws — falls back to defaults when the service client throws", async () => {
    serviceClientMocks.createServiceClient.mockImplementation(() => {
      throw new Error("no service role key")
    })

    expect(await getAppBranding()).toEqual({ logoUrl: null, businessName: "Luxus Travel" })
  })
})
