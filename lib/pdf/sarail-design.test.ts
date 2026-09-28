import { describe, expect, it } from "vitest"
import {
  buildDocumentFooterLines,
  designRowLabel,
  displayDocumentTitle,
  footerCompanyFromBanking,
  withColon,
} from "./sarail-design"
import { makeBankingSettings } from "@/lib/settings-access.fixtures"

describe("buildDocumentFooterLines", () => {
  const company = {
    tel: "+27 (0)21 100 3596",
    cell: "+27 (0)81 580 6471",
    fax: "+27 (0)86 598 0812",
    email: "info@sa-rail.co.za",
    website: "www.sa-rail.co.za",
    regNumber: "2007/049324/23",
    vatNumber: "4580275016",
  }

  it("prints the template's six lines, without the postal address", () => {
    expect(buildDocumentFooterLines(company, { division: "A Division of Luxus Travel & Tours", year: 2026 })).toEqual([
      "©SA Rail 2026",
      "A Division of Luxus Travel & Tours",
      "Contact Numbers: +27 (0)21 100 3596 | +27 (0)81 580 6471 | Fax: +27 (0)86 598 0812",
      "Email: info@sa-rail.co.za",
      "Website: www.sa-rail.co.za",
      "RSA Co Reg: 2007/049324/23",
    ])
  })

  it("adds the VAT number to the registration line when asked (the invoice)", () => {
    const lines = buildDocumentFooterLines(company, { year: 2026, includeVatNumber: true })

    expect(lines.at(-1)).toBe("RSA Co Reg: 2007/049324/23 | VAT No: 4580275016")
  })

  it("drops every line whose setting is blank", () => {
    expect(buildDocumentFooterLines({ tel: " ", email: "" }, { division: null, year: 2027 })).toEqual(["©SA Rail 2027"])
  })

  it("reads the company fields off the banking settings", () => {
    const banking = makeBankingSettings({ company_tel: "+27 12 100 3596", company_reg_number: "CK2007/049324/23" })

    expect(footerCompanyFromBanking(banking)).toMatchObject({ tel: "+27 12 100 3596", regNumber: "CK2007/049324/23" })
  })
})

describe("displayDocumentTitle", () => {
  it("title-cases an all-capitals title", () => {
    expect(displayDocumentTitle("QUOTATION")).toBe("Quotation")
    expect(displayDocumentTitle("TRAVEL VOUCHERS")).toBe("Travel Vouchers")
  })

  it("keeps a title an admin typed in mixed case", () => {
    expect(displayDocumentTitle("Service Vouchers for SA-Rail")).toBe("Service Vouchers for SA-Rail")
  })
})

describe("row labels", () => {
  it("uses the template's wording and adds the colon", () => {
    expect(designRowLabel("Pick Up")).toBe("Pick up:")
    expect(designRowLabel("Drop-off")).toBe("Drop Off:")
    expect(designRowLabel("Qty")).toBe("QTY:")
    expect(designRowLabel("Infant")).toBe("Infants:")
    expect(designRowLabel("Your Reference")).toBe("Your Reference:")
  })

  it("never doubles a colon", () => {
    expect(withColon("Onboard:")).toBe("Onboard:")
  })
})
