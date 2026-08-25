import { describe, expect, it } from "vitest"
import { filterInclusionLines, type SupplierInclusionLine } from "./filter-lines"

function line(
  kind: "heading" | "item",
  text: string,
  journeyTag: "short" | "long" | null = null,
  rateTag: "international" | "resident" | null = null,
): SupplierInclusionLine {
  return { kind, text, journeyTag, rateTag }
}

describe("filterInclusionLines", () => {
  it("shows untagged items regardless of context", () => {
    const lines = [line("item", "Accommodation onboard"), line("item", "All meals")]
    expect(filterInclusionLines(lines, { journeyClass: "short", rateAudience: "international" })).toEqual([
      { kind: "item", text: "Accommodation onboard" },
      { kind: "item", text: "All meals" },
    ])
  })

  it("an item's own tag is what's checked -- it is never inherited from the heading above it", () => {
    const lines = [
      line("heading", "Short Journeys", "short"),
      line("item", "Complimentary night", "short", "international"),
      line("item", "Accommodation onboard", "short"),
    ]
    expect(filterInclusionLines(lines, { journeyClass: "short", rateAudience: "international" })).toEqual([
      { kind: "heading", text: "Short Journeys" },
      { kind: "item", text: "Complimentary night" },
      { kind: "item", text: "Accommodation onboard" },
    ])
    expect(filterInclusionLines(lines, { journeyClass: "short", rateAudience: "resident" })).toEqual([
      { kind: "heading", text: "Short Journeys" },
      { kind: "item", text: "Accommodation onboard" },
    ])
  })

  it("a heading that doesn't match the context hides every item beneath it, even one that matches on its own", () => {
    const lines = [
      line("heading", "Short Journeys", "short"),
      line("item", "Long-journey-only extra", "long"),
    ]
    expect(filterInclusionLines(lines, { journeyClass: "long", rateAudience: "international" })).toEqual([])
  })

  it("drops a heading whose items all filter out", () => {
    const lines = [
      line("heading", "Long Journeys", "long"),
      line("item", "Onboard historian", "long"),
      line("heading", "Short Journeys", "short"),
      line("item", "Complimentary night", "short", "international"),
    ]
    expect(filterInclusionLines(lines, { journeyClass: "short", rateAudience: "resident" })).toEqual([])
  })

  it("a journey-tagged line never matches a null journey class", () => {
    const lines = [line("heading", "Short Journeys", "short"), line("item", "Complimentary night")]
    expect(filterInclusionLines(lines, { journeyClass: null, rateAudience: "international" })).toEqual([])
  })

  it("re-emits a heading once per surviving run, not once per item", () => {
    const lines = [
      line("heading", "Onboard"),
      line("item", "High Tea"),
      line("item", "Wi-Fi"),
    ]
    expect(filterInclusionLines(lines, { journeyClass: null, rateAudience: "international" })).toEqual([
      { kind: "heading", text: "Onboard" },
      { kind: "item", text: "High Tea" },
      { kind: "item", text: "Wi-Fi" },
    ])
  })

  it("returns an empty list for an empty input", () => {
    expect(filterInclusionLines([], { journeyClass: null, rateAudience: "international" })).toEqual([])
  })
})
