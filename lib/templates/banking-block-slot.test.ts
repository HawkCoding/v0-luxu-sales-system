import { describe, expect, it } from "vitest"
import { hasBankingBlock, replaceBankingBlock } from "./banking-block-slot"

const OLD_BLOCK =
  '<div data-label="Banking details" data-payment-block="1"><p><strong>Bank:</strong> Old Bank</p></div>'
const NEW_BLOCK =
  '<div data-label="Banking details" data-payment-block="1"><p><strong>Bank:</strong> New Bank</p></div>'

describe("banking-block-slot", () => {
  it("detects a banking block in content", () => {
    expect(hasBankingBlock(`<p>Hello</p>${OLD_BLOCK}<p>Bye</p>`)).toBe(true)
    expect(hasBankingBlock("<p>No block here</p>")).toBe(false)
  })

  it("replaces the banking block in place, leaving surrounding content untouched", () => {
    const content = `<p>Hello</p>${OLD_BLOCK}<p>Bye</p>`
    const replaced = replaceBankingBlock(content, NEW_BLOCK)
    expect(replaced).toContain("New Bank")
    expect(replaced).not.toContain("Old Bank")
    expect(replaced).toContain("<p>Hello</p>")
    expect(replaced).toContain("<p>Bye</p>")
  })

  it("returns null when no banking block is present, rather than inserting one", () => {
    expect(replaceBankingBlock("<p>No block here</p>", NEW_BLOCK)).toBeNull()
  })
})
