// @vitest-environment node
// Text extraction runs pdf.js, which needs the node environment (jsdom trips the
// "No PDFJS.workerSrc specified" path).
import { beforeAll, describe, expect, it } from "vitest"
import { renderVoucherPdf } from "../render-pdf"
import { extractPdfPageTexts } from "@/lib/pdf/extract-text.fixtures"
import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"

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
  passengerTotals: { adultCount: 2, childCount: 0, infantCount: 0 },
  specialRequests: "None",
  customerEmail: "guest@example.com",
  customerPhone: "+27 82 000 0000",
  consultant: "TC",
  enquiry: { noOfAdults: 2, noOfChildren: 0, noOfSuites: 1 },
  serviceBlocks: Array.from({ length: 9 }, (_, i) =>
    // Block 8 is taller than a whole page on its own (~110 lines of notes) — the one block allowed
    // to break.
    serviceBlock(i + 1, i + 1 === OVERSIZED_BLOCK ? "X ".repeat(6000) : undefined),
  ),
} as unknown as VoucherData

// Section titles carry letterSpacing, so pdf.js emits their glyphs as separate
// items — whitespace is stripped before matching.
async function pageTexts(buffer: Buffer): Promise<string[]> {
  const pages = await extractPdfPageTexts(buffer)
  return pages.map((page) => page.replace(/\s+/g, ""))
}

describe("voucher page breaks", () => {
  // The oversized block makes this render slow (~50s on a dev machine, longer on a loaded CI
  // runner), so render once and share the pages — rendering per test doubled the cost and tipped
  // CI past its timeout.
  let pages: string[] = []
  beforeAll(async () => {
    pages = await pageTexts(await renderVoucherPdf({ data: voucherData }))
  }, 240_000)

  it("never splits a service block across pages", () => {
    for (let i = 1; i <= 9; i++) {
      if (i === OVERSIZED_BLOCK) continue // taller than a page: must stay wrappable
      // The voucher hides the eyebrow (`block.title`) and heads the box with the provider name
      // instead — `Provider ${i}` is the box heading text actually printed.
      const titlePage = pages.findIndex((page) => new RegExp(`Provider${i}(?!\\d)`).test(page))
      const rowPage = pages.findIndex((page) => new RegExp(`REF-${i}(?!\\d)`).test(page))
      expect(titlePage).toBeGreaterThanOrEqual(0)
      expect(`segment-${i} rows on page ${rowPage}`).toBe(`segment-${i} rows on page ${titlePage}`)
    }
  })

  it("still wraps a block too tall to fit on one page", () => {
    const titlePage = pages.findIndex((page) => new RegExp(`Provider${OVERSIZED_BLOCK}(?!\\d)`).test(page))

    expect(titlePage).toBeGreaterThanOrEqual(0)
    // its notes continue onto the following page rather than being clipped
    expect(pages[titlePage + 1]).toMatch(/X/)
  })
})
