import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PackageDetail, PackageLeg, SupplierKind, SupplierRateCard } from "@/lib/types"
import { buildPackageQuoteLineItems } from "@/lib/quotes/build-from-package"
import { isMissingPricing } from "@/lib/quotes/pricing-engine"

const JOB_ID = "00000000-0000-4000-8000-00000000aaaa"

interface MockTables {
  booking?: unknown
  transportRequests?: unknown[]
  bedroomTypes?: { id: string; name: string }[]
  bedroomLayouts?: { id: string; name: string }[]
  bathroomTypes?: { id: string; name: string }[]
}

/** Minimal chainable supabase mock covering the tables build-from-package touches. */
function buildSupabase(tables: MockTables = {}) {
  const booking = tables.booking ?? {
    id: JOB_ID,
    no_of_adults: 2,
    no_of_children: 1,
    no_of_suites: 1,
    child_ages: [8],
    departure_date: "2026-09-01",
  }
  const emptyResult = { data: [], error: null }

  function chain(result: { data: unknown; error: null }) {
    const self: Record<string, unknown> = {}
    for (const method of ["select", "eq", "in", "order"]) {
      self[method] = () => self
    }
    self.single = async () => result
    self.maybeSingle = async () => result
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return self
  }

  return {
    from: (table: string) => {
      if (table === "bookings") return chain({ data: booking, error: null })
      if (table === "booking_transport_requests") {
        return chain({ data: tables.transportRequests ?? [], error: null })
      }
      if (table === "bedroom_types") return chain({ data: tables.bedroomTypes ?? [], error: null })
      if (table === "bedroom_layouts") return chain({ data: tables.bedroomLayouts ?? [], error: null })
      if (table === "bathroom_types") return chain({ data: tables.bathroomTypes ?? [], error: null })
      return chain(emptyResult)
    },
  } as unknown as SupabaseClient<Database>
}

function rateCard(partial: Partial<SupplierRateCard> & Pick<SupplierRateCard, "id" | "routeId" | "suiteTypeId" | "pricePerPerson">): SupplierRateCard {
  return {
    rateTypeId: "rate-standard",
    childPrice: null,
    infantPrice: null,
    currency: "ZAR",
    validFrom: "2026-01-01",
    validTo: null,
    createdAt: "",
    ...partial,
  }
}

function leg(partial: Partial<PackageLeg> & { id: string; supplierKind: SupplierKind }): PackageLeg {
  return {
    packageId: "pkg-1",
    supplierId: `supplier-${partial.id}`,
    supplierName: `Supplier ${partial.id}`,
    supplierDescription: null,
    pricingMode: "rate_card",
    baseRateTypeId: null,
    quoteRateTypeId: null,
    inheritedRateTypeName: null,
    applicableRateTypeIds: null,
    label: null,
    sortOrder: 0,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [],
    ...partial,
  }
}

function detail(legs: PackageLeg[]): PackageDetail {
  return {
    id: "pkg-1",
    name: "Test Package",
    slug: "test-package",
    description: null,
    durationNights: null,
    singleSupplementPct: 0,
    fixedPricePerPerson: null,
    currency: "ZAR",
    active: true,
    legs,
    createdAt: "",
    updatedAt: "",
  }
}

const suiteType = (id: string, supplierId: string, name: string) =>
  ({ id, supplierId, name, active: true, createdAt: "", updatedAt: "" }) as PackageLeg["suiteTypes"][number]
const route = (id: string, supplierId: string, name: string) =>
  ({ id, supplierId, name, active: true, createdAt: "", updatedAt: "" }) as PackageLeg["routes"][number]

describe("buildPackageQuoteLineItems", () => {
  it("prices each transport request row with its own vehicle category, falling back to the leg selection", async () => {
    const transferLeg = leg({
      id: "leg-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-leg-transfer", "Airport transfers")],
      suiteTypes: [
        suiteType("vehicle-sedan", "supplier-leg-transfer", "Sedan"),
        suiteType("vehicle-van", "supplier-leg-transfer", "Van"),
      ],
      rateCards: [
        rateCard({ id: "rc-sedan", routeId: "route-t", suiteTypeId: "vehicle-sedan", pricePerPerson: 500 }),
        rateCard({ id: "rc-van", routeId: "route-t", suiteTypeId: "vehicle-van", pricePerPerson: 900 }),
      ],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-van",
            service_id: "leg-transfer",
            pickup_point: "Airport",
            dropoff_point: "Hotel",
            pickup_at: null,
            rental_details: null,
          },
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: null,
            service_id: "leg-transfer",
            pickup_point: "Hotel",
            dropoff_point: "Station",
            pickup_at: null,
            rental_details: null,
          },
        ],
      }),
      packageDetail: detail([transferLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-transfer", selected: true, suiteTypeId: "vehicle-sedan" }],
    })

    expect(lineItems).toHaveLength(2)
    // Transfer descriptions show only the leg's own label — never the resolved vehicle category.
    expect(lineItems[0].description).not.toContain("Van")
    expect(lineItems[0].unitPrice).toBe(900)
    expect(lineItems[1].description).not.toContain("Sedan")
    expect(lineItems[1].unitPrice).toBe(500)
  })

  it("prices a transport request keyed by service_id", async () => {
    const transferLeg = leg({
      id: "svc-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-svc-transfer", "Airport transfers")],
      suiteTypes: [suiteType("vehicle-sedan", "supplier-svc-transfer", "Sedan")],
      rateCards: [rateCard({ id: "rc-sedan", routeId: "route-t", suiteTypeId: "vehicle-sedan", pricePerPerson: 500 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
                        service_id: "svc-transfer",
            pickup_point: "Airport",
            dropoff_point: "Hotel",
            pickup_at: null,
            rental_details: null,
          },
        ],
      }),
      packageDetail: detail([transferLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "svc-transfer", selected: true }],
    })

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].unitPrice).toBe(500)
  })

  it("uses a request's price override instead of the rate card when set", async () => {
    const transferLeg = leg({
      id: "leg-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-leg-transfer", "Airport transfers")],
      suiteTypes: [suiteType("vehicle-sedan", "supplier-leg-transfer", "Sedan")],
      rateCards: [rateCard({ id: "rc-sedan", routeId: "route-t", suiteTypeId: "vehicle-sedan", pricePerPerson: 500 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
            service_id: "leg-transfer",
            pickup_point: "Airport",
            dropoff_point: "Private villa, Bantry Bay",
            pickup_at: null,
            price_override: 1850,
            rental_details: null,
          },
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
            service_id: "leg-transfer",
            pickup_point: "Hotel",
            dropoff_point: "Station",
            pickup_at: null,
            price_override: null,
            rental_details: null,
          },
        ],
      }),
      packageDetail: detail([transferLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-transfer", selected: true, suiteTypeId: "vehicle-sedan" }],
    })

    expect(lineItems).toHaveLength(2)
    expect(lineItems[0].unitPrice).toBe(1850)
    expect(lineItems[1].unitPrice).toBe(500)
  })

  it("lets an override price a transfer no rate card covers", async () => {
    const transferLeg = leg({
      id: "leg-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-leg-transfer", "Airport transfers")],
      suiteTypes: [suiteType("vehicle-sedan", "supplier-leg-transfer", "Sedan")],
      rateCards: [],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
            service_id: "leg-transfer",
            pickup_point: "Airport",
            dropoff_point: "Private villa, Bantry Bay",
            pickup_at: null,
            price_override: 1850,
            price_override_set_at: "2026-08-14T09:00:00Z",
            price_override_set_by: null,
            rental_details: null,
          },
        ],
      }),
      packageDetail: detail([transferLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-transfer", selected: true, suiteTypeId: "vehicle-sedan", priceCurrency: "ZAR" }],
    })

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].unitPrice).toBe(1850)
    expect(lineItems[0].pricingSnapshot?.manualTransportPriceBase).toBeNull()
    expect(lineItems[0].pricingSnapshot?.manualTransportPriceSetAt).toBe("2026-08-14T09:00:00Z")
  })

  it("prices a complimentary transfer at 0 regardless of the rate card, leaving the other request charged", async () => {
    const transferLeg = leg({
      id: "leg-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-leg-transfer", "Airport transfers")],
      suiteTypes: [suiteType("vehicle-sedan", "supplier-leg-transfer", "Sedan")],
      rateCards: [rateCard({ id: "rc-sedan", routeId: "route-t", suiteTypeId: "vehicle-sedan", pricePerPerson: 500 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            id: "request-comped",
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
            service_id: "leg-transfer",
            pickup_point: "Airport",
            dropoff_point: "Hotel",
            pickup_at: null,
            price_override: null,
            complimentary: true,
            rental_details: null,
          },
          {
            id: "request-charged",
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
            service_id: "leg-transfer",
            pickup_point: "Hotel",
            dropoff_point: "Station",
            pickup_at: null,
            price_override: null,
            complimentary: false,
            rental_details: null,
          },
        ],
      }),
      packageDetail: detail([transferLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-transfer", selected: true, suiteTypeId: "vehicle-sedan" }],
    })

    expect(lineItems).toHaveLength(2)
    const [comped, charged] = lineItems
    expect(comped.unitPrice).toBe(500)
    expect(comped.total).toBe(0)
    expect(comped.pricingSnapshot?.isComplimentaryTransport).toBe(true)
    expect(comped.pricingSnapshot?.transportRequestId).toBe("request-comped")
    expect(isMissingPricing(comped)).toBe(false)
    expect(charged.unitPrice).toBe(500)
    expect(charged.pricingSnapshot?.isComplimentaryTransport).toBeUndefined()
  })

  it("prices a complimentary transfer at 0 with no rate card at all, unlike a plain unpriced request", async () => {
    const transferLeg = leg({
      id: "leg-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-leg-transfer", "Airport transfers")],
      suiteTypes: [suiteType("vehicle-sedan", "supplier-leg-transfer", "Sedan")],
      rateCards: [],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            id: "request-comped",
            service_type: "transfer",
            route_id: null,
            suite_type_id: "vehicle-sedan",
            service_id: "leg-transfer",
            pickup_point: "Airport",
            dropoff_point: "Private villa, Bantry Bay",
            pickup_at: null,
            price_override: null,
            complimentary: true,
            rental_details: null,
          },
        ],
      }),
      packageDetail: detail([transferLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-transfer", selected: true, suiteTypeId: "vehicle-sedan", priceCurrency: "ZAR" }],
    })

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].unitPrice).toBe(0)
    expect(lineItems[0].total).toBe(0)
    expect(lineItems[0].pricingSnapshot?.isComplimentaryTransport).toBe(true)
  })

  it("prices a vehicle rental override per day, using the billable day count", async () => {
    const rentalLeg = leg({
      id: "leg-rental",
      supplierKind: "vehicle_rental",
      routes: [route("route-r", "supplier-leg-rental", "Self-drive")],
      suiteTypes: [suiteType("vehicle-suv", "supplier-leg-rental", "SUV")],
      rateCards: [rateCard({ id: "rc-suv", routeId: "route-r", suiteTypeId: "vehicle-suv", pricePerPerson: 700 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        transportRequests: [
          {
            service_type: "rental",
            route_id: null,
            suite_type_id: "vehicle-suv",
            service_id: "leg-rental",
            pickup_point: "Cape Town Airport",
            dropoff_point: "Cape Town Airport",
            pickup_at: "2026-09-01T08:00:00Z",
            price_override: 900,
            price_override_set_at: null,
            price_override_set_by: null,
            rental_details: { return_at: "2026-09-04T08:00:00Z" },
          },
        ],
      }),
      packageDetail: detail([rentalLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-rental", selected: true, suiteTypeId: "vehicle-suv", priceCurrency: "ZAR" }],
    })

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].qty).toBe(3)
    expect(lineItems[0].unitPrice).toBe(900)
    expect(lineItems[0].total).toBe(2700)
    expect(lineItems[0].pricingSnapshot?.manualTransportPrice).toBe(900)
    expect(lineItems[0].pricingSnapshot?.manualTransportPriceBase).toBe(700)
  })

  it("marks fixed-price package legs as inclusions so they aren't read as unpriced", async () => {
    const trainLeg = leg({ id: "leg-train", supplierKind: "train_operator", label: "The Blue Train" })
    const packageDetail = { ...detail([trainLeg]), fixedPricePerPerson: 24800 }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail,
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ legId: "leg-train", selected: true }],
    })

    expect(lineItems).toHaveLength(2)

    const [legLine, totalLine] = lineItems
    expect(legLine.description).toBe("The Blue Train")
    expect(legLine.unitPrice).toBe(0)
    expect(legLine.pricingSnapshot?.pricingMode).toBe("fixed_package")
    expect(isMissingPricing(legLine)).toBe(false)

    expect(totalLine.description).toContain("Package Total")
    expect(totalLine.unitPrice).toBe(24800)
    expect(isMissingPricing(totalLine)).toBe(false)
  })

  it("throws when a transfer row and the leg selection both lack a vehicle category", async () => {
    const transferLeg = leg({
      id: "leg-transfer",
      supplierKind: "transfers",
      routes: [route("route-t", "supplier-leg-transfer", "Airport transfers")],
      suiteTypes: [suiteType("vehicle-sedan", "supplier-leg-transfer", "Sedan")],
      rateCards: [rateCard({ id: "rc-sedan", routeId: "route-t", suiteTypeId: "vehicle-sedan", pricePerPerson: 500 })],
    })

    await expect(
      buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([transferLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [{ legId: "leg-transfer", selected: true }],
      }),
    ).rejects.toThrow(/No suite type selected/)
  })

  it("prices hotel legs per unit (room) with qty = nights", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 1200 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 3,
          units: [{ suiteTypeId: "room-std" }, { suiteTypeId: "room-std" }],
        },
      ],
    })

    expect(lineItems).toHaveLength(2)
    expect(lineItems.every((li) => li.qty === 3 && li.unitPrice === 1200)).toBe(true)
  })

  it("prices a hotel room off its typed override instead of the rate card, and says so internally", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 4000 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 3,
          units: [
            {
              suiteTypeId: "room-std",
              manualRoomPrice: 3600,
              manualRoomPriceSetAt: "2026-08-14T09:00:00Z",
              manualRoomPriceSetByName: "Carmen de Jager",
            },
            // Second room keeps the card price: the override is per room, not per leg.
            { suiteTypeId: "room-std" },
          ],
        },
      ],
    })

    const [overridden, standard] = lineItems
    expect(overridden.qty).toBe(3)
    expect(overridden.unitPrice).toBe(3600)
    expect(overridden.total).toBe(10800)
    expect(overridden.pricingSnapshot?.manualRoomPrice).toBe(3600)
    expect(overridden.pricingSnapshot?.manualRoomPriceBase).toBe(4000)
    expect(overridden.pricingSnapshot?.manualRoomPriceSetByName).toBe("Carmen de Jager")
    // The client-facing description must stay exactly what an un-overridden room shows.
    expect(overridden.description).toBe(standard.description)

    expect(standard.unitPrice).toBe(4000)
    expect(standard.pricingSnapshot?.manualRoomPrice).toBeUndefined()
  })

  it("lets an override price a hotel room no rate card covers", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 2,
          priceCurrency: "ZAR",
          units: [{ suiteTypeId: "room-std", manualRoomPrice: 5000 }],
        },
      ],
    })

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].total).toBe(10000)
    expect(lineItems[0].pricingSnapshot?.manualRoomPriceBase).toBeNull()
  })

  it("treats a zero override as a real price (a comped room), not as 'no override'", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 4000 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 2,
          units: [{ suiteTypeId: "room-std", manualRoomPrice: 0 }],
        },
      ],
    })

    expect(lineItems[0].unitPrice).toBe(0)
    expect(lineItems[0].pricingSnapshot?.manualRoomPrice).toBe(0)
  })

  it("charges nights - 1 per room when the hotel gifted the first night", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 4000 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 2,
          units: [
            { suiteTypeId: "room-std", complimentaryFirstNight: true },
            { suiteTypeId: "room-std" },
          ],
        },
      ],
    })

    const [gifted, charged] = lineItems
    expect(gifted.qty).toBe(1)
    expect(gifted.unitPrice).toBe(4000)
    expect(gifted.total).toBe(4000)
    expect(gifted.pricingSnapshot?.complimentaryNights).toBe(1)
    expect(gifted.pricingSnapshot?.stayNights).toBe(2)

    // The gift is per room: the second room pays for both its nights.
    expect(charged.qty).toBe(2)
    expect(charged.total).toBe(8000)
    expect(charged.pricingSnapshot?.complimentaryNights).toBeUndefined()
  })

  it("keeps the gift and a typed override composed — the override is the price of the charged nights", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 4000 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 2,
          units: [{ suiteTypeId: "room-std", manualRoomPrice: 3000, complimentaryFirstNight: true }],
        },
      ],
    })

    expect(lineItems[0].qty).toBe(1)
    expect(lineItems[0].unitPrice).toBe(3000)
    expect(lineItems[0].total).toBe(3000)
    expect(lineItems[0].pricingSnapshot?.complimentaryNights).toBe(1)
  })

  it("still emits a line for a one-night stay whose only night was gifted", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 4000 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([hotelLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-hotel",
          selected: true,
          routeId: "route-bb",
          nights: 1,
          units: [{ suiteTypeId: "room-std", complimentaryFirstNight: true }],
        },
      ],
    })

    // Dropping the line would drop the hotel from the itinerary, which is scoped to priced legs.
    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].qty).toBe(0)
    expect(lineItems[0].total).toBe(0)
    expect(lineItems[0].pricingSnapshot?.stayNights).toBe(1)
  })

  it("prices a tour leg off the tour type's route-agnostic card, whichever itinerary was booked", async () => {
    const tourLeg = leg({
      id: "leg-tour",
      supplierKind: "tour_operator",
      routes: [
        route("route-day-pass", "supplier-leg-tour", "Cape Town - One Day Pass"),
        route("route-scuba", "supplier-leg-tour", "Scuba dive"),
      ],
      suiteTypes: [suiteType("tour-classic", "supplier-leg-tour", "Classic Hop-on-Hop-off Ticket")],
      // No routeId: a tour operator prices the tour type across every itinerary.
      rateCards: [rateCard({ id: "rc-classic", routeId: null, suiteTypeId: "tour-classic", pricePerPerson: 850 })],
    })

    for (const routeId of ["route-day-pass", "route-scuba"]) {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([tourLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-tour",
            selected: true,
            routeId,
            units: [{ suiteTypeId: "tour-classic", adultCount: 2, childCount: 1, infantCount: 0 }],
          },
        ],
      })

      expect(lineItems.every((li) => li.unitPrice === 850)).toBe(true)
    }
  })

  it("prices a tour unit off its typed override instead of the rate card, and says so internally", async () => {
    const tourLeg = leg({
      id: "leg-tour",
      supplierKind: "tour_operator",
      routes: [route("route-day-pass", "supplier-leg-tour", "Cape Town - One Day Pass")],
      suiteTypes: [suiteType("tour-classic", "supplier-leg-tour", "Classic Hop-on-Hop-off Ticket")],
      rateCards: [rateCard({ id: "rc-classic", routeId: null, suiteTypeId: "tour-classic", pricePerPerson: 850 })],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([tourLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-tour",
          selected: true,
          routeId: "route-day-pass",
          units: [
            {
              suiteTypeId: "tour-classic",
              adultCount: 2,
              childCount: 1,
              infantCount: 0,
              manualTourPrice: 2000,
              manualTourPriceSetAt: "2026-08-14T09:00:00Z",
              manualTourPriceSetByName: "Carmen de Jager",
            },
          ],
        },
      ],
    })

    // A flat override replaces the whole unit's computed total with a single line, not the usual
    // adult/child/infant decomposition.
    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].qty).toBe(1)
    expect(lineItems[0].unitPrice).toBe(2000)
    expect(lineItems[0].total).toBe(2000)
    expect(lineItems[0].pricingSnapshot?.manualTourPrice).toBe(2000)
    expect(lineItems[0].pricingSnapshot?.manualTourPriceBase).toBe(850)
    expect(lineItems[0].pricingSnapshot?.manualTourPriceSetByName).toBe("Carmen de Jager")
  })

  it("lets a tour override price a unit no rate card covers", async () => {
    const tourLeg = leg({
      id: "leg-tour",
      supplierKind: "tour_operator",
      routes: [route("route-day-pass", "supplier-leg-tour", "Cape Town - One Day Pass")],
      suiteTypes: [suiteType("tour-classic", "supplier-leg-tour", "Classic Hop-on-Hop-off Ticket")],
      rateCards: [],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([tourLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-tour",
          selected: true,
          routeId: "route-day-pass",
          priceCurrency: "ZAR",
          units: [
            { suiteTypeId: "tour-classic", adultCount: 2, childCount: 1, infantCount: 0, manualTourPrice: 1500 },
          ],
        },
      ],
    })

    expect(lineItems).toHaveLength(1)
    expect(lineItems[0].unitPrice).toBe(1500)
    expect(lineItems[0].pricingSnapshot?.manualTourPriceBase).toBeNull()
  })

  it("prices a tour type with zero itineraries — a valid, unfinished setup, not an incomplete leg", async () => {
    const tourLeg = leg({
      id: "leg-tour-no-itinerary",
      supplierKind: "tour_operator",
      routes: [],
      suiteTypes: [suiteType("tour-heli", "supplier-leg-tour", "Helicopter Flight")],
      rateCards: [rateCard({ id: "rc-heli", routeId: null, suiteTypeId: "tour-heli", pricePerPerson: 1200 })],
    })

    const { lineItems, incompleteLegs } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([tourLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-tour-no-itinerary",
          selected: true,
          units: [{ suiteTypeId: "tour-heli", adultCount: 2, childCount: 1, infantCount: 0 }],
        },
      ],
    })

    expect(incompleteLegs).toHaveLength(0)
    expect(lineItems.every((li) => li.unitPrice === 1200)).toBe(true)
  })

  it("never substitutes another tour type's itinerary when the chosen type has none of its own", async () => {
    const tourLeg = leg({
      id: "leg-tour-mismatch",
      supplierKind: "tour_operator",
      routes: [
        { ...route("route-day-pass", "supplier-leg-tour", "Cape Town - One Day Pass"), suiteTypeId: "tour-classic" },
      ] as PackageLeg["routes"],
      suiteTypes: [
        suiteType("tour-classic", "supplier-leg-tour", "Classic Hop-on-Hop-off Ticket"),
        suiteType("tour-heli", "supplier-leg-tour", "Helicopter Flight"),
      ],
      rateCards: [
        rateCard({ id: "rc-classic", routeId: null, suiteTypeId: "tour-classic", pricePerPerson: 850 }),
        rateCard({ id: "rc-heli", routeId: null, suiteTypeId: "tour-heli", pricePerPerson: 1200 }),
      ],
    })

    const { lineItems, incompleteLegs } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([tourLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-tour-mismatch",
          selected: true,
          // No routeId selected — the leg's only itinerary belongs to "Classic", not "Helicopter".
          units: [{ suiteTypeId: "tour-heli", adultCount: 2, childCount: 1, infantCount: 0 }],
        },
      ],
    })

    expect(incompleteLegs).toHaveLength(0)
    expect(lineItems.every((li) => li.unitPrice === 1200)).toBe(true)
    expect(lineItems.every((li) => li.pricingSnapshot?.routeId !== "route-day-pass")).toBe(true)
  })

  it("rejects hotel legs without units (the old dialog payload shape)", async () => {
    const hotelLeg = leg({
      id: "leg-hotel",
      supplierKind: "hotel_property",
      routes: [route("route-bb", "supplier-leg-hotel", "B&B")],
      suiteTypes: [suiteType("room-std", "supplier-leg-hotel", "Standard")],
      rateCards: [rateCard({ id: "rc-room", routeId: "route-bb", suiteTypeId: "room-std", pricePerPerson: 1200 })],
    })

    await expect(
      buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([hotelLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [{ legId: "leg-hotel", selected: true, routeId: "route-bb", suiteTypeId: "room-std" }],
      }),
    ).rejects.toThrow(/No room type selected/)
  })

  it("prices train legs per unit passenger split and enforces booking totals", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({
          id: "rc-train",
          routeId: "route-cpt",
          suiteTypeId: "suite-dlx",
          pricePerPerson: 10000,
          childPrice: 5000,
        }),
      ],
    })

    // Booking totals: 2 adults, 1 child (age 8, default buckets) — split across two suites.
    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase(),
      packageDetail: detail([trainLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [
            { suiteTypeId: "suite-dlx", adultCount: 1, childCount: 1, infantCount: 0 },
            { suiteTypeId: "suite-dlx", adultCount: 1, childCount: 0, infantCount: 0 },
          ],
        },
      ],
    })

    // Both units are the same suite type, so their adults combine into one line (qty 2)
    // rather than splitting per room; only the child line stays separate.
    expect(lineItems).toHaveLength(2)
    const adultLines = lineItems.filter((li) => li.description.includes("Adult"))
    expect(adultLines).toHaveLength(1)
    expect(adultLines[0]?.qty).toBe(2)
    expect(adultLines[0]?.total).toBe(20000)
    const childLine = lineItems.find((li) => li.description.includes("Child"))
    expect(childLine?.unitPrice).toBe(5000)

    // Snapshot must carry the leg's route so booking.route_id can be synced to
    // the quoted journey (resolvePrimaryRoute reads these fields).
    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine?.pricingSnapshot?.routeId).toBe("route-cpt")
    expect(adultLine?.pricingSnapshot?.routeName).toBe("CPT-PTA")
    expect(adultLine?.pricingSnapshot?.supplierKind).toBe("train_operator")

    await expect(
      buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([trainLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-train",
            selected: true,
            units: [{ suiteTypeId: "suite-dlx", adultCount: 1, childCount: 0, infantCount: 0 }],
          },
        ],
      }),
    ).rejects.toThrow(/suites hold 1 adults.*but the booking is for 2 adults/)
  })

  it("splits 3 suites of the same suite type into separate adult lines per distinct room config", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe Double")],
      rateCards: [
        rateCard({
          id: "rc-train",
          routeId: "route-cpt",
          suiteTypeId: "suite-dlx",
          pricePerPerson: 10000,
        }),
      ],
    })
    const sixAdultsBooking = {
      id: JOB_ID,
      no_of_adults: 6,
      no_of_children: 0,
      no_of_suites: 3,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: sixAdultsBooking }),
      packageDetail: detail([trainLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [
            // Same suite type, differing bedroom/bathroom config per room — prices as one suite
            // type (one rate card lookup), but each room's own config gets its own line.
            { suiteTypeId: "suite-dlx", bedroomTypeId: "bed-twin", adultCount: 2, childCount: 0, infantCount: 0 },
            { suiteTypeId: "suite-dlx", bedroomTypeId: "bed-double", adultCount: 2, childCount: 0, infantCount: 0 },
            { suiteTypeId: "suite-dlx", bathroomTypeId: "bath-shower", adultCount: 2, childCount: 0, infantCount: 0 },
          ],
        },
      ],
    })

    const adultLines = lineItems.filter((li) => li.description.includes("Adult"))
    expect(adultLines).toHaveLength(3)
    for (const line of adultLines) {
      expect(line.qty).toBe(2)
      expect(line.unitPrice).toBe(10000)
      expect(line.total).toBe(20000)
    }
    expect(adultLines.reduce((sum, li) => sum + li.qty, 0)).toBe(6)
  })

  it("names each room's own bed/bathroom config when 2+ rooms share a suite type (Rovos-style multi-config booking)", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-pta", "supplier-leg-train", "PTA-VFA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe Suite")],
      rateCards: [
        rateCard({ id: "rc-train", routeId: "route-pta", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
      ],
    })
    const fourAdultsBooking = {
      id: JOB_ID,
      no_of_adults: 4,
      no_of_children: 0,
      no_of_suites: 2,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        booking: fourAdultsBooking,
        bedroomTypes: [
          { id: "bed-twin", name: "Twin" },
          { id: "bed-double", name: "Double" },
        ],
        bedroomLayouts: [
          { id: "layout-crosswise", name: "Crosswise" },
          { id: "layout-lshape", name: "L-Shape" },
        ],
        bathroomTypes: [{ id: "bath-shower", name: "Shower" }],
      }),
      packageDetail: detail([trainLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [
            {
              suiteTypeId: "suite-dlx",
              bedroomTypeId: "bed-twin",
              bedroomLayoutId: "layout-crosswise",
              bathroomTypeId: "bath-shower",
              adultCount: 2,
              childCount: 0,
              infantCount: 0,
            },
            {
              suiteTypeId: "suite-dlx",
              bedroomTypeId: "bed-double",
              bedroomLayoutId: "layout-lshape",
              bathroomTypeId: "bath-shower",
              adultCount: 2,
              childCount: 0,
              infantCount: 0,
            },
          ],
        },
      ],
    })

    const adultLines = lineItems.filter((li) => li.description.includes("Adult"))
    expect(adultLines).toHaveLength(2)

    const twinLine = adultLines.find((li) => li.description.includes("Twin"))
    const doubleLine = adultLines.find((li) => li.description.includes("Double"))
    expect(twinLine?.description).toContain("Crosswise")
    expect(twinLine?.description).not.toContain("Double")
    expect(twinLine?.description).not.toContain("L-Shape")
    expect(doubleLine?.description).toContain("L-Shape")
    expect(doubleLine?.description).not.toContain("Twin")
    expect(doubleLine?.description).not.toContain("Crosswise")
    expect(twinLine?.qty).toBe(2)
    expect(doubleLine?.qty).toBe(2)
  })

  it("describes a unit by suite type alone when no bed/layout/bathroom was picked", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-pta", "supplier-leg-train", "PTA-VFA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe Suite")],
      rateCards: [
        rateCard({ id: "rc-train", routeId: "route-pta", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
      ],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        booking: { id: JOB_ID, no_of_adults: 2, no_of_children: 0, no_of_suites: 1, child_ages: [], departure_date: "2026-09-01" },
        // Suite type offers several options on every axis — none of them should leak into the
        // description when the unit itself left every axis unset (Not set in Build Booking step 2).
        bedroomTypes: [
          { id: "bed-twin", name: "Twin" },
          { id: "bed-double", name: "Double" },
        ],
        bedroomLayouts: [
          { id: "layout-crosswise", name: "Crosswise" },
          { id: "layout-lshape", name: "L-Shape" },
        ],
        bathroomTypes: [{ id: "bath-shower", name: "Shower" }],
      }),
      packageDetail: detail([trainLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [{ suiteTypeId: "suite-dlx", adultCount: 2, childCount: 0, infantCount: 0 }],
        },
      ],
    })

    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine?.description).toContain("Deluxe Suite")
    expect(adultLine?.description).not.toContain("Twin")
    expect(adultLine?.description).not.toContain("Double")
    expect(adultLine?.description).not.toContain("Crosswise")
    expect(adultLine?.description).not.toContain("L-Shape")
    expect(adultLine?.description).not.toContain("Shower")
  })

  it("names each passenger kind's own room config when only one room supplies that kind", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({
          id: "rc-train",
          routeId: "route-cpt",
          suiteTypeId: "suite-dlx",
          pricePerPerson: 10000,
          childPrice: 5000,
        }),
      ],
    })

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        bathroomTypes: [
          { id: "bath-shower", name: "Shower" },
          { id: "bath-3-4", name: "3/4 bath" },
        ],
      }),
      packageDetail: detail([trainLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [
            // Adults are only in the shower suite; the child is only in the 3/4-bath suite.
            { suiteTypeId: "suite-dlx", bathroomTypeId: "bath-shower", adultCount: 2, childCount: 0, infantCount: 0 },
            { suiteTypeId: "suite-dlx", bathroomTypeId: "bath-3-4", adultCount: 0, childCount: 1, infantCount: 0 },
          ],
        },
      ],
    })

    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    const childLine = lineItems.find((li) => li.description.includes("Child"))
    // Each line should name only its own room's bathroom — not both merged together.
    expect(adultLine?.description).toContain("Shower")
    expect(adultLine?.description).not.toContain("3/4 bath")
    expect(childLine?.description).toContain("3/4 bath")
    expect(childLine?.description).not.toContain("Shower")
  })

  it("does not cross-contaminate the shared line's config with the solo line's config when both contribute the same passenger kind", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({ id: "rc-train", routeId: "route-cpt", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
      ],
    })
    const threeAdultsBooking = {
      id: JOB_ID,
      no_of_adults: 3,
      no_of_children: 0,
      no_of_suites: 2,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({
        booking: threeAdultsBooking,
        bathroomTypes: [
          { id: "bath-shower", name: "Shower" },
          { id: "bath-3-4", name: "3/4 bath" },
        ],
      }),
      packageDetail: { ...detail([trainLeg]), singleSupplementPct: 25 },
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [
            // Same suite type: one shared 2-adult room, one solo 1-adult room. Both contribute
            // to the "Adult" passenger kind, so each line must name only its own room's config.
            { suiteTypeId: "suite-dlx", bathroomTypeId: "bath-shower", adultCount: 2, childCount: 0, infantCount: 0 },
            { suiteTypeId: "suite-dlx", bathroomTypeId: "bath-3-4", adultCount: 1, childCount: 0, infantCount: 0 },
          ],
        },
      ],
    })

    const adultLines = lineItems.filter((li) => li.description.includes("Adult"))
    expect(adultLines).toHaveLength(2)

    const sharedLine = adultLines.find((li) => li.qty === 2)
    const soloLine = adultLines.find((li) => li.qty === 1)
    expect(sharedLine?.description).toContain("Shower")
    expect(sharedLine?.description).not.toContain("3/4 bath")
    expect(soloLine?.description).toContain("3/4 bath")
    expect(soloLine?.description).not.toContain("Shower")
    expect(soloLine?.description).toContain("(25% single supplement included)")
  })

  it("charges a single supplement for a unit with exactly one adult and no children", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({ id: "rc-train", routeId: "route-cpt", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
      ],
    })
    const soloBooking = {
      id: JOB_ID,
      no_of_adults: 1,
      no_of_children: 0,
      no_of_suites: 1,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: soloBooking }),
      packageDetail: { ...detail([trainLeg]), singleSupplementPct: 25 },
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [{ suiteTypeId: "suite-dlx", adultCount: 1, childCount: 0, infantCount: 0 }],
        },
      ],
    })

    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine).toBeDefined()
    expect(adultLine?.description).toContain("(25% single supplement included)")
    expect(adultLine?.qty).toBe(1)
    expect(adultLine?.unitPrice).toBe(12500)
    expect(adultLine?.total).toBe(12500)
    expect(lineItems.some((li) => li.description.includes("Single supplement"))).toBe(false)
  })

  it("charges a single supplement for a unit with a lone child (no accompanying adult)", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({
          id: "rc-train",
          routeId: "route-cpt",
          suiteTypeId: "suite-dlx",
          pricePerPerson: 10000,
          childPrice: 5000,
        }),
      ],
    })
    const soloChildBooking = {
      id: JOB_ID,
      no_of_adults: 2,
      no_of_children: 1,
      no_of_suites: 2,
      child_ages: [8],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: soloChildBooking }),
      packageDetail: { ...detail([trainLeg]), singleSupplementPct: 50 },
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [
            { suiteTypeId: "suite-dlx", adultCount: 2, childCount: 0, infantCount: 0 },
            { suiteTypeId: "suite-dlx", adultCount: 0, childCount: 1, infantCount: 0 },
          ],
        },
      ],
    })

    const childLine = lineItems.find((li) => li.description.includes("Child"))
    expect(childLine).toBeDefined()
    expect(childLine?.description).toContain("(50% single supplement included)")
    expect(childLine?.qty).toBe(1)
    expect(childLine?.unitPrice).toBe(7500)
    expect(childLine?.total).toBe(7500)

    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine?.description).not.toContain("Single")
  })

  it("does not charge a single supplement when a unit has two adults sharing", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({ id: "rc-train", routeId: "route-cpt", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
      ],
    })
    const sharingBooking = {
      id: JOB_ID,
      no_of_adults: 2,
      no_of_children: 0,
      no_of_suites: 1,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: sharingBooking }),
      packageDetail: { ...detail([trainLeg]), singleSupplementPct: 25 },
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [{ suiteTypeId: "suite-dlx", adultCount: 2, childCount: 0, infantCount: 0 }],
        },
      ],
    })

    expect(lineItems.some((li) => li.description.includes("Single"))).toBe(false)
    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine?.unitPrice).toBe(10000)
  })

  it("does not charge a single supplement when a lone adult shares a unit with a child", async () => {
    const trainLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [route("route-cpt", "supplier-leg-train", "CPT-PTA")],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({
          id: "rc-train",
          routeId: "route-cpt",
          suiteTypeId: "suite-dlx",
          pricePerPerson: 10000,
          childPrice: 5000,
        }),
      ],
    })
    const familyBooking = {
      id: JOB_ID,
      no_of_adults: 1,
      no_of_children: 1,
      no_of_suites: 1,
      child_ages: [8],
      departure_date: "2026-09-01",
    }

    const { lineItems } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: familyBooking }),
      packageDetail: { ...detail([trainLeg]), singleSupplementPct: 25 },
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [
        {
          legId: "leg-train",
          selected: true,
          units: [{ suiteTypeId: "suite-dlx", adultCount: 1, childCount: 1, infantCount: 0 }],
        },
      ],
    })

    expect(lineItems.some((li) => li.description.includes("Single"))).toBe(false)
  })

  it("renders the flipped travel direction for a reversed two-way route, without changing price", async () => {
    const twoWayLeg = leg({
      id: "leg-train",
      supplierKind: "train_operator",
      routes: [
        {
          ...route("route-cpt", "supplier-leg-train", "Cape Town ↔ Pretoria"),
          directionMode: "round_trip",
          originLocationName: "Cape Town",
          destinationLocationName: "Pretoria",
        } as PackageLeg["routes"][number],
      ],
      suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
      rateCards: [
        rateCard({ id: "rc-train", routeId: "route-cpt", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
      ],
    })

    const selections = [
      {
        legId: "leg-train",
        selected: true,
        units: [{ suiteTypeId: "suite-dlx", adultCount: 1, childCount: 0, infantCount: 0 }],
      },
    ]

    const singleAdultBooking = {
      id: JOB_ID,
      no_of_adults: 1,
      no_of_children: 0,
      no_of_suites: 1,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    const { lineItems: forward } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: singleAdultBooking }),
      packageDetail: detail([twoWayLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections,
    })
    const { lineItems: reversed } = await buildPackageQuoteLineItems({
      supabase: buildSupabase({ booking: singleAdultBooking }),
      packageDetail: detail([twoWayLeg]),
      jobId: JOB_ID,
      travelDate: "2026-09-01",
      selections: [{ ...selections[0], routeReversed: true }],
    })

    const forwardAdult = forward.find((li) => li.description.includes("Adult"))
    const reversedAdult = reversed.find((li) => li.description.includes("Adult"))

    expect(forwardAdult?.pricingSnapshot?.routeName).toBe("Cape Town → Pretoria")
    expect(forwardAdult?.pricingSnapshot?.routeReversed).toBe(false)
    expect(reversedAdult?.pricingSnapshot?.routeName).toBe("Pretoria → Cape Town")
    expect(reversedAdult?.pricingSnapshot?.routeReversed).toBe(true)
    expect(reversedAdult?.total).toBe(forwardAdult?.total)
  })

  describe("manual pricing (e.g. airlines)", () => {
    const manualLeg = leg({
      id: "leg-flight",
      supplierKind: "airline",
      pricingMode: "manual",
      routes: [route("route-jnb-cpt", "supplier-leg-flight", "JNB-CPT")],
      suiteTypes: [suiteType("cabin-economy", "supplier-leg-flight", "Economy")],
      // No rate cards at all -- a manual leg must never need one.
      rateCards: [],
    })

    it("prices a manual leg straight off the typed fare, never touching rate cards", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([manualLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-flight",
            selected: true,
            routeId: "route-jnb-cpt",
            units: [
              {
                suiteTypeId: "cabin-economy",
                adultCount: 2,
                childCount: 1,
                infantCount: 0,
                manualAdultPrice: 2000,
                manualChildPrice: 1500,
                manualInfantPrice: null,
              },
            ],
          },
        ],
      })

      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      const childLine = lineItems.find((li) => li.description.includes("Child"))
      expect(adultLine?.unitPrice).toBe(2000)
      expect(adultLine?.qty).toBe(2)
      expect(adultLine?.total).toBe(4000)
      expect(adultLine?.pricingSnapshot?.pricingMode).toBe("manual")
      expect(adultLine?.pricingSnapshot?.rateCardId).toBeNull()
      expect(childLine?.unitPrice).toBe(1500)
    })

    it("falls a blank child/infant fare back up to the adult fare", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([manualLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-flight",
            selected: true,
            routeId: "route-jnb-cpt",
            units: [
              {
                suiteTypeId: "cabin-economy",
                adultCount: 2,
                childCount: 1,
                infantCount: 0,
                manualAdultPrice: 2000,
                manualChildPrice: null,
                manualInfantPrice: null,
              },
            ],
          },
        ],
      })

      const childLine = lineItems.find((li) => li.description.includes("Child"))
      expect(childLine?.unitPrice).toBe(2000)
    })

    it("emits a zero-priced, flagged line when no fare has been typed yet, instead of throwing", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase({
          booking: {
            id: JOB_ID,
            no_of_adults: 1,
            no_of_children: 0,
            no_of_suites: 1,
            child_ages: [],
            departure_date: "2026-09-01",
          },
        }),
        packageDetail: detail([manualLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-flight",
            selected: true,
            routeId: "route-jnb-cpt",
            units: [
              {
                suiteTypeId: "cabin-economy",
                adultCount: 1,
                childCount: 0,
                infantCount: 0,
                manualAdultPrice: null,
                manualChildPrice: null,
                manualInfantPrice: null,
              },
            ],
          },
        ],
      })

      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      expect(adultLine?.unitPrice).toBe(0)
      expect(isMissingPricing(adultLine!)).toBe(true)
    })

    it("keeps two cabins at different fares on separate lines instead of averaging them", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase({
          booking: {
            id: JOB_ID,
            no_of_adults: 2,
            no_of_children: 0,
            no_of_suites: 2,
            child_ages: [],
            departure_date: "2026-09-01",
          },
        }),
        packageDetail: detail([manualLeg]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-flight",
            selected: true,
            routeId: "route-jnb-cpt",
            units: [
              {
                suiteTypeId: "cabin-economy",
                adultCount: 1,
                childCount: 0,
                infantCount: 0,
                manualAdultPrice: 2000,
                manualChildPrice: null,
                manualInfantPrice: null,
              },
              {
                suiteTypeId: "cabin-economy",
                adultCount: 1,
                childCount: 0,
                infantCount: 0,
                manualAdultPrice: 5000,
                manualChildPrice: null,
                manualInfantPrice: null,
              },
            ],
          },
        ],
      })

      const adultLines = lineItems.filter((li) => li.description.includes("Adult"))
      expect(adultLines).toHaveLength(2)
      expect(adultLines.map((li) => li.unitPrice).sort()).toEqual([2000, 5000])
      expect(adultLines.every((li) => li.qty === 1)).toBe(true)
    })

    it("never applies a single supplement to a manual leg, even for a solo traveller", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase({
          booking: {
            id: JOB_ID,
            no_of_adults: 1,
            no_of_children: 0,
            no_of_suites: 1,
            child_ages: [],
            departure_date: "2026-09-01",
          },
        }),
        packageDetail: { ...detail([manualLeg]), singleSupplementPct: 25 },
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          {
            legId: "leg-flight",
            selected: true,
            routeId: "route-jnb-cpt",
            units: [
              {
                suiteTypeId: "cabin-economy",
                adultCount: 1,
                childCount: 0,
                infantCount: 0,
                manualAdultPrice: 2000,
                manualChildPrice: null,
                manualInfantPrice: null,
              },
            ],
          },
        ],
      })

      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      expect(adultLine?.unitPrice).toBe(2000)
      expect(adultLine?.description).not.toContain("single supplement")
      expect(lineItems.some((li) => li.description.includes("Single supplement"))).toBe(false)
    })
  })

  /**
   * The reported bug, reduced: Rovos Rail on the Cape Town Journey, priced for 2028. The chosen
   * "Rovos Rail SADC" rate only has a 2026 card, so it dropped out of the date-filtered candidate
   * list and the builder quoted the Blue Train Domestic card that did cover 2028 -- R59 900 where
   * the salesperson had picked a R22 500 rate.
   */
  describe("a chosen rate type is honoured or the build fails", () => {
    const SADC = "rate-type-rvsadc"
    const BTLD = "rate-type-btld"
    const rateTypes = [
      { id: SADC, code: "RVSADC", name: "Rovos Rail SADC" },
      { id: BTLD, code: "BTLD", name: "Blue Train Domestic Rate" },
    ]

    const trainLeg = leg({
      id: "leg-rovos",
      supplierKind: "train_operator",
      supplierName: "Rovos Rail",
      routes: [route("route-ctj", "supplier-leg-rovos", "Cape Town Journey")],
      suiteTypes: [suiteType("suite-pullman", "supplier-leg-rovos", "Pullman Suite")],
      rateCards: [
        rateCard({
          id: "rc-sadc-2026",
          routeId: "route-ctj",
          suiteTypeId: "suite-pullman",
          rateTypeId: SADC,
          pricePerPerson: 22500,
          childPrice: 11250,
          validFrom: "2026-06-30",
          validTo: "2026-09-30",
        }),
        rateCard({
          id: "rc-btld-open",
          routeId: "route-ctj",
          suiteTypeId: "suite-pullman",
          rateTypeId: BTLD,
          pricePerPerson: 59900,
          childPrice: 29950,
          validFrom: "2026-01-01",
          validTo: null,
        }),
      ],
    })

    function build(travelDate: string, rateTypeId: string | undefined) {
      return buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([trainLeg]),
        jobId: JOB_ID,
        travelDate,
        rateTypes,
        fallbackRateTypeId: BTLD,
        selections: [
          {
            legId: "leg-rovos",
            selected: true,
            routeId: "route-ctj",
            rateTypeId,
            units: [{ suiteTypeId: "suite-pullman", adultCount: 2, childCount: 1, infantCount: 0 }],
          },
        ],
      })
    }

    it("refuses to price a chosen rate off another rate type's card", async () => {
      await expect(build("2028-08-25", SADC)).rejects.toThrow(
        /No "Rovos Rail SADC" rate covers 2028-08-25 .*Extend that rate's validity period/,
      )
    })

    it("prices at the chosen rate when its card covers the date", async () => {
      const { lineItems } = await build("2026-08-25", SADC)
      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      const childLine = lineItems.find((li) => li.description.includes("Child"))
      expect(adultLine?.unitPrice).toBe(22500)
      expect(childLine?.unitPrice).toBe(11250)
      expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(SADC)
      expect(adultLine?.pricingSnapshot?.rateTypeName).toBe("Rovos Rail SADC")
      expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(false)
    })

    it("names the rate type when it was never priced on the route at all", async () => {
      await expect(build("2026-08-25", "rate-type-nett")).rejects.toThrow(
        /has no rate card for "Pullman Suite" on "Cape Town Journey"/,
      )
    })

    it("still falls back to a default when the leg chose no rate type, and marks it inherited", async () => {
      const { lineItems } = await build("2028-08-25", undefined)
      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      expect(adultLine?.unitPrice).toBe(59900)
      expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(BTLD)
      expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(true)
    })

    /**
     * The supplier's quoted rate is inherited, not asked for, so it gets the opposite treatment to
     * an explicit per-leg choice: a missing card falls through to the base rate rather than failing.
     */
    describe("the supplier's quoted rate", () => {
      function buildInherited(travelDate: string) {
        return buildPackageQuoteLineItems({
          supabase: buildSupabase(),
          packageDetail: detail([
            { ...trainLeg, quoteRateTypeId: SADC, baseRateTypeId: BTLD },
          ]),
          jobId: JOB_ID,
          travelDate,
          rateTypes,
          fallbackRateTypeId: BTLD,
          selections: [
            {
              legId: "leg-rovos",
              selected: true,
              routeId: "route-ctj",
              units: [{ suiteTypeId: "suite-pullman", adultCount: 2, childCount: 1, infantCount: 0 }],
            },
          ],
        })
      }

      it("prices at the quoted rate when its card covers the date", async () => {
        const { lineItems } = await buildInherited("2026-08-25")
        const adultLine = lineItems.find((li) => li.description.includes("Adult"))
        expect(adultLine?.unitPrice).toBe(22500)
        expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(SADC)
        expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(true)
      })

      it("falls through to the base rate when the quoted rate has no card, without erroring", async () => {
        const { lineItems } = await buildInherited("2028-08-25")
        const adultLine = lineItems.find((li) => li.description.includes("Adult"))
        expect(adultLine?.unitPrice).toBe(59900)
        expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(BTLD)
        expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(true)
      })
    })
  })

  describe("currency conversion", () => {
    const FX = { ZAR: 1, USD: 17.25 }

    /** A USD-priced train leg: the case the screenshot came from. */
    function usdTrainLeg(currency = "USD") {
      return leg({
        id: "leg-usd",
        supplierKind: "train_operator",
        routes: [route("route-usd", "supplier-leg-usd", "Cape Town Explorer")],
        suiteTypes: [suiteType("suite-lux", "supplier-leg-usd", "Luxury Suite")],
        rateCards: [
          rateCard({
            id: "rc-usd",
            routeId: "route-usd",
            suiteTypeId: "suite-lux",
            pricePerPerson: 6400,
            childPrice: 3200,
            currency,
          }),
        ],
      })
    }

    const selections = [
      {
        legId: "leg-usd",
        selected: true,
        routeId: "route-usd",
        units: [
          {
            suiteTypeId: "suite-lux",
            adultCount: 2,
            childCount: 1,
            infantCount: 0,
          },
        ],
      },
    ]

    it("converts a foreign rate card into the quote's currency", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([usdTrainLeg()]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections,
        quoteCurrency: "ZAR",
        fxRates: FX,
        fxRateAsOf: "2026-08-13",
      })

      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      expect(adultLine?.unitPrice).toBe(110400)
      // qty x unitPrice must still equal total after conversion.
      expect(adultLine?.total).toBe(220800)
    })

    it("stamps the conversion chain onto the snapshot so a sent quote never reprices", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([usdTrainLeg()]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections,
        quoteCurrency: "ZAR",
        fxRates: FX,
        fxRateAsOf: "2026-08-13",
      })

      const snapshot = lineItems.find((li) => li.description.includes("Adult"))?.pricingSnapshot
      expect(snapshot?.sourceCurrency).toBe("USD")
      expect(snapshot?.sourceUnitPrice).toBe(6400)
      expect(snapshot?.fxRate).toBe(17.25)
      expect(snapshot?.fxRateAsOf).toBe("2026-08-13")
      // baseUnitPrice is post-conversion so downstream maths never has to know a conversion
      // happened; the pre-conversion figure lives in sourceUnitPrice.
      expect(snapshot?.baseUnitPrice).toBe(110400)
    })

    it("converts the child rate off its own card price, not the adult's", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([usdTrainLeg()]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections,
        quoteCurrency: "ZAR",
        fxRates: FX,
      })

      const childLine = lineItems.find((li) => li.description.includes("Child"))
      expect(childLine?.unitPrice).toBe(55200)
      expect(childLine?.pricingSnapshot?.sourceUnitPrice).toBe(3200)
    })

    it("leaves a native line untouched and stamps no FX fields on it", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([usdTrainLeg("ZAR")]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections,
        quoteCurrency: "ZAR",
        fxRates: FX,
        fxRateAsOf: "2026-08-13",
      })

      const snapshot = lineItems.find((li) => li.description.includes("Adult"))?.pricingSnapshot
      expect(snapshot?.sourceCurrency).toBeNull()
      expect(snapshot?.sourceUnitPrice).toBeNull()
      expect(snapshot?.fxRate).toBeNull()
    })

    it("defaults to no conversion when no currency or rates are supplied", async () => {
      // Every pre-existing caller relied on this; a ZAR-only build must behave exactly as before.
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([usdTrainLeg("ZAR")]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections,
      })

      expect(lineItems.find((li) => li.description.includes("Adult"))?.unitPrice).toBe(6400)
    })

    it("refuses to price a foreign card when its rate is missing", async () => {
      await expect(
        buildPackageQuoteLineItems({
          supabase: buildSupabase(),
          packageDetail: detail([usdTrainLeg()]),
          jobId: JOB_ID,
          travelDate: "2026-09-01",
          selections,
          quoteCurrency: "ZAR",
          fxRates: { ZAR: 1 },
        }),
      ).rejects.toThrow(/exchange rate/i)
    })

    it("prices commission off the converted subtotal, not the foreign one", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase(),
        packageDetail: detail([usdTrainLeg()]),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [{ ...selections[0], commissionOverride: { type: "percent" as const, value: 10 } }],
        quoteCurrency: "ZAR",
        fxRates: FX,
      })

      const converted = lineItems
        .filter((li) => li.description !== "Commission")
        .reduce((sum, li) => sum + li.total, 0)
      const commission = lineItems.find((li) => li.description === "Commission")
      expect(commission?.total).toBe(Math.round(converted * 0.1 * 100) / 100)
    })
  })

  // QA 11, F11-8. commissionOverride is a per-leg field, but the decision it carries is
  // booking-level (one Commission line priced off the whole subtotal — see the comment at the
  // call site). `.find()` used to take the first leg that set one and silently drop the rest, so
  // two legs disagreeing produced a total that depended on array order, with no signal to anyone.
  describe("commissionOverride across legs", () => {
    function twoLegDetail() {
      const trainLeg = leg({
        id: "leg-train",
        supplierKind: "train_operator",
        routes: [route("route-train", "supplier-leg-train", "CPT-PTA")],
        suiteTypes: [suiteType("suite-dlx", "supplier-leg-train", "Deluxe")],
        rateCards: [
          rateCard({ id: "rc-train", routeId: "route-train", suiteTypeId: "suite-dlx", pricePerPerson: 10000 }),
        ],
      })
      const hotelLeg = leg({
        id: "leg-hotel",
        supplierKind: "hotel_property",
        routes: [route("route-hotel", "supplier-leg-hotel", "Bed & Breakfast")],
        suiteTypes: [suiteType("suite-std", "supplier-leg-hotel", "Standard Room")],
        rateCards: [
          rateCard({ id: "rc-hotel", routeId: "route-hotel", suiteTypeId: "suite-std", pricePerPerson: 2000 }),
        ],
      })
      return detail([trainLeg, hotelLeg])
    }

    const trainSelection = {
      legId: "leg-train",
      selected: true,
      units: [{ suiteTypeId: "suite-dlx", adultCount: 1, childCount: 0, infantCount: 0 }],
    }
    const hotelSelection = {
      legId: "leg-hotel",
      selected: true,
      units: [{ suiteTypeId: "suite-std", adultCount: 1, childCount: 0, infantCount: 0 }],
    }
    const soloAdultBooking = {
      id: JOB_ID,
      no_of_adults: 1,
      no_of_children: 0,
      no_of_suites: 1,
      child_ages: [],
      departure_date: "2026-09-01",
    }

    it("rejects two legs that disagree on the commission override, instead of silently keeping the first", async () => {
      await expect(
        buildPackageQuoteLineItems({
          supabase: buildSupabase({ booking: soloAdultBooking }),
          packageDetail: twoLegDetail(),
          jobId: JOB_ID,
          travelDate: "2026-09-01",
          selections: [
            { ...trainSelection, commissionOverride: { type: "percent", value: 10 } },
            { ...hotelSelection, commissionOverride: { type: "fixed", value: 99 } },
          ],
        }),
      ).rejects.toThrow(/disagree/i)
    })

    it("accepts the same override repeated on every leg — the only shape the UI sends today", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase({ booking: soloAdultBooking }),
        packageDetail: twoLegDetail(),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [
          { ...trainSelection, commissionOverride: { type: "percent", value: 10 } },
          { ...hotelSelection, commissionOverride: { type: "percent", value: 10 } },
        ],
      })

      const commission = lineItems.find((li) => li.description === "Commission")
      // (10000 + 2000) x 10%
      expect(commission?.total).toBe(1200)
    })

    it("applies the override when only one leg sets it and the rest are unset", async () => {
      const { lineItems } = await buildPackageQuoteLineItems({
        supabase: buildSupabase({ booking: soloAdultBooking }),
        packageDetail: twoLegDetail(),
        jobId: JOB_ID,
        travelDate: "2026-09-01",
        selections: [trainSelection, { ...hotelSelection, commissionOverride: { type: "fixed", value: 500 } }],
      })

      expect(lineItems.find((li) => li.description === "Commission")?.total).toBe(500)
    })
  })
})
