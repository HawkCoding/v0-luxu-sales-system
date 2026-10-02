// @vitest-environment node
// jsdom breaks @react-pdf font subsetting; production renders run in the Node runtime.
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"
import { extractPdfText } from "@/lib/pdf/extract-text.fixtures"
import { sampleServiceBlocks, sampleVoucherData, sampleVoucherTemplate } from "@/lib/pdf/design-review/sample-booking"
import { guestNamesValue } from "../sections/guest-info"
import { renderVoucherPdf } from "../../render-pdf"

// The client's Blue Train voucher (2026-09-29 markup): two couples in two suites, and a suite name
// that wrapped in the narrow column before "QTY".
const ROOM_LINES = ["Mrs Carmen De Jongh and Mr Lourens De Jongh", "Mr Steyn van Coller and Mrs June van Coller"]
const SUITE = "Twin bedded Deluxe Suite with a shower"
const ROOM = "Superior Garden Suite with a private plunge pool"

function blueTrainVoucher(): VoucherData {
  const blocks = sampleServiceBlocks()
  const withSuites = blocks.map((block): VoucherServiceBlock => {
    if (block.serviceType === "train") {
      return {
        ...block,
        title: "Blue Train",
        contactDetails: { name: "Blue Train", phone: "+27 12 315 8242", website: "https://www.bluetrain.co.za/" },
        serviceData: {
          ...block.serviceData,
          suiteType: SUITE,
          numberOfSuites: 2,
          guestBreakdown: { adults: 4, children: 0, infants: 0 },
        },
      }
    }
    if (block.serviceType === "hotel") {
      return {
        ...block,
        serviceData: { ...block.serviceData, roomType: ROOM, numberOfSuites: 2, guestBreakdown: { adults: 4, children: 0, infants: 0 } },
      }
    }
    return block
  })
  return {
    ...sampleVoucherData(),
    guestNames: "Mrs Carmen De Jongh, Mr Lourens De Jongh, Mr Steyn van Coller, Mrs June van Coller",
    guestNameLines: ROOM_LINES,
    passengerTotals: { adultCount: 4, childCount: 0, infantCount: 0 },
    serviceBlocks: withSuites,
  }
}

describe("guestNamesValue", () => {
  it("prints one line per room when the roster records rooms", () => {
    expect(guestNamesValue({ guestNames: "unused", guestNameLines: ROOM_LINES })).toBe(ROOM_LINES.join("\n"))
  })

  it("falls back to the party on one sentence-style line", () => {
    expect(guestNamesValue({ guestNames: "Mr A, Mrs B, Mr C" })).toBe("Mr A, Mrs B and Mr C")
    expect(guestNamesValue({ guestNames: "Mr A, Mrs B", guestNameLines: [] })).toBe("Mr A and Mrs B")
    expect(guestNamesValue({ guestNames: "Mr A, Mrs B", guestNameLines: null })).toBe("Mr A and Mrs B")
  })
})

describe("voucher guest rooms and suite rows", { timeout: 20_000 }, () => {
  it("prints each room on its own line and the suite/room names on one line", async () => {
    const buffer = await renderVoucherPdf({
      data: blueTrainVoucher(),
      template: sampleVoucherTemplate(),
      docTitle: "TRAVEL VOUCHERS",
    })
    const sampleDir = process.env.PDF_SAMPLES_DIR
    if (sampleDir) {
      mkdirSync(sampleDir, { recursive: true })
      writeFileSync(path.join(sampleDir, "Voucher-rooms-blue-train.pdf"), buffer)
    }

    const lines = (await extractPdfText(buffer)).split("\n").map((line) => line.trim())
    // "Guest Names:" sits on the first room's baseline; the second room has a line of its own.
    expect(lines.some((line) => line.endsWith(ROOM_LINES[0]))).toBe(true)
    expect(lines).toContain(ROOM_LINES[1])
    // The whole name on one baseline, followed by QTY — not broken across two.
    expect(lines.find((line) => line.includes(SUITE))).toMatch(new RegExp(`${SUITE}\\s*QTY:\\s*2$`))
    expect(lines.find((line) => line.includes(ROOM))).toMatch(new RegExp(`${ROOM}\\s*QTY:\\s*2$`))
  })
})
