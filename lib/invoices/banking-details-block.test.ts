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
  it("renders a Swirl panel with a divider border so it reads as a box on the Angora container", () => {
    const html = buildBankingDetailsBlock(SETTINGS, "37766")
    expect(html).toContain("background-color:#f4f1ee;border:1px solid #cfc7ba;")
    expect(html).not.toContain("#fbf8f3")
    expect(html).not.toContain("#e8dfd2")
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
