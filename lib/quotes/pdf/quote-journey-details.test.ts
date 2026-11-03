import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { buildQuoteJourneyDetails } from "@/lib/quotes/pdf/quote-journey-details"

function trainBlock(serviceData: VoucherServiceBlock["serviceData"]): VoucherServiceBlock {
  return { serviceType: "train", title: "Rovos Rail", contactDetails: {}, displayOrder: 0, serviceData }
}

describe("buildQuoteJourneyDetails", () => {
  it("prints a named route as the Tour and its endpoints as the Route", () => {
    const details = buildQuoteJourneyDetails(
      trainBlock({ route: "Durban Safari", routeEndpoints: "Pretoria → Durban" }),
      "Durban Safari",
    )
    expect(details?.tourName).toBe("Durban Safari")
    expect(details?.route).toBe("Pretoria → Durban")
  })

  it("moves the leg's name up to Tour when the booking has no route of its own", () => {
    const details = buildQuoteJourneyDetails(
      trainBlock({ route: "Durban Safari", routeEndpoints: "Pretoria → Durban" }),
      null,
    )
    expect(details?.tourName).toBe("Durban Safari")
  })

  it("drops the Tour row when the name only restates the endpoints", () => {
    const details = buildQuoteJourneyDetails(
      trainBlock({ route: "Pretoria → Cape Town", routeEndpoints: "Pretoria → Cape Town" }),
      "Pretoria ↔ Cape Town",
    )
    expect(details?.tourName).toBeNull()
    expect(details?.route).toBe("Pretoria → Cape Town")
  })

  it("keeps the route's name when it has no endpoints", () => {
    const details = buildQuoteJourneyDetails(trainBlock({ route: "Durban Safari", routeEndpoints: null }), null)
    expect(details?.route).toBe("Durban Safari")
    expect(details?.tourName).toBeNull()
  })
})
