import { describe, it, expect } from "vitest"
import {
  computeChildPrice,
  normalizeTrainChildPriceRatio,
  parseTrainChildPriceRatio,
  shouldAutoFillChild,
  shouldPromptChildUpdate,
  DEFAULT_TRAIN_CHILD_PRICE_RATIO,
} from "./auto-child-price"

describe("normalizeTrainChildPriceRatio", () => {
  it("clamps below 0 to 0", () => {
    expect(normalizeTrainChildPriceRatio(-0.5)).toBe(0)
  })
  it("clamps above 1 to 1", () => {
    expect(normalizeTrainChildPriceRatio(1.5)).toBe(1)
  })
  it("returns default for non-finite values", () => {
    expect(normalizeTrainChildPriceRatio(Number.NaN)).toBe(DEFAULT_TRAIN_CHILD_PRICE_RATIO)
  })
  it("keeps 4 decimal precision", () => {
    expect(normalizeTrainChildPriceRatio(0.12345)).toBe(0.1235)
  })
})

describe("parseTrainChildPriceRatio", () => {
  it("returns default for null/undefined/empty", () => {
    expect(parseTrainChildPriceRatio(null)).toBe(0.5)
    expect(parseTrainChildPriceRatio(undefined)).toBe(0.5)
    expect(parseTrainChildPriceRatio("")).toBe(0.5)
  })
  it("parses numeric strings", () => {
    expect(parseTrainChildPriceRatio("0.4")).toBe(0.4)
  })
  it("parses numbers", () => {
    expect(parseTrainChildPriceRatio(0.6)).toBe(0.6)
  })
  it("returns default for garbage", () => {
    expect(parseTrainChildPriceRatio("not-a-number")).toBe(0.5)
  })
})

describe("computeChildPrice", () => {
  it("multiplies adult by ratio", () => {
    expect(computeChildPrice(1000, 0.5)).toBe(500)
  })
  it("rounds to 2 decimal places", () => {
    expect(computeChildPrice(999.99, 0.5)).toBe(500)
    expect(computeChildPrice(333.33, 0.5)).toBe(166.67)
  })
  it("returns 0 for zero or negative adult", () => {
    expect(computeChildPrice(0, 0.5)).toBe(0)
    expect(computeChildPrice(-10, 0.5)).toBe(0)
  })
  it("clamps invalid ratio", () => {
    expect(computeChildPrice(1000, 2)).toBe(1000)
    expect(computeChildPrice(1000, -1)).toBe(0)
  })
})

describe("shouldAutoFillChild", () => {
  it("auto-fills only for train_operator with null child and positive adult", () => {
    expect(
      shouldAutoFillChild({ kind: "train_operator", currentChild: null, newAdult: 1000 }),
    ).toBe(true)
  })
  it("skips when child already has a value", () => {
    expect(
      shouldAutoFillChild({ kind: "train_operator", currentChild: 200, newAdult: 1000 }),
    ).toBe(false)
  })
  it("skips for non-train kinds", () => {
    expect(
      shouldAutoFillChild({ kind: "hotel_property", currentChild: null, newAdult: 1000 }),
    ).toBe(false)
    expect(
      shouldAutoFillChild({ kind: "airline", currentChild: null, newAdult: 1000 }),
    ).toBe(false)
  })
  it("skips when adult is zero or negative", () => {
    expect(
      shouldAutoFillChild({ kind: "train_operator", currentChild: null, newAdult: 0 }),
    ).toBe(false)
  })
})

describe("shouldPromptChildUpdate", () => {
  const base = { kind: "train_operator" as const, ratio: 0.5 }
  it("prompts when adult changes and computed child differs", () => {
    expect(
      shouldPromptChildUpdate({ ...base, currentChild: 400, newAdult: 1200 }),
    ).toBe(true)
  })
  it("does not prompt when current child already matches ratio", () => {
    expect(
      shouldPromptChildUpdate({ ...base, currentChild: 600, newAdult: 1200 }),
    ).toBe(false)
  })
  it("does not prompt for non-train kinds", () => {
    expect(
      shouldPromptChildUpdate({
        ...base,
        kind: "hotel_property",
        currentChild: 400,
        newAdult: 1200,
      }),
    ).toBe(false)
  })
  it("does not prompt when child is null", () => {
    expect(
      shouldPromptChildUpdate({ ...base, currentChild: null, newAdult: 1200 }),
    ).toBe(false)
  })
  it("does not prompt when adult is zero", () => {
    expect(
      shouldPromptChildUpdate({ ...base, currentChild: 400, newAdult: 0 }),
    ).toBe(false)
  })
})
