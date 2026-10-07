import { describe, expect, it } from "vitest"
import type { PricingSnapshot } from "@/lib/types"
import { resolveTransportLinePoints, type InvoiceTransportRequest } from "./transport-line-points"

function transferSnapshot(overrides: Partial<PricingSnapshot> = {}): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "package-1",
    packageName: "Booking",
    legId: "service-transfer",
    legLabel: "Ulysses Tours & Transfers",
    supplierId: "supplier-transfers",
    supplierName: "Ulysses Tours & Transfers",
    supplierKind: "transfers",
    routeId: "route-1",
    routeName: "PTY - PHTL STA",
    suiteTypeId: "vehicle-sedan",
    suiteTypeName: "Sedan",
    rateCardId: "rate-1",
    travelDate: "2027-11-22",
    passengerKind: "adult",
    baseUnitPrice: 950,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: "transfer",
    ...overrides,
  }
}

function request(overrides: Partial<InvoiceTransportRequest> & Pick<InvoiceTransportRequest, "id">): InvoiceTransportRequest {
  return {
    service_id: "service-transfer",
    service_type: "transfer",
    suite_type_id: "vehicle-sedan",
    pickup_point: "Sandton Hotel",
    dropoff_point: "Pretoria Station",
    // 11h00 in Johannesburg.
    pickup_at: "2027-11-22T09:00:00+00:00",
    ...overrides,
  }
}

const sandtonToPretoria = { pickup: "Sandton Hotel", dropoff: "Pretoria Station" }

describe("resolveTransportLinePoints", () => {
  it("names a stamped line's own trip, even beside other trips on the same service", () => {
    const requests = [
      request({ id: "request-a", pickup_point: "OR Tambo Airport", dropoff_point: "Sandton Hotel" }),
      request({ id: "request-b" }),
    ]
    expect(resolveTransportLinePoints([transferSnapshot({ transportRequestId: "request-b" })], requests)).toEqual([
      sandtonToPretoria,
    ])
  })

  it("names an older unstamped line by the only trip on its service", () => {
    expect(resolveTransportLinePoints([transferSnapshot()], [request({ id: "request-a" })])).toEqual([sandtonToPretoria])
  })

  it("still names an older line whose trip date moved after pricing, when it is the service's only trip", () => {
    const requests = [request({ id: "request-a", pickup_at: "2027-11-25T09:00:00+00:00" })]
    expect(resolveTransportLinePoints([transferSnapshot()], requests)).toEqual([sandtonToPretoria])
  })

  it("leaves a trip a comped (stamped) line names to that line, handing the unstamped line the other", () => {
    const requests = [
      request({ id: "request-comped", pickup_point: "OR Tambo Airport", dropoff_point: "Sandton Hotel" }),
      request({ id: "request-charged" }),
    ]
    const snapshots = [
      transferSnapshot({ transportRequestId: "request-comped", isComplimentaryTransport: true }),
      transferSnapshot(),
    ]
    expect(resolveTransportLinePoints(snapshots, requests)).toEqual([
      { pickup: "OR Tambo Airport", dropoff: "Sandton Hotel" },
      sandtonToPretoria,
    ])
  })

  it("tells two trips on one service apart by the line's pricing date (the pick-up's Johannesburg day)", () => {
    const requests = [
      // 22:30 UTC on the 19th is 00:30 on the 20th in Johannesburg.
      request({ id: "request-a", pickup_point: "OR Tambo Airport", dropoff_point: "DaVinci Hotel", pickup_at: "2027-11-19T22:30:00+00:00" }),
      request({ id: "request-b" }),
    ]
    expect(
      resolveTransportLinePoints(
        [transferSnapshot({ travelDate: "2027-11-20" }), transferSnapshot({ travelDate: "2027-11-22" })],
        requests,
      ),
    ).toEqual([{ pickup: "OR Tambo Airport", dropoff: "DaVinci Hotel" }, sandtonToPretoria])
  })

  it("tells two same-day trips apart by the line's vehicle category", () => {
    const requests = [
      request({ id: "request-a", suite_type_id: "vehicle-van", pickup_point: "OR Tambo Airport", dropoff_point: "Sandton Hotel" }),
      request({ id: "request-b" }),
    ]
    expect(resolveTransportLinePoints([transferSnapshot({ suiteTypeId: "vehicle-van" })], requests)).toEqual([
      { pickup: "OR Tambo Airport", dropoff: "Sandton Hotel" },
    ])
  })

  it("prints no points rather than guess between two indistinguishable trips", () => {
    const requests = [
      request({ id: "request-a", pickup_point: "OR Tambo Airport", dropoff_point: "Sandton Hotel" }),
      request({ id: "request-b" }),
    ]
    expect(resolveTransportLinePoints([transferSnapshot()], requests)).toEqual([null])
  })

  it("names indistinguishable trips that share the same points", () => {
    const requests = [request({ id: "request-a" }), request({ id: "request-b", pickup_point: " sandton hotel " })]
    expect(resolveTransportLinePoints([transferSnapshot()], requests)).toEqual([sandtonToPretoria])
  })

  it("prints no points for a trip whose pick-up or drop-off is blank", () => {
    expect(resolveTransportLinePoints([transferSnapshot()], [request({ id: "request-a", dropoff_point: "" })])).toEqual([
      null,
    ])
  })

  it("prints no points when a stamped trip has since been deleted", () => {
    const snapshot = transferSnapshot({ transportRequestId: "request-deleted" })
    expect(resolveTransportLinePoints([snapshot], [request({ id: "request-a" })])).toEqual([null])
  })

  it("ignores trips on other services, of another transport type, or tied to no service", () => {
    const requests = [
      request({ id: "request-other-service", service_id: "service-other" }),
      request({ id: "request-rental", service_type: "rental" }),
      request({ id: "request-unlinked", service_id: null }),
    ]
    expect(resolveTransportLinePoints([transferSnapshot()], requests)).toEqual([null])
  })

  it("names a rental line by its own rental trip", () => {
    const requests = [
      request({ id: "request-transfer" }),
      request({ id: "request-rental", service_type: "rental", pickup_point: "Cape Town Airport", dropoff_point: "V&A Waterfront" }),
    ]
    expect(resolveTransportLinePoints([transferSnapshot({ serviceType: "rental" })], requests)).toEqual([
      { pickup: "Cape Town Airport", dropoff: "V&A Waterfront" },
    ])
  })

  it("gives every per-person line of one trip (adult/child/infant) the same points", () => {
    const snapshots = [
      transferSnapshot(),
      transferSnapshot({ passengerKind: "child" }),
      transferSnapshot({ passengerKind: "infant" }),
    ]
    expect(resolveTransportLinePoints(snapshots, [request({ id: "request-a" })])).toEqual([
      sandtonToPretoria,
      sandtonToPretoria,
      sandtonToPretoria,
    ])
  })

  it("returns null for non-transport lines, lines without a snapshot, and lines with no service", () => {
    const hotel = transferSnapshot({ serviceType: null, supplierKind: "hotel_property" })
    expect(
      resolveTransportLinePoints([hotel, null, transferSnapshot({ legId: null })], [request({ id: "request-a" })]),
    ).toEqual([null, null, null])
  })
})
