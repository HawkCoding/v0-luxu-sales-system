import { describe, expect, it } from "vitest"
import {
  formatBulletLinesInline,
  nestBulletLines,
  isHeadingLine,
  parseBulletLines,
  splitBulletLines,
  stripBulletMarker,
} from "./bullet-lines"

describe("splitBulletLines", () => {
  it("drops blanks and leading dash/bullet characters", () => {
    expect(splitBulletLines("- High Tea\n\n• Wi-Fi\n* Butler service  ")).toEqual([
      "High Tea",
      "Wi-Fi",
      "Butler service",
    ])
  })

  it("keeps the `#` subheading marker", () => {
    expect(splitBulletLines("# Onboard\nHigh Tea")).toEqual(["# Onboard", "High Tea"])
  })
})

describe("isHeadingLine / stripBulletMarker", () => {
  it("recognises the marker with or without a space after it", () => {
    expect(isHeadingLine("# Onboard")).toBe(true)
    expect(isHeadingLine("#Onboard")).toBe(true)
    expect(isHeadingLine("## Onboard")).toBe(true)
    expect(isHeadingLine("Onboard")).toBe(false)
    expect(isHeadingLine("Wi-Fi (signal dependent)")).toBe(false)
  })

  it("strips the marker from the visible text", () => {
    expect(stripBulletMarker("#  Off-train")).toBe("Off-train")
    expect(stripBulletMarker("  High Tea  ")).toBe("High Tea")
  })
})

describe("parseBulletLines", () => {
  it("tags headings and items in order", () => {
    expect(parseBulletLines(["# Onboard", "High Tea", "# Off-train", "Vehicle transfer"])).toEqual([
      { kind: "heading", text: "Onboard" },
      { kind: "item", text: "High Tea" },
      { kind: "heading", text: "Off-train" },
      { kind: "item", text: "Vehicle transfer" },
    ])
  })

  it("drops blanks and bare markers", () => {
    expect(parseBulletLines(["", "   ", "#", "# ", "High Tea"])).toEqual([
      { kind: "item", text: "High Tea" },
    ])
  })

  it("tolerates a null list", () => {
    expect(parseBulletLines(null)).toEqual([])
  })
})

describe("formatBulletLinesInline", () => {
  it("groups items behind their subheading", () => {
    expect(
      formatBulletLinesInline([
        "# Onboard",
        "Accommodation onboard the train",
        "All meals",
        "# Off-train",
        "Vehicle transfer",
      ]),
    ).toBe("Onboard: Accommodation onboard the train, All meals; Off-train: Vehicle transfer")
  })

  it("keeps items before the first subheading in their own group", () => {
    expect(formatBulletLinesInline(["High Tea", "# Onboard", "All meals"])).toBe(
      "High Tea; Onboard: All meals",
    )
  })

  it("drops a subheading with nothing under it", () => {
    expect(formatBulletLinesInline(["# Onboard", "# Off-train", "Vehicle transfer"])).toBe(
      "Off-train: Vehicle transfer",
    )
  })

  it("falls back to a plain comma list when no subheading is used", () => {
    expect(formatBulletLinesInline(["High Tea", "Wi-Fi"])).toBe("High Tea, Wi-Fi")
    expect(formatBulletLinesInline([])).toBe("")
  })
})

describe("nestBulletLines", () => {
  it("nests items under a subheading and keeps earlier items at the first level", () => {
    expect(nestBulletLines(parseBulletLines(["Welcome drink", "# Onboard:", "All meals"]))).toEqual([
      { text: "Welcome drink", level: 1, bold: false },
      { text: "Onboard:", level: 1, bold: true },
      { text: "All meals", level: 2, bold: false },
    ])
  })

  it("turns a subheading that only heads other subheadings into an unbulleted group label", () => {
    const lines = nestBulletLines(parseBulletLines(["# Long Journeys", "# Onboard:", "All meals", "# Off-train:", "Flights"]))

    expect(lines.map((line) => [line.text, line.level])).toEqual([
      ["Long Journeys", 0],
      ["Onboard:", 1],
      ["All meals", 2],
      ["Off-train:", 1],
      ["Flights", 2],
    ])
  })

  it("ranks a sibling section before the group as a label too, its items as plain dots", () => {
    const lines = nestBulletLines(
      parseBulletLines(["# Short Journeys", "Government tax", "# Long Journeys", "# Onboard:", "All meals"]),
    )

    expect(lines.map((line) => [line.text, line.level])).toEqual([
      ["Short Journeys", 0],
      ["Government tax", 1],
      ["Long Journeys", 0],
      ["Onboard:", 1],
      ["All meals", 2],
    ])
  })
})

describe("formatBulletLinesInline — typed colons", () => {
  it("never doubles a subheading's own colon", () => {
    expect(formatBulletLinesInline(["# Onboard:", "All meals"])).toBe("Onboard: All meals")
  })
})
