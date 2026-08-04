// @vitest-environment node
// jsdom breaks @react-pdf font subsetting (corrupt embedded TTF subsets);
// production renders run in the Node runtime, so the test must too.
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { createRequire } from "node:module"
import path from "path"
import { describe, expect, it } from "vitest"

import type { VoucherData } from "@/lib/generate-voucher"
import type { VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { sampleVoucherData, sampleVoucherServiceBlocks } from "../sample-data"
import { renderVoucherPdf } from "../../render-pdf"

const require = createRequire(import.meta.url)
// pdf-parse ships CJS with no usable type surface for text extraction.
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>

const WRITE_PDF = Boolean(process.env.WRITE_PDF)

const sampleData = sampleVoucherData
const serviceBlocks = sampleVoucherServiceBlocks

async function renderAndAssert(name: string, data: VoucherData, template?: VoucherTemplate | null): Promise<Buffer> {
  const buffer = await renderVoucherPdf({ data, template })
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
    const { text } = await pdfParse(buffer)
    expect(text).toContain("Cape Town → Pretoria")
  })

  it("renders multiple service blocks across pages", async () => {
    await renderAndAssert("multi-block", { ...sampleData(), serviceBlocks: serviceBlocks() })
  })

  it.each([
    ["georgia", "Georgia, serif"],
    ["playfair", "'Playfair Display', Georgia, serif"],
    ["arial", "Arial, sans-serif"],
    ["montserrat", "'Montserrat', Arial, sans-serif"],
  ])("renders with the %s template font option", async (name, fontFamily) => {
    await renderAndAssert(`font-${name}`, sampleData(), { ...VOUCHER_TEMPLATE_DEFAULTS, font_family: fontFamily })
  })

  it("renders the logo-only header variant", async () => {
    const png = readFileSync(path.join(process.cwd(), "public", "placeholder-logo.png"))
    await renderAndAssert("logo-only", sampleData(), {
      ...VOUCHER_TEMPLATE_DEFAULTS,
      logo_url: `data:image/png;base64,${png.toString("base64")}`,
    })
  })

  it("falls back to the text-only header when a lingering SVG asset URL is present", async () => {
    // No network fetch happens — the SVG guard drops the URL before render.
    await renderAndAssert("svg-guard", sampleData(), {
      ...VOUCHER_TEMPLATE_DEFAULTS,
      banner_url: "https://example.test/storage/voucher-assets/banner.svg?t=123",
      logo_url: "https://example.test/storage/voucher-assets/logo.SVG",
    })
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
