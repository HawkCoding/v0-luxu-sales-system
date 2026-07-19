import { afterEach, describe, expect, it, vi } from "vitest"

async function loadModule() {
  vi.resetModules()
  return import("./footer-brand")
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getFooterBrandLogoUrl", () => {
  it("builds the public bucket URL from the configured Supabase project", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc123.supabase.co")
    const { getFooterBrandLogoUrl } = await loadModule()

    expect(getFooterBrandLogoUrl()).toBe(
      "https://abc123.supabase.co/storage/v1/object/public/voucher-assets/brand/sarail-footer-logo.png",
    )
  })

  it("does not double up the slash when the project URL has a trailing one", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321/")
    const { getFooterBrandLogoUrl } = await loadModule()

    expect(getFooterBrandLogoUrl()).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/voucher-assets/brand/sarail-footer-logo.png",
    )
  })

  it("returns null when the Supabase URL is unset so the block falls back to text", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    const { getFooterBrandLogoUrl } = await loadModule()

    expect(getFooterBrandLogoUrl()).toBeNull()
  })
})
