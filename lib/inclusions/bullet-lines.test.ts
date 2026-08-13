import { describe, expect, it } from "vitest"
import {
  formatBulletLinesInline,
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
