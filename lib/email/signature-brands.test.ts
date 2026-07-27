import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isEmailSafeAssetUrl, toSignatureBrand, type SignatureBrandRow } from "./signature-brands"
import type { EmailSignatureSettings } from "@/lib/settings-access"

const DEFAULTS: EmailSignatureSettings = {
  signature_enabled: "true",
  signature_company_line: "Global company line",
  signature_registration_line: "Global registration",
  signature_trading_hours: "Global hours",
  signature_divisions_line: "Global divisions",
  signature_confidentiality: "Global confidentiality",
  signature_office_address: "Global address",
}

const BASE_ROW: SignatureBrandRow = {
  id: "brand-1",
  slug: "sa-rail",
  name: "SA Rail",
  banner_url: "https://cdn.example.com/banner.png",
  banner_width: 480,
  banner_height: 120,
  badges: [],
  enabled: true,
  sort_order: 0,
  company_line: null,
  registration_line: null,
  trading_hours: null,
  divisions_line: null,
  confidentiality: null,
  office_address: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("isEmailSafeAssetUrl", () => {
  it("rejects svg and non-https urls, accepts absolute https raster urls", () => {
    expect(isEmailSafeAssetUrl("https://cdn.example.com/a.png")).toBe(true)
    expect(isEmailSafeAssetUrl("https://cdn.example.com/a.svg")).toBe(false)
    expect(isEmailSafeAssetUrl("http://cdn.example.com/a.png")).toBe(false)
    expect(isEmailSafeAssetUrl(null)).toBe(false)
    expect(isEmailSafeAssetUrl(undefined)).toBe(false)
  })

  describe("local Supabase http exception", () => {
    const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
    })

    afterEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL
    })

    it("accepts an http url under the local Supabase storage origin", () => {
      expect(
        isEmailSafeAssetUrl("http://127.0.0.1:54321/storage/v1/object/public/voucher-assets/signature/sa-rail/banner-abc.png"),
      ).toBe(true)
    })

    it("still rejects an http url from a different origin", () => {
      expect(isEmailSafeAssetUrl("http://cdn.example.com/a.png")).toBe(false)
    })

    it("does not activate the exception when the configured Supabase URL is https", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
      expect(isEmailSafeAssetUrl("http://project.supabase.co/storage/v1/object/public/voucher-assets/x.png")).toBe(false)
    })
  })
})

describe("toSignatureBrand", () => {
  it("inherits every global default when the brand's overrides are null", () => {
    const brand = toSignatureBrand(BASE_ROW, DEFAULTS)
    expect(brand.companyLine).toBe("Global company line")
    expect(brand.registrationLine).toBe("Global registration")
    expect(brand.tradingHours).toBe("Global hours")
    expect(brand.divisionsLine).toBe("Global divisions")
    expect(brand.confidentiality).toBe("Global confidentiality")
    expect(brand.officeAddress).toBe("Global address")
  })

  it("inherits the global default when the brand's override is blank", () => {
    const brand = toSignatureBrand({ ...BASE_ROW, company_line: "   " }, DEFAULTS)
    expect(brand.companyLine).toBe("Global company line")
  })

  it("uses the brand's own override when set", () => {
    const brand = toSignatureBrand({ ...BASE_ROW, company_line: "Arnelia House copy" }, DEFAULTS)
    expect(brand.companyLine).toBe("Arnelia House copy")
  })

  it("blanks an SVG banner", () => {
    const brand = toSignatureBrand({ ...BASE_ROW, banner_url: "https://cdn.example.com/a.svg" }, DEFAULTS)
    expect(brand.bannerUrl).toBeNull()
  })

  it("drops a non-https badge", () => {
    const row = {
      ...BASE_ROW,
      badges: [
        { url: "https://cdn.example.com/good.png", alt: "Good", href: null, width: 40, height: 40 },
        { url: "http://cdn.example.com/bad.png", alt: "Bad", href: null, width: 40, height: 40 },
      ],
    }
    const brand = toSignatureBrand(row, DEFAULTS)
    expect(brand.badges).toHaveLength(1)
    expect(brand.badges[0].url).toBe("https://cdn.example.com/good.png")
  })

  it("survives malformed badges jsonb", () => {
    const brand = toSignatureBrand({ ...BASE_ROW, badges: "not-an-array" as never }, DEFAULTS)
    expect(brand.badges).toEqual([])
  })
})
