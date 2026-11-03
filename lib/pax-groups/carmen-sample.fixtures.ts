// Carmen's South Africa package (HANDOFF.md, "The user's target email"), as real-shaped rows: six
// Blue Train suites on SA and TW rates — suite 2 and 4 each one SA and one TW adult, suites 3 and 5
// children only — suites 2+3 and 4+5 each sharing one One&Only family apartment, suites 1 and 6 in
// a classic room each, a minibus every suite shares, a complimentary airport transfer only suite 6
// takes, and our commission. Priced so the suites come out at her own figures (R272 400 in all).
// Shared by the document tests and the sample renderer (lib/pdf/design-review/render-pax-group-samples).
// No DB access.

import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { Json } from "@/lib/supabase/types"
import type { PaxGroupMeta, PricingSnapshot, PricingUnitRef, SupplierKind } from "@/lib/types"

export const CARMEN_SUBTOTAL = 272_400
export const CARMEN_DEPARTURE = "2026-08-11"

export const CARMEN_GROUPS: PaxGroupMeta[] = [
  { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
  { id: "g2", position: 2, label: "Twin Deluxe Suite 2" },
  { id: "g3", position: 3, label: "Twin Deluxe Suite 3" },
  { id: "g4", position: 4, label: "Twin Deluxe Suite 4" },
  { id: "g5", position: 5, label: "Twin Deluxe Suite 5" },
  { id: "g6", position: 6, label: "Double Deluxe Suite 6" },
]

/** rate_types.short_label by id, as loadRateShortLabels returns them. */
export const CARMEN_RATE_LABELS = new Map<string, string | null>([
  ["rate-sa", "SA"],
  ["rate-tw", "TW"],
])

export interface SampleLineRow {
  description: string
  qty: number
  unit_price: number
  total: number
  pricing_snapshot: Json
}

function ref(
  index: number,
  unitId: string,
  counts: { adults?: number; children?: number },
  groups: string[],
  rateTypeId?: string,
): PricingUnitRef {
  return {
    index,
    unitId,
    adults: counts.adults ?? 0,
    children: counts.children ?? 0,
    infants: 0,
    paxGroupIds: groups,
    ...(rateTypeId ? { rateTypeId } : {}),
  }
}

function snapshot(partial: Partial<PricingSnapshot> & { supplierKind: SupplierKind | null; legId: string | null }): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: null,
    packageName: null,
    legLabel: null,
    supplierId: null,
    supplierName: null,
    routeId: null,
    routeName: null,
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: CARMEN_DEPARTURE,
    passengerKind: "adult",
    baseUnitPrice: 0,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    commission: null,
    ...partial,
  } as PricingSnapshot
}

function row(description: string, qty: number, unitPrice: number, snap: PricingSnapshot): SampleLineRow {
  return {
    description,
    qty,
    unit_price: unitPrice,
    total: Math.round(qty * unitPrice * 100) / 100,
    pricing_snapshot: snap as unknown as Json,
  }
}

const train = (partial: Partial<PricingSnapshot>) =>
  snapshot({
    supplierKind: "train_operator",
    legId: "leg-train",
    supplierId: "s-blue-train",
    supplierName: "The Blue Train",
    routeName: "Pretoria → Cape Town",
    unit: "per person sharing",
    paxGroups: CARMEN_GROUPS,
    ...partial,
  })

const hotel = (unitRefs: PricingUnitRef[], suiteTypeName: string) =>
  snapshot({
    supplierKind: "hotel_property",
    legId: "leg-hotel",
    supplierId: "s-one-and-only",
    supplierName: "One&Only Cape Town",
    routeName: "Bed & Breakfast",
    suiteTypeName,
    unit: "per room per night",
    passengerKind: "service",
    travelDate: "2026-08-13",
    stayNights: 2,
    unitRefs,
  })

/** The quote's priced lines (quote_line_items rows), commission line included. */
export function carmenQuoteLines(): SampleLineRow[] {
  return [
    row(
      "The Blue Train — Twin Deluxe Suite - Adult",
      4,
      20_048,
      train({
        suiteTypeName: "Deluxe Suite",
        rateTypeId: "rate-sa",
        unitRefs: [
          ref(0, "u1", { adults: 2 }, ["g1"], "rate-sa"),
          ref(1, "u2", { adults: 1 }, ["g2"], "rate-sa"),
          ref(3, "u4", { adults: 1 }, ["g4"], "rate-sa"),
        ],
      }),
    ),
    row(
      "The Blue Train — Twin Deluxe Suite - Adult",
      2,
      25_136,
      train({
        suiteTypeName: "Deluxe Suite",
        rateTypeId: "rate-tw",
        unitRefs: [ref(1, "u2", { adults: 1 }, ["g2"], "rate-tw"), ref(3, "u4", { adults: 1 }, ["g4"], "rate-tw")],
      }),
    ),
    row(
      "The Blue Train — Twin Deluxe Suite - Child",
      2,
      15_056,
      train({
        suiteTypeName: "Deluxe Suite",
        rateTypeId: "rate-tw",
        passengerKind: "child",
        unitRefs: [ref(2, "u3", { children: 2 }, ["g3"], "rate-tw")],
      }),
    ),
    row(
      "The Blue Train — Twin Deluxe Suite - Child",
      2,
      12_464,
      train({
        suiteTypeName: "Deluxe Suite",
        rateTypeId: "rate-sa",
        passengerKind: "child",
        unitRefs: [ref(4, "u5", { children: 2 }, ["g5"], "rate-sa")],
      }),
    ),
    row(
      "The Blue Train — Double Deluxe Suite - Adult",
      2,
      20_048,
      train({
        suiteTypeName: "Deluxe Suite",
        rateTypeId: "rate-sa",
        unitRefs: [ref(5, "u6", { adults: 2 }, ["g6"], "rate-sa")],
      }),
    ),
    row("One&Only Cape Town — Classic Ocean View Room", 2, 2_400, hotel([ref(0, "h1", { adults: 2 }, ["g1"])], "Classic Ocean View Room")),
    row(
      "One&Only Cape Town — Signature Family Ocean View 2 Bedroom Apartment",
      2,
      5_376,
      hotel([ref(1, "h2", { adults: 2, children: 2 }, ["g2", "g3"])], "Signature Family Ocean View 2 Bedroom Apartment"),
    ),
    row(
      "One&Only Cape Town — Signature Family Ocean View 2 Bedroom Apartment",
      2,
      5_376,
      hotel([ref(2, "h3", { adults: 2, children: 2 }, ["g4", "g5"])], "Signature Family Ocean View 2 Bedroom Apartment"),
    ),
    row("One&Only Cape Town — Classic Ocean View Room", 2, 2_400, hotel([ref(3, "h4", { adults: 2 }, ["g6"])], "Classic Ocean View Room")),
    row(
      "Transfer Cape Town Station to One&Only Cape Town",
      1,
      4_800,
      snapshot({
        supplierKind: "transfers",
        legId: "leg-transfer",
        serviceType: "transfer",
        passengerKind: "service",
        unit: "per vehicle",
        routeName: "Cape Town Station to One&Only Cape Town",
        supplierId: "s-ulysses",
        transportRequestId: "tr-minibus",
        travelDate: "2026-08-13",
      }),
    ),
    row(
      "Transfer One&Only Cape Town to Cape Town International Airport",
      1,
      0,
      snapshot({
        supplierKind: "transfers",
        legId: "leg-transfer",
        serviceType: "transfer",
        passengerKind: "service",
        unit: "per vehicle",
        routeName: "One&Only Cape Town to Cape Town International Airport",
        supplierId: "s-ulysses",
        transportRequestId: "tr-suite6",
        isComplimentaryTransport: true,
        paxGroupIds: ["g6"],
        travelDate: "2026-08-15",
      }),
    ),
    row(
      "Commission",
      1,
      10_896,
      snapshot({
        supplierKind: null,
        legId: null,
        passengerKind: "service",
        commission: { type: "percent" } as PricingSnapshot["commission"],
      }),
    ),
  ]
}

/** The quote's itinerary blocks, carrying the leg and transport-request ids the lines name. */
export function carmenServiceBlocks(): VoucherServiceBlock[] {
  return [
    {
      serviceType: "train",
      title: "The Blue Train",
      supplierId: "s-blue-train",
      legId: "leg-train",
      contactDetails: { name: "The Blue Train" },
      serviceData: {
        route: "Pretoria → Cape Town",
        arrivalStation: "Cape Town",
        departureDate: CARMEN_DEPARTURE,
        arrivalDate: "2026-08-13",
        startTime: "08:50",
        endTime: "15:30",
        durationDays: 3,
        checkInOffsetMinutes: 120,
        itinerarySuiteType: "Deluxe Suite",
        // A train split into pax groups counts each suite with its bed type (buildVoucherServiceBlocks).
        itinerarySuiteCounts: [
          { label: "Twin Deluxe Suite", count: 5 },
          { label: "Double Deluxe Suite", count: 1 },
        ],
        invoiceSuiteCounts: [
          { label: "Twin Deluxe Suite", count: 5 },
          { label: "Double Deluxe Suite", count: 1 },
        ],
        numberOfSuites: 6,
        guestBreakdown: { adults: 8, children: 4, infants: 0 },
        inclusions: ["All meals and beverages on board", "Butler service"],
      },
      displayOrder: 0,
    },
    {
      serviceType: "transfer",
      title: "Transfer",
      supplierId: "s-ulysses",
      legId: "leg-transfer",
      transportRequestId: "tr-minibus",
      contactDetails: { name: "Ulysses Tours & Transfers" },
      serviceData: {
        pickup: "Cape Town Station",
        dropoff: "One&Only Cape Town",
        vehicleType: "Luxury Minibus",
        departureDate: "2026-08-13",
        startTime: "16:00",
        passengerCount: 12,
      },
      displayOrder: 1,
    },
    {
      serviceType: "hotel",
      title: "One&Only Cape Town",
      supplierId: "s-one-and-only",
      legId: "leg-hotel",
      contactDetails: { name: "One&Only Cape Town", location: "Cape Town" },
      serviceData: {
        roomType: "Classic Ocean View Room, Signature Family Ocean View 2 Bedroom Apartment",
        itinerarySuiteCounts: [
          { label: "Classic Ocean View Room", count: 2 },
          { label: "Signature Family Ocean View 2 Bedroom Apartment", count: 2 },
        ],
        numberOfSuites: 4,
        nights: 2,
        mealPlan: "Bed & Breakfast",
        departureDate: "2026-08-13",
        arrivalDate: "2026-08-15",
        startTime: "15:00",
        endTime: "11:00",
      },
      displayOrder: 2,
    },
    {
      serviceType: "transfer",
      title: "Transfer",
      supplierId: "s-ulysses",
      legId: "leg-transfer",
      transportRequestId: "tr-suite6",
      contactDetails: { name: "Ulysses Tours & Transfers" },
      serviceData: {
        pickup: "One&Only Cape Town",
        dropoff: "Cape Town International Airport",
        vehicleType: "Sedan",
        departureDate: "2026-08-15",
        startTime: "11:30",
        passengerCount: 2,
      },
      displayOrder: 3,
    },
  ]
}

/** The Reservation tab's roster, each traveller placed in their suite. */
export function carmenTravellers(): Array<{
  prefix: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  residence: string
  id_passport: string
  is_child: boolean
  pax_group_id: string | null
  sort_order: number
}> {
  const t = (
    sort_order: number,
    pax_group_id: string,
    prefix: string,
    first_name: string,
    last_name: string,
    residence: string,
    id_passport: string,
    date_of_birth: string | null = null,
    is_child = false,
  ) => ({ prefix, first_name, last_name, date_of_birth, residence, id_passport, is_child, pax_group_id, sort_order })
  return [
    t(0, "g1", "Mr", "Wei", "Lin", "ZA", "660101 0000 088"),
    t(1, "g1", "Mrs", "Mei", "Wang", "ZA", "650101 0000 081"),
    t(2, "g2", "Mr", "Jun", "Chen", "ZA", "A00000001", "1978-01-15"),
    t(3, "g2", "Mrs", "Ling", "Tsai", "TW", "300000002", "1981-02-20"),
    t(4, "g3", "Mr", "Hao", "Chen", "TW", "300000003", "2018-07-01", true),
    t(5, "g3", "Ms", "Yun", "Chen", "TW", "300000004", "2016-08-01", true),
    t(6, "g4", "Mr", "Wei", "Lin", "TW", "352118804", "1980-02-11"),
    t(7, "g4", "Mrs", "Mei", "Lin", "ZA", "A10988231", "1982-06-19"),
    t(8, "g5", "Master", "Hao", "Lin", "ZA", "A12773310", "2019-05-02", true),
    t(9, "g5", "Miss", "Ling", "Lin", "ZA", "A12773311", "2019-05-02", true),
    t(10, "g6", "Mr", "Johan", "van der Merwe", "ZA", "700512 5088 083", "1970-05-12"),
    t(11, "g6", "Mrs", "Anke", "van der Merwe", "ZA", "720301 0177 084", "1972-03-01"),
  ]
}

interface UnitFixture {
  suite: string
  bedroom: string | null
  bathroom: string | null
  groups: string[]
  adults?: number
  children?: number
}

function unitRow(sort: number, unit: UnitFixture) {
  return {
    sort_order: sort,
    pax_group_ids: unit.groups,
    adult_count: unit.adults ?? 0,
    child_count: unit.children ?? 0,
    infant_count: 0,
    suite_type_id: `st-${unit.suite}`,
    bedroom_type_id: unit.bedroom ? `bt-${unit.bedroom}` : null,
    suite_types: { name: unit.suite },
    bedroom_types: unit.bedroom ? { name: unit.bedroom } : null,
    bathroom_types: unit.bathroom ? { name: unit.bathroom } : null,
  }
}

/** booking_pax_groups rows and the selected booking_services rows (with units) loadBookingPaxGroups reads. */
export function carmenPaxGroupRows() {
  const twin = (groups: string[], counts: { adults?: number; children?: number }): UnitFixture => ({
    suite: "Deluxe Suite",
    bedroom: "Twin",
    bathroom: "Shower",
    groups,
    ...counts,
  })
  return {
    primarySupplierId: "s-blue-train",
    groupRows: CARMEN_GROUPS.map((group) => ({ id: group.id, position: group.position, label: null })),
    services: [
      {
        id: "leg-train",
        supplier_id: "s-blue-train",
        sort_order: 0,
        service_date: CARMEN_DEPARTURE,
        route_reversed: false,
        suppliers: { kind: "train_operator" },
        routes: { name: "Pretoria → Cape Town", origin: { name: "Pretoria" }, destination: { name: "Cape Town" } },
        units: [
          twin(["g1"], { adults: 2 }),
          twin(["g2"], { adults: 2 }),
          twin(["g3"], { children: 2 }),
          twin(["g4"], { adults: 2 }),
          twin(["g5"], { children: 2 }),
          { suite: "Deluxe Suite", bedroom: "Double", bathroom: "¾ Bath", groups: ["g6"], adults: 2 },
        ].map((unit, index) => unitRow(index, unit)),
      },
      {
        id: "leg-hotel",
        supplier_id: "s-one-and-only",
        sort_order: 2,
        service_date: "2026-08-13",
        route_reversed: false,
        suppliers: { kind: "hotel_property" },
        routes: { name: "Bed & Breakfast", origin: null, destination: null },
        units: [
          { suite: "Classic Ocean View Room", bedroom: null, bathroom: null, groups: ["g1"], adults: 2 },
          { suite: "Signature Family Ocean View 2 Bedroom Apartment", bedroom: null, bathroom: null, groups: ["g2", "g3"], adults: 2, children: 2 },
          { suite: "Signature Family Ocean View 2 Bedroom Apartment", bedroom: null, bathroom: null, groups: ["g4", "g5"], adults: 2, children: 2 },
          { suite: "Classic Ocean View Room", bedroom: null, bathroom: null, groups: ["g6"], adults: 2 },
        ].map((unit, index) => unitRow(index, unit)),
      },
      {
        id: "leg-transfer",
        supplier_id: "s-ulysses",
        sort_order: 1,
        service_date: "2026-08-13",
        route_reversed: false,
        suppliers: { kind: "transfers" },
        routes: null,
        units: [],
      },
    ],
  }
}
