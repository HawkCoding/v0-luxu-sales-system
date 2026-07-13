import { describe, expect, it } from "vitest"
import {
  CONTENT_SLOT_END,
  CONTENT_SLOT_START,
  extractContentSlot,
  replaceContentSlot,
} from "./content-slot"

const wrapped = `<html><body><div>${CONTENT_SLOT_START}<p>original</p>${CONTENT_SLOT_END}</div><footer>f</footer></body></html>`

describe("extractContentSlot", () => {
  it("returns the content between the markers", () => {
    expect(extractContentSlot(wrapped)).toBe("<p>original</p>")
  })

  it("returns null when markers are absent", () => {
    expect(extractContentSlot("<p>plain</p>")).toBeNull()
  })

  it("returns null when the end marker is missing", () => {
    expect(extractContentSlot(`${CONTENT_SLOT_START}<p>x</p>`)).toBeNull()
  })
})

describe("replaceContentSlot", () => {
  it("swaps the inner content and keeps the wrapper + markers", () => {
    const result = replaceContentSlot(wrapped, "<p>edited</p>")
    expect(result).toBe(
      `<html><body><div>${CONTENT_SLOT_START}<p>edited</p>${CONTENT_SLOT_END}</div><footer>f</footer></body></html>`,
    )
  })

  it("round-trips with extractContentSlot", () => {
    const replaced = replaceContentSlot(wrapped, "<p>new</p>")
    expect(replaced).not.toBeNull()
    expect(extractContentSlot(replaced as string)).toBe("<p>new</p>")
  })

  it("returns null when markers are absent so callers can fall back", () => {
    expect(replaceContentSlot("<p>plain</p>", "<p>x</p>")).toBeNull()
  })
})
