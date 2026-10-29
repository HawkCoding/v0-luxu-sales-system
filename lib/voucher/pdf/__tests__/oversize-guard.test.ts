// @vitest-environment node
// jsdom breaks @react-pdf font subsetting; production renders run in the Node runtime.
import { afterEach, describe, expect, it, vi } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { renderItineraryPdf } from "@/lib/itinerary/render-pdf"
import { sampleServiceBlocks, sampleVoucherData } from "@/lib/pdf/design-review/sample-booking"
import { renderVoucherPdf } from "../../render-pdf"

// react-pdf does not refuse a keep-together block that is taller than the page: it logs this
// warning and squashes the page, printing rows over each other. Every block the keep-together rule
// holds whole must therefore genuinely fit, line breaks in its values included.
const CANT_WRAP = "can't wrap between pages"

function cantWrapWarnings(spy: ReturnType<typeof vi.spyOn>): unknown[] {
  return spy.mock.calls.filter((call: unknown[]) => String(call[0]).includes(CANT_WRAP))
}

function withNotes(block: VoucherServiceBlock, lineCount: number): VoucherServiceBlock {
  const notes = Array.from({ length: lineCount }, (_, index) => `Note line ${index + 1}`).join("\n")
  return { ...block, serviceData: { ...block.serviceData, notes } }
}

const [transfer, hotel, train] = sampleServiceBlocks()

const fourteenDayTour: VoucherServiceBlock = {
  serviceType: "tour",
  title: "Kruger Safari",
  displayOrder: 9,
  contactDetails: { name: "Safari Operator", phone: "+27 13 000 0000" },
  serviceData: {
    suiteType: "14-Day Safari",
    departureDate: "2027-03-26",
    arrivalDate: "2027-04-08",
    itineraryDescription: Array.from(
      { length: 14 },
      (_, day) => `Day ${day + 1}: Morning and afternoon game drives with a sundowner stop and dinner at the lodge.`,
    ).join("\n"),
  },
}

describe("keep-together never over-fills a page", { timeout: 60_000 }, () => {
  afterEach(() => vi.restoreAllMocks())

  it("breaks a voucher's last block with a day-by-day itinerary instead of squashing it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await renderVoucherPdf({ data: { ...sampleVoucherData(), serviceBlocks: [...sampleServiceBlocks(), fourteenDayTour] } })
    expect(cantWrapWarnings(warn)).toEqual([])
  })

  it("handles a voucher block with fifty short lines of notes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await renderVoucherPdf({ data: { ...sampleVoucherData(), serviceBlocks: [transfer, hotel, withNotes(train, 50)] } })
    expect(cantWrapWarnings(warn)).toEqual([])
  })

  it("handles an itinerary's last block with twenty-five lines of notes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await renderItineraryPdf({
      data: {
        bookingNumber: "LTT-26-0035",
        tripTitle: "Rovos Rail Golf Safari",
        tripNotes: "",
        guestNames: "Mr Hancke le Roux, Mrs Jean Adams",
        departure: "16 March 2027",
        consultantName: "Carmen de Jager",
        serviceBlocks: [transfer, hotel, withNotes(train, 25)],
      },
    })
    expect(cantWrapWarnings(warn)).toEqual([])
  })
})
