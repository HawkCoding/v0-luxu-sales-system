// @vitest-environment node
// jsdom breaks @react-pdf font subsetting (corrupt embedded TTF subsets);
// production renders run in the Node runtime, so the test must too.
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import type { VoucherData } from "@/lib/generate-voucher"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import type { VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { extractPdfText } from "@/lib/pdf/extract-text.fixtures"
import { sampleVoucherData, sampleVoucherServiceBlocks } from "../sample-data"
import { renderVoucherPdf } from "../../render-pdf"

const WRITE_PDF = Boolean(process.env.WRITE_PDF)

const sampleData = sampleVoucherData
const serviceBlocks = sampleVoucherServiceBlocks

async function renderAndAssert(
  name: string,
  data: VoucherData,
  template?: VoucherTemplate | null,
  brandLogo?: BrandLogoImage | null,
): Promise<Buffer> {
  const buffer = await renderVoucherPdf({ data, template, brandLogo })
  expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF")
  expect(buffer.length).toBeGreaterThan(1000)
  if (WRITE_PDF) {
    const dir = path.join(process.cwd(), "tmp")
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `voucher-${name}.pdf`), buffer)
  }
  return buffer
}

describe("renderVoucherPdf smoke", () => {
  it("renders with the default template", async () => {
    await renderAndAssert("default", sampleData())
  })

  it("renders the route arrow correctly, not mangled by a missing font glyph", async () => {
    const buffer = await renderAndAssert("route-arrow", sampleData())
    const text = await extractPdfText(buffer)
    expect(text).toContain("Cape Town → Pretoria")
  })

  it("renders multiple service blocks across pages", async () => {
    await renderAndAssert("multi-block", { ...sampleData(), serviceBlocks: serviceBlocks() })
  })

  it.each([
    ["arial", "Arial, sans-serif"],
    ["helvetica", "Helvetica, Arial, sans-serif"],
    ["calibri", "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif"],
    ["georgia", "Georgia, serif"],
    ["times", "'Times New Roman', Times, serif"],
    ["verdana", "Verdana, Geneva, sans-serif"],
  ])("renders with the %s template font option", async (name, fontFamily) => {
    await renderAndAssert(`font-${name}`, sampleData(), { ...VOUCHER_TEMPLATE_DEFAULTS, font_family: fontFamily })
  })

  it("renders the logo header variant", async () => {
    const png = readFileSync(path.join(process.cwd(), "public", "placeholder-logo.png"))
    await renderAndAssert("logo", sampleData(), VOUCHER_TEMPLATE_DEFAULTS, { data: png, format: "png" })
  })

  it("renders a custom document title", async () => {
    const buffer = await renderVoucherPdf({ data: sampleData(), docTitle: "SERVICE VOUCHERS" })
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF")
  })

  it("respects hidden sections and reordering", async () => {
    await renderAndAssert("reordered", { ...sampleData(), serviceBlocks: serviceBlocks() }, {
      ...VOUCHER_TEMPLATE_DEFAULTS,
      section_order: ["service_provider", "guest_info", "footer"],
      hidden_sections: ["footer"],
    })
  })
})
