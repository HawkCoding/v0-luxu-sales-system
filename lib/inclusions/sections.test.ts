import { describe, expect, it } from "vitest"
import type { EditableInclusionLine } from "@/lib/inclusions/editable-line"
import {
  countSectionLines,
  createEmptySection,
  flattenSections,
  groupIntoSections,
  replaceListLines,
  sectionItemsFromText,
  sectionItemsToText,
  type InclusionSection,
} from "./sections"

function row(
  overrides: Partial<EditableInclusionLine> & Pick<EditableInclusionLine, "id" | "kind" | "text">,
): EditableInclusionLine {
  return { list: "inclusions", journeyTag: null, rateTag: null, ...overrides }
}

describe("groupIntoSections", () => {
  it("only groups rows belonging to the given list, ignoring the other list interleaved in the array", () => {
    const lines: EditableInclusionLine[] = [
      row({ id: "1", kind: "item", text: "Included A", list: "inclusions" }),
      row({ id: "2", kind: "item", text: "Excluded A", list: "exclusions" }),
      row({ id: "3", kind: "item", text: "Included B", list: "inclusions" }),
    ]
    expect(groupIntoSections(lines, "inclusions")).toEqual([
      {
        id: "1",
        heading: null,
        journeyTag: null,
        rateTag: null,
        items: [
          { id: "1", text: "Included A" },
          { id: "3", text: "Included B" },
        ],
      },
    ])
  })

  it("opens a new section at every heading", () => {
    const lines: EditableInclusionLine[] = [
      row({ id: "h1", kind: "heading", text: "Short Journeys", journeyTag: "short" }),
      row({ id: "1", kind: "item", text: "Accommodation onboard the train", journeyTag: "short" }),
      row({ id: "h2", kind: "heading", text: "Long Journeys", journeyTag: "long" }),
      row({ id: "2", kind: "item", text: "Guided excursions", journeyTag: "long" }),
    ]
    expect(groupIntoSections(lines, "inclusions")).toEqual([
      { id: "h1", heading: "Short Journeys", journeyTag: "short", rateTag: null, items: [{ id: "1", text: "Accommodation onboard the train" }] },
      { id: "h2", heading: "Long Journeys", journeyTag: "long", rateTag: null, items: [{ id: "2", text: "Guided excursions" }] },
    ])
  })

  it("splits off a headless section when an item's tags differ from the section it would join -- the Rovos case", () => {
    const lines: EditableInclusionLine[] = [
      row({ id: "h1", kind: "heading", text: "Short Journeys", journeyTag: "short" }),
      row({ id: "1", kind: "item", text: "Accommodation onboard the train", journeyTag: "short" }),
      row({ id: "2", kind: "item", text: "All meals, all beverages", journeyTag: "short" }),
      row({ id: "3", kind: "item", text: "Complimentary night pre/post", journeyTag: "short", rateTag: "international" }),
      row({ id: "4", kind: "item", text: "Vehicle transfer Hotel-Station", journeyTag: "short", rateTag: "international" }),
    ]
    const sections = groupIntoSections(lines, "inclusions")
    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual({
      id: "h1",
      heading: "Short Journeys",
      journeyTag: "short",
      rateTag: null,
      items: [
        { id: "1", text: "Accommodation onboard the train" },
        { id: "2", text: "All meals, all beverages" },
      ],
    })
    expect(sections[1]).toEqual({
      id: "3",
      heading: null,
      journeyTag: "short",
      rateTag: "international",
      items: [
        { id: "3", text: "Complimentary night pre/post" },
        { id: "4", text: "Vehicle transfer Hotel-Station" },
      ],
    })
  })

  it("opens a headless section for leading items before any heading", () => {
    const lines: EditableInclusionLine[] = [row({ id: "1", kind: "item", text: "Wi-Fi" })]
    expect(groupIntoSections(lines, "inclusions")).toEqual([
      { id: "1", heading: null, journeyTag: null, rateTag: null, items: [{ id: "1", text: "Wi-Fi" }] },
    ])
  })

  it("returns no sections for an empty list", () => {
    expect(groupIntoSections([], "inclusions")).toEqual([])
  })
})

describe("flattenSections", () => {
  it("stamps the section's tags onto every item row and emits a heading row only for a non-blank heading", () => {
    const sections: InclusionSection[] = [
      {
        id: "s1",
        heading: "Short Journeys",
        journeyTag: "short",
        rateTag: null,
        items: [{ id: "1", text: "Accommodation onboard the train" }],
      },
      {
        id: "s2",
        heading: "",
        journeyTag: "short",
        rateTag: "international",
        items: [{ id: "2", text: "Complimentary night pre/post" }],
      },
    ]
    expect(flattenSections(sections, "inclusions")).toEqual([
      { id: "s1", list: "inclusions", kind: "heading", text: "Short Journeys", journeyTag: "short", rateTag: null },
      { id: "1", list: "inclusions", kind: "item", text: "Accommodation onboard the train", journeyTag: "short", rateTag: null },
      { id: "2", list: "inclusions", kind: "item", text: "Complimentary night pre/post", journeyTag: "short", rateTag: "international" },
    ])
  })

  it("drops a blank heading and blank items rather than persisting empty bullets", () => {
    const sections: InclusionSection[] = [
      {
        id: "s1",
        heading: "   ",
        journeyTag: null,
        rateTag: null,
        items: [{ id: "1", text: "  " }, { id: "2", text: "Wi-Fi" }],
      },
    ]
    expect(flattenSections(sections, "inclusions")).toEqual([
      { id: "2", list: "inclusions", kind: "item", text: "Wi-Fi", journeyTag: null, rateTag: null },
    ])
  })

  it("round-trips through groupIntoSections", () => {
    const original: InclusionSection[] = [
      {
        id: "h1",
        heading: "Short Journeys",
        journeyTag: "short",
        rateTag: null,
        items: [{ id: "1", text: "Accommodation onboard the train" }, { id: "2", text: "All meals" }],
      },
      {
        id: "3",
        heading: null,
        journeyTag: "short",
        rateTag: "international",
        items: [{ id: "3", text: "Complimentary night" }],
      },
    ]
    const flat = flattenSections(original, "inclusions")
    expect(groupIntoSections(flat, "inclusions")).toEqual(original)
  })
})

describe("sectionItemsFromText / sectionItemsToText", () => {
  it("splits one item per line, dropping blanks and pasted bullet prefixes", () => {
    const items = sectionItemsFromText([], "- All meals\n\n• Room service\n* Laundry\nWi-Fi")
    expect(items.map((item) => item.text)).toEqual(["All meals", "Room service", "Laundry", "Wi-Fi"])
  })

  it("keeps an unchanged line's id and only assigns fresh ids to new lines", () => {
    const previous = [{ id: "a", text: "All meals" }, { id: "b", text: "Room service" }]
    const next = sectionItemsFromText(previous, "All meals\nRoom service\nLaundry")
    expect(next[0].id).toBe("a")
    expect(next[1].id).toBe("b")
    expect(next[2].id).not.toBe("a")
    expect(next[2].id).not.toBe("b")
    expect(next.map((item) => item.text)).toEqual(["All meals", "Room service", "Laundry"])
  })

  it("round-trips back to the same textarea value", () => {
    const section: InclusionSection = {
      id: "s1",
      heading: null,
      journeyTag: null,
      rateTag: null,
      items: [{ id: "1", text: "All meals" }, { id: "2", text: "Room service" }],
    }
    expect(sectionItemsToText(section)).toBe("All meals\nRoom service")
  })
})

describe("replaceListLines", () => {
  it("replaces only the given list's rows, leaving the other list's rows untouched and in place", () => {
    const lines: EditableInclusionLine[] = [
      row({ id: "1", kind: "item", text: "Included A", list: "inclusions" }),
      row({ id: "2", kind: "item", text: "Excluded A", list: "exclusions" }),
    ]
    const nextInclusions: EditableInclusionLine[] = [
      row({ id: "1", kind: "item", text: "Included A edited", list: "inclusions" }),
    ]
    const result = replaceListLines(lines, "inclusions", nextInclusions)
    expect(result).toContainEqual(row({ id: "2", kind: "item", text: "Excluded A", list: "exclusions" }))
    expect(result).toContainEqual(row({ id: "1", kind: "item", text: "Included A edited", list: "inclusions" }))
    expect(result).toHaveLength(2)
  })
})

describe("createEmptySection", () => {
  it("starts with no heading, no tags, and no items", () => {
    const section = createEmptySection()
    expect(section.heading).toBe("")
    expect(section.journeyTag).toBeNull()
    expect(section.rateTag).toBeNull()
    expect(section.items).toEqual([])
  })
})

describe("countSectionLines", () => {
  it("counts one row per non-blank heading plus one row per non-blank item", () => {
    const sections: InclusionSection[] = [
      { id: "1", heading: "Short Journeys", journeyTag: null, rateTag: null, items: [{ id: "a", text: "A" }, { id: "b", text: "" }] },
      { id: "2", heading: "", journeyTag: null, rateTag: null, items: [{ id: "c", text: "C" }] },
    ]
    expect(countSectionLines(sections)).toBe(3)
  })
})
