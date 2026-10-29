import { describe, expect, it } from "vitest"
import { sampleServiceBlocks } from "@/lib/pdf/design-review/sample-booking"
import { serviceBlockFitsOnOnePage } from "../sections/service-block"

describe("serviceBlockFitsOnOnePage", () => {
  it("keeps every ordinary block whole, the train with its full inclusions list included", () => {
    for (const block of sampleServiceBlocks()) {
      expect(serviceBlockFitsOnOnePage(block)).toBe(true)
    }
  })

  it("lets a block taller than a page break", () => {
    const [transfer] = sampleServiceBlocks()
    const essay = { ...transfer, serviceData: { ...transfer.serviceData, notes: "A long operational note. ".repeat(400) } }

    expect(serviceBlockFitsOnOnePage(essay)).toBe(false)
  })

  it("counts every typed line break as a line, however short the lines are", () => {
    const [transfer] = sampleServiceBlocks()
    const notes = Array.from({ length: 60 }, (_, index) => `Line ${index + 1}`).join("\n")

    expect(serviceBlockFitsOnOnePage({ ...transfer, serviceData: { ...transfer.serviceData, notes } })).toBe(false)
  })

  it("decides on height, not character count: a long block that still fits stays whole", () => {
    const [transfer] = sampleServiceBlocks()
    const long = { ...transfer, serviceData: { ...transfer.serviceData, notes: "Meet at the lounge. ".repeat(120) } }

    expect(serviceBlockFitsOnOnePage(long)).toBe(true)
  })
})
