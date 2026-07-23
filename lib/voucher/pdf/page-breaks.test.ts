// @vitest-environment node
// pdf-parse pulls in pdf.js, which needs the node environment (jsdom trips the
// "No PDFJS.workerSrc specified" path).
import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { renderVoucherPdf } from "../render-pdf"
import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"

const require = createRequire(import.meta.url)
// pdf-parse ships CJS with no usable type surface for the pagerender hook.
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
  options?: { pagerender: (page: PdfPage) => Promise<string> },
) => Promise<unknown>

interface PdfPage {
  getTextContent: (options: unknown) => Promise<{ items: Array<{ str: string }> }>
}

function serviceBlock(index: number, notes?: string): VoucherServiceBlock {
  return {
    serviceType: "hotel",
    title: `SEGMENT-${index}`,
    supplierReference: `REF-${index}`,
    contactDetails: {
      name: `Provider ${index}`,
      phone: "+27 11 000 0000",
      email: `provider${index}@example.com`,
      location: "Cape Town, South Africa",
    },
    serviceData: {
      roomType: "Deluxe Suite",
      nights: 3,
      mealPlan: "Bed & Breakfast",
      departureDate: `2026-09-0${(index % 9) + 1}`,
      arrivalDate: `2026-09-1${(index % 9) + 1}`,
      notes: notes ?? `Standard note for segment ${index}.`,
    },
    displayOrder: index,
  }
}

const OVERSIZED_BLOCK = 8

const voucherData = {
  voucherNumber: "BT-2026-0001-V1",
  guestNames: "Mr & Mrs Example",
  consultantName: "Test Consultant",
  supplierName: "Legacy Supplier",
  route: "Pretoria — Cape Town",
  departure: "2026-09-01",
  arrival: "2026-09-04",
  suiteType: "Royal Suite",
  numberOfGuests: 2,
  specialRequests: "None",
  customerEmail: "guest@example.com",
  customerPhone: "+27 82 000 0000",
  consultant: "TC",
  enquiry: { noOfAdults: 2, noOfChildren: 0, noOfSuites: 1 },
  serviceBlocks: Array.from({ length: 9 }, (_, i) =>
    serviceBlock(i + 1, i + 1 === OVERSIZED_BLOCK ? "X ".repeat(1200) : undefined),
  ),
} as unknown as VoucherData

// Section titles carry letterSpacing, so pdf.js emits their glyphs as separate
// items — whitespace is stripped before matching.
async function pageTexts(buffer: Buffer): Promise<string[]> {
  const pages: string[] = []
  await pdfParse(buffer, {
    pagerender: async (page) => {
      const content = await page.getTextContent({ normalizeWhitespace: true })
      const text = content.items.map((item) => item.str).join(" ")
      pages.push(text.replace(/\s+/g, ""))
      return text
    },
  })
  return pages
}

describe("voucher page breaks", () => {
  it("never splits a service block across pages", async () => {
    const pages = await pageTexts(await renderVoucherPdf({ data: voucherData }))

    for (let i = 1; i <= 9; i++) {
      if (i === OVERSIZED_BLOCK) continue // taller than a page: must stay wrappable
      const titlePage = pages.findIndex((page) => new RegExp(`SEGMENT-${i}(?!\\d)`).test(page))
      const rowPage = pages.findIndex((page) => new RegExp(`REF-${i}(?!\\d)`).test(page))
      expect(titlePage).toBeGreaterThanOrEqual(0)
      expect(`segment-${i} rows on page ${rowPage}`).toBe(`segment-${i} rows on page ${titlePage}`)
    }
  }, 60_000)

  it("still wraps a block too tall to fit on one page", async () => {
    const pages = await pageTexts(await renderVoucherPdf({ data: voucherData }))
    const titlePage = pages.findIndex((page) => new RegExp(`SEGMENT-${OVERSIZED_BLOCK}(?!\\d)`).test(page))

    expect(titlePage).toBeGreaterThanOrEqual(0)
    // its notes continue onto the following page rather than being clipped
    expect(pages[titlePage + 1]).toMatch(/X/)
  }, 60_000)
})
