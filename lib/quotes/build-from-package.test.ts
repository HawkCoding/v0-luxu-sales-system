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
            package_leg_id: "leg-transfer",
            pickup_point: "Airport",
            dropoff_point: "Hotel",
            pickup_at: null,
            rental_details: null,
          },
          {
            service_type: "transfer",
            route_id: null,
            suite_type_id: null,
            package_leg_id: "leg-transfer",
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
    expect(lineItems[0].description).toContain("Van")
    expect(lineItems[0].unitPrice).toBe(900)
    expect(lineItems[1].description).toContain("Sedan")
    expect(lineItems[1].unitPrice).toBe(500)
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

    // Zero-qty passenger lines are dropped: unit1 adult+child, unit2 adult.
    expect(lineItems).toHaveLength(3)
    expect(lineItems.filter((li) => li.description.includes("Adult"))).toHaveLength(2)
    const childLine = lineItems.find((li) => li.description.includes("Child"))
    expect(childLine?.unitPrice).toBe(5000)

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
    ).rejects.toThrow(/must sum to the booking's traveller totals/)
  })
})
