import { describe, expect, it } from "vitest"
import {
  resolveDocumentBrand,
  toBrandBlockPosition,
  type DocumentBrandSettings,
} from "./settings-access"

describe("toBrandBlockPosition", () => {
  it("passes through a recognised position", () => {
    expect(toBrandBlockPosition("bottom", "top")).toBe("bottom")
  })

  it("falls back to the given default for an unrecognised stored value", () => {
    expect(toBrandBlockPosition("sideways", "top")).toBe("top")
    expect(toBrandBlockPosition("", "bottom")).toBe("bottom")
  })

  it("keeps the email footer default when the stored value is missing", () => {
    // getDocumentBrandForEmail resolves brand_block_position_email with a
    // "bottom" fallback so emails stay in the footer until an admin moves it.
    expect(toBrandBlockPosition("", "bottom")).toBe("bottom")
    expect(toBrandBlockPosition("top", "bottom")).toBe("top")
  })
})

describe("resolveDocumentBrand", () => {
  const settings: DocumentBrandSettings = {
    brand_block_heading: "A division of Luxus Travel & Tours",
    brand_block_subheading: "BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
    brand_block_logo_url: "",
    brand_block_position_quote: "bottom",
    brand_block_position_invoice: "top",
    brand_block_position_email: "bottom",
  }

  it("splits settings into brand copy and per-document position", () => {
    const { brand, position } = resolveDocumentBrand(settings)

    expect(brand).toEqual({
      heading: "A division of Luxus Travel & Tours",
      subheading: "BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
      logoUrl: null,
    })
    expect(position).toEqual({ quote: "bottom", invoice: "top" })
  })

  it("resolves an uploaded logo URL to a non-null value", () => {
    const { brand } = resolveDocumentBrand({
      ...settings,
      brand_block_logo_url: "https://example.supabase.co/storage/v1/object/public/voucher-assets/brand/sarail-footer-logo.png?t=1",
    })
    expect(brand.logoUrl).toBe(
      "https://example.supabase.co/storage/v1/object/public/voucher-assets/brand/sarail-footer-logo.png?t=1",
    )
  })

  it("falls back to defaults for a corrupted stored position", () => {
    const { position } = resolveDocumentBrand({
      ...settings,
      brand_block_position_quote: "not-a-position",
      brand_block_position_invoice: "not-a-position",
    })
    expect(position).toEqual({ quote: "bottom", invoice: "top" })
  })
})
