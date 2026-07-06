// @vitest-environment node
// jsdom breaks @react-pdf font subsetting (corrupt embedded TTF subsets);
// production renders run in the Node runtime, so the test must too.
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"
import type { VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { renderVoucherPdf } from "../../render-pdf"

const WRITE_PDF = Boolean(process.env.WRITE_PDF)

function sampleData(): VoucherData {
  return {
    voucherNumber: "180226-01",
    guestNames: "Mr & Mrs Sample Guest",
    consultantName: "Carmen de Jongh",
    supplierName: "Rovos Rail",
    supplierDescription: "Luxury rail journeys through Southern Africa since 1989.",
    route: "Cape Town to Pretoria",
    departure: "10 March 2026 at 11h00",
    arrival: "13 March 2026 at 16h00",
    suiteType: "Double Deluxe Suite",
    numberOfGuests: 2,
    specialRequests: "Anniversary celebration",
    customerEmail: "guest@example.com",
    customerPhone: "+27 82 000 0000",
    consultant: "CDJ",
    enquiry: {
      id: "preview",
      jobId: "preview",
      source: "email",
      purpose: "reservation",
      title: "Mr",
      name: "Sample",
      surname: "Guest",
      contactNumber: "+27 82 000 0000",
      email: "guest@example.com",
      country: "South Africa",
      direction: "Cape Town to Pretoria",
      departureDate: "2026-03-10",
      noOfSuites: 1,
      noOfAdults: 2,
      noOfChildren: 0,
      suiteTypes: ["Double Deluxe Suite"],
      termsAccepted: true,
      createdAt: "2026-03-01T08:00:00.000Z",
    },
  }
}

function serviceBlocks(): VoucherServiceBlock[] {
  return [
    {
      serviceType: "train",
      title: "Rovos Rail — Cape Town to Pretoria",
      supplierReference: "RR-84321",
      displayOrder: 0,
      contactDetails: { name: "Rovos Rail", phone: "+27 12 315 8242", email: "reservations@rovos.co.za" },
      serviceData: {
        route: "Cape Town to Pretoria",
        departureDate: "10 March 2026 at 11h00",
        arrivalDate: "13 March 2026 at 16h00",
        suiteType: "Double Deluxe Suite",
        numberOfSuites: 1,
        mealPlan: "Full Board (All meals included)",
      },
    },
    {
      serviceType: "hotel",
      title: "The Silo Hotel — Cape Town",
      supplierReference: "SIL-2211",
      displayOrder: 1,
      contactDetails: { name: "The Silo Hotel", phone: "+27 21 670 0500", location: "V&A Waterfront, Cape Town" },
      serviceData: {
        roomType: "Superior Suite",
        nights: 2,
        mealPlan: "Bed & Breakfast",
        departureDate: "8 March 2026",
        arrivalDate: "10 March 2026",
        notes: "Early check-in requested for international arrival.",
      },
    },
    {
      serviceType: "transfer",
      title: "Private Transfer — Hotel to Station",
      supplierReference: "TX-0099",
      displayOrder: 2,
      contactDetails: { name: "Cape Chauffeurs", phone: "+27 82 111 2222" },
      serviceData: {
        vehicleType: "Mercedes V-Class",
        pickup: "The Silo Hotel",
        dropoff: "Cape Town Station, Platform 24",
        departureDate: "10 March 2026 at 09h30",
      },
    },
  ]
}

async function renderAndAssert(name: string, data: VoucherData, template?: VoucherTemplate | null): Promise<Buffer> {
  const buffer = await renderVoucherPdf({ data, template })
  expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF")
  expect(buffer.length).toBeGreaterThan(1000)
  if (WRITE_PDF) {
    const dir = path.join(process.cwd(), "tmp")
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `voucher-${name}.pdf`), buffer)
  }
  return buffer
}

describe("renderVoucherPdf smoke", () => {
  it("renders with the default template", async () => {
    await renderAndAssert("default", sampleData())
  })

  it("renders multiple service blocks across pages", async () => {
    await renderAndAssert("multi-block", { ...sampleData(), serviceBlocks: serviceBlocks() })
  })

  it.each([
    ["georgia", "Georgia, serif"],
    ["playfair", "'Playfair Display', Georgia, serif"],
    ["arial", "Arial, sans-serif"],
    ["montserrat", "'Montserrat', Arial, sans-serif"],
  ])("renders with the %s template font option", async (name, fontFamily) => {
    await renderAndAssert(`font-${name}`, sampleData(), { ...VOUCHER_TEMPLATE_DEFAULTS, font_family: fontFamily })
  })

  it("renders the logo-only header variant", async () => {
    const png = readFileSync(path.join(process.cwd(), "public", "placeholder-logo.png"))
    await renderAndAssert("logo-only", sampleData(), {
      ...VOUCHER_TEMPLATE_DEFAULTS,
      logo_url: `data:image/png;base64,${png.toString("base64")}`,
    })
  })

  it("respects hidden sections and reordering", async () => {
    await renderAndAssert("reordered", { ...sampleData(), serviceBlocks: serviceBlocks() }, {
      ...VOUCHER_TEMPLATE_DEFAULTS,
      section_order: ["service_provider", "guest_info", "footer"],
      hidden_sections: ["footer"],
    })
  })
})
