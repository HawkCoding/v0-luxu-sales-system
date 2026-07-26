import { describe, expect, it } from "vitest"
import {
  extractSignatureSlot,
  replaceSignatureSlot,
  SIGNATURE_SLOT_END,
  SIGNATURE_SLOT_START,
} from "./signature-slot"

describe("signature-slot", () => {
  it("round-trips a fragment between the markers", () => {
    const html = `<div>Body</div>${SIGNATURE_SLOT_START}<p>Sig A</p>${SIGNATURE_SLOT_END}<div>Footer</div>`
    expect(extractSignatureSlot(html)).toBe("<p>Sig A</p>")

    const replaced = replaceSignatureSlot(html, "<p>Sig B</p>")
    expect(replaced).toContain("<p>Sig B</p>")
    expect(replaced).not.toContain("Sig A")
    expect(extractSignatureSlot(replaced!)).toBe("<p>Sig B</p>")
  })

  it("returns null when the start marker is missing", () => {
    const html = `<div>Body</div><p>Sig A</p>${SIGNATURE_SLOT_END}`
    expect(extractSignatureSlot(html)).toBeNull()
    expect(replaceSignatureSlot(html, "<p>New</p>")).toBeNull()
  })

  it("returns null when the end marker is missing", () => {
    const html = `<div>Body</div>${SIGNATURE_SLOT_START}<p>Sig A</p>`
    expect(extractSignatureSlot(html)).toBeNull()
    expect(replaceSignatureSlot(html, "<p>New</p>")).toBeNull()
  })

  it("returns null when the markers are reversed", () => {
    const html = `${SIGNATURE_SLOT_END}<p>Sig A</p>${SIGNATURE_SLOT_START}`
    expect(extractSignatureSlot(html)).toBeNull()
    expect(replaceSignatureSlot(html, "<p>New</p>")).toBeNull()
  })
})
