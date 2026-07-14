// @vitest-environment node
// jsdom breaks @react-pdf font subsetting (corrupt embedded TTF subsets);
// production renders run in the Node runtime, so the test must too.
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import { sampleQuotePdfData } from "../sample-data"
import { renderQuotePdf, type QuotePdfData } from "../../render-quote-pdf"

const WRITE_PDF = Boolean(process.env.WRITE_PDF)

async function renderAndAssert(name: string, data: QuotePdfData): Promise<Buffer> {
  const buffer = await renderQuotePdf(data)
  expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF")
  expect(buffer.length).toBeGreaterThan(1000)
  if (WRITE_PDF) {
    const dir = path.join(process.cwd(), "tmp")
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `quote-${name}.pdf`), buffer)
  }
  return buffer
}

describe("renderQuotePdf smoke", () => {
  it("renders the sample quote with itinerary blocks", async () => {
    await renderAndAssert("sample", sampleQuotePdfData())
  })

  it("renders without itinerary blocks and without pax", async () => {
    await renderAndAssert("minimal", {
      ...sampleQuotePdfData(),
      adults: 0,
      children: 0,
      journeyStart: null,
      journeyEnd: null,
      itineraryBlocks: [],
    })
  })

  it("renders a children booking without a per-person rate", async () => {
    await renderAndAssert("family", {
      ...sampleQuotePdfData(),
      adults: 2,
      children: 2,
    })
  })
})
