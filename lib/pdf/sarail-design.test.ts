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
    address: "No 6 Oostewal Business Centre, Cnr of Sleigh & Oostewal Rd\nLangebaan, Westerncape, South Africa 7357",
    tel: "(+27) 021 100 3596",
    cell: "(+27) 081 580 6471",
    email: "info@sa-rail.co.za",
    website: "sa-rail.co.za, luxustravel.co.za",
    regNumber: "CK2007/049324/23",
    vatNumber: "4580275016",
  }

  /** Each line as it prints: "Label value" runs joined by the line's separator. */
  const printed = (lines: ReturnType<typeof buildDocumentFooterLines>) =>
    lines.map((line) =>
      line.segments.map((segment) => (segment.label ? `${segment.label} ${segment.value}` : segment.value)).join(line.separator),
    )

  it("prints the client's three lines: address, contacts with one Web per site, registration and VAT", () => {
    expect(printed(buildDocumentFooterLines(company))).toEqual([
      "Address: No 6 Oostewal Business Centre, Cnr of Sleigh & Oostewal Rd, Langebaan, Westerncape, South Africa 7357",
      "Tel: (+27) 021 100 3596 • Cell: (+27) 081 580 6471 • Email: info@sa-rail.co.za • Web: sa-rail.co.za • Web: luxustravel.co.za",
      "Company Registration CK2007/049324/23 | VAT number 4580275016",
    ])
  })

  it("keeps the labels apart from the values, so the labels can print bold", () => {
    const [, contacts] = buildDocumentFooterLines(company)
    expect(contacts.segments[0]).toEqual({ label: "Tel:", value: "(+27) 021 100 3596" })
  })

  it("drops every blank setting, and a line left with nothing on it", () => {
    expect(printed(buildDocumentFooterLines({ tel: " ", email: "info@sa-rail.co.za", address: "" }))).toEqual([
      "Email: info@sa-rail.co.za",
    ])
    expect(buildDocumentFooterLines({})).toEqual([])
  })

  it("reads the company fields off the banking settings", () => {
    const banking = makeBankingSettings({
      company_tel: "+27 12 100 3596",
      company_reg_number: "CK2007/049324/23",
      company_address: "No 6 Oostewal Business Centre",
    })

    expect(footerCompanyFromBanking(banking)).toMatchObject({
      tel: "+27 12 100 3596",
      regNumber: "CK2007/049324/23",
      address: "No 6 Oostewal Business Centre",
    })
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
