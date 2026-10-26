import { describe, expect, it } from "vitest"
import type { BankingSettings } from "@/lib/settings-access"
import { buildBankingDetailsBlock } from "./banking-details-block"

const SETTINGS = {
  bank_name: "FNB",
  bank_account_name: "Luxus Travel & Tours",
  bank_account_number: "123456789",
  bank_branch_code: "250655",
  bank_swift_code: "",
} as BankingSettings

describe("buildBankingDetailsBlock", () => {
  it("renders a plain outlined box: a one-cell table, the padding and border on its <td>, no fill", () => {
    const html = buildBankingDetailsBlock(SETTINGS, "37766")
    expect(html).toMatch(/^<table [^>]*data-label="Banking details"/)
    expect(html).toContain('<td style="padding:14px 16px;border:1px solid #cfc7ba;')
    expect(html).not.toMatch(/background|bgcolor/)
    for (const legacy of ["#f4f1ee", "#e8e5df", "#fbf8f3", "#e8dfd2"]) {
      expect(html).not.toContain(legacy)
    }
  })

  it("spaces itself with Outlook-proof spacer rows, never margins on the box", () => {
    const html = buildBankingDetailsBlock(SETTINGS, "37766")
    expect(html).not.toMatch(/<(table|div)[^>]*style="[^"]*margin/)
    expect(html).toContain('<td height="10" style="height:10px;')
    expect(html).toContain('<td height="18" style="height:18px;')
  })

  it("is one top-level element carrying the payment-block marker, so the picker can swap it whole", () => {
    const html = buildBankingDetailsBlock(SETTINGS, "37766")
    const doc = new DOMParser().parseFromString(html, "text/html")
    expect(doc.body.children).toHaveLength(1)
    expect(doc.body.firstElementChild?.getAttribute("data-payment-block")).toBe("1")
  })

  it("keeps the payment-block marker and escapes values", () => {
    const html = buildBankingDetailsBlock(SETTINGS, "37766")
    expect(html).toContain('data-payment-block="1"')
    expect(html).toContain("Luxus Travel &amp; Tours")
    expect(html).toContain("<strong>Payment reference:</strong> 37766")
  })

  it("returns an empty string when no banking details are configured", () => {
    const empty = { bank_name: "", bank_account_name: "", bank_account_number: "", bank_branch_code: "", bank_swift_code: "" } as BankingSettings
    expect(buildBankingDetailsBlock(empty, "37766")).toBe("")
  })
})
