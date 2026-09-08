import { describe, expect, it } from "vitest"
import { anchorPresetLabels } from "./anchor-labels"

describe("anchorPresetLabels", () => {
  it("names the anchor leg once it has resolved", () => {
    expect(anchorPresetLabels("Rovos Rail", "train_operator")).toEqual({
      pre: "Before Rovos Rail",
      post: "After Rovos Rail",
    })
  })

  it("falls back to the primary product's vocabulary noun with no label", () => {
    expect(anchorPresetLabels(null, "train_operator")).toEqual({
      pre: "Pre-journey",
      post: "Post-journey",
    })
  })

  it("words the fallback with the anchor's own kind, not a hardcoded train", () => {
    const { pre, post } = anchorPresetLabels(null, "tour_operator")
    expect(pre).toBe("Pre-tour")
    expect(post).toBe("Post-tour")
  })

  it("treats an empty label like no label at all", () => {
    expect(anchorPresetLabels("", null).pre).toBe("Pre-journey")
  })
})
