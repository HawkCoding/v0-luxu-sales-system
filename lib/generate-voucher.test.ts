import { describe, expect, it } from "vitest"

import { generateVoucherHTML } from "./generate-voucher"

function createVoucherData() {
  return {
    voucherNumber: "LX-2026-001",
    guestNames: "John and Jane Smith",
    consultantName: "Leonie",
    supplierName: "Rovos Rail",
    route: "Pretoria to Cape Town",
    departure: "15 April 2026",
    arrival: "17 April 2026",
    suiteType: "Royal Double Suite",
    numberOfGuests: 2,
    specialRequests: "Anniversary celebration",
    customerEmail: "john@example.com",
    customerPhone: "+27 82 555 1234",
    enquiry: {
      id: "enquiry-1",
      jobId: "job-1",
      source: "web_form" as const,
      purpose: "quote" as const,
      title: "Mr",
      name: "John",
      surname: "Smith",
      contactNumber: "+27 82 555 1234",
      email: "john@example.com",
      country: "South Africa",
      direction: "Pretoria to Cape Town",
      departureDate: "2026-04-15",
      noOfSuites: 1,
      noOfAdults: 2,
      noOfChildren: 0,
      suiteTypes: ["Royal Double Suite"],
      termsAccepted: true,
      createdAt: "2026-03-07T10:30:00.000Z",
    },
    consultant: "LB" as const,
  }
}

describe("generateVoucherHTML", () => {
  it("matches the voucher HTML snapshot with special requests", () => {
    const html = generateVoucherHTML(createVoucherData())

    expect(html).toMatchSnapshot()
  })

  it("omits the special requests section when no requests are provided", () => {
    const html = generateVoucherHTML({
      ...createVoucherData(),
      specialRequests: "",
    })

    expect(html).not.toContain("Special Requests:")
    expect(html).toContain("LX-2026-001")
  })
})
