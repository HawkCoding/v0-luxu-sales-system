// @vitest-environment node
// jsdom breaks @react-pdf font subsetting (corrupt embedded TTF subsets);
// production renders run in the Node runtime, so the test must too.
import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import { sampleItineraryData } from "../../sample-data"
import { renderItineraryPdf, type RenderItineraryPdfInput } from "../../render-pdf"

const WRITE_PDF = Boolean(process.env.WRITE_PDF)

async function renderAndAssert(name: string, input: RenderItineraryPdfInput): Promise<Buffer> {
  const buffer = await renderItineraryPdf(input)
  expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF")
  expect(buffer.length).toBeGreaterThan(1000)
  if (WRITE_PDF) {
    const dir = path.join(process.cwd(), "tmp")
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `itinerary-${name}.pdf`), buffer)
  }
  return buffer
}

describe("renderItineraryPdf smoke", () => {
  it("renders with the default template", async () => {
    await renderAndAssert("default", { data: sampleItineraryData() })
  })

  it("renders custom journey heading and intro text", async () => {
    await renderAndAssert("custom-text", {
      data: sampleItineraryData(),
      journeyHeading: "Your Rail Adventure",
      introText: "Welcome aboard! Below is your day-by-day itinerary.",
    })
  })

  it("omits the intro paragraph when intro text is empty", async () => {
    await renderAndAssert("no-intro", {
      data: sampleItineraryData(),
      introText: "   ",
    })
  })
})
