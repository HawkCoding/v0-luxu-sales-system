import { describe, it, expect } from "vitest"
import { conversionRate } from "./conversion-rate"
import type { BookingInputRow } from "./types"

const BLUE_TRAIN = "00000000-0000-0000-0000-0000000000bt"
const ROVOS = "00000000-0000-0000-0000-0000000000rr"

const bookings: BookingInputRow[] = [
  {
    id: "b1",
    booking_number: "LTT-2026-0001",
    route_id: "r-bt",
    product_supplier_id: BLUE_TRAIN,
    product_supplier_name: "Blue Train",
    consultant: "LB",
    assigned_salesperson_id: "u-lb",
    owner_name: "Leonie",
    departure_date: "2026-08-01",
    stage: "closed",
    outcome: "Won",
    source: "email",
    invoice_balance: 0,
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "b2",
    booking_number: "LTT-2026-0002",
    route_id: "r-rr",
    product_supplier_id: ROVOS,
    product_supplier_name: "Rovos Rail",
    consultant: "LB",
    assigned_salesperson_id: "u-lb",
    owner_name: "Leonie",
    departure_date: "2026-09-01",
    stage: "quote_sent",
    outcome: "Open",
    source: "web_form",
    invoice_balance: 5000,
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "b3",
    booking_number: "LTT-2026-0003",
    route_id: "r-bt",
    product_supplier_id: BLUE_TRAIN,
    product_supplier_name: "Blue Train",
    consultant: "CDJ",
    assigned_salesperson_id: "u-cdj",
    owner_name: "Carmen",
    departure_date: null,
    stage: "enquiry",
    outcome: "Lost",
    source: "referral",
    invoice_balance: null,
    created_at: "2026-04-15T10:00:00Z",
  },
  {
    id: "b4",
    booking_number: "LTT-2026-0004",
    route_id: "r-bt",
    product_supplier_id: BLUE_TRAIN,
    product_supplier_name: "Blue Train",
    consultant: "CDJ",
    assigned_salesperson_id: "u-cdj",
    owner_name: "Carmen",
    departure_date: null,
    stage: "enquiry",
    outcome: "Cancelled",
    source: "email",
    invoice_balance: null,
    created_at: "2026-05-01T10:00:00Z",
  },
]

describe("conversionRate", () => {
  it("counts won, lost, cancelled correctly", () => {
    const result = conversionRate(bookings, {})
    expect(result.total).toBe(4)
    expect(result.won).toBe(1)
    expect(result.lost).toBe(1)
    expect(result.cancelled).toBe(1)
    expect(result.rate).toBe(0.25)
  })

  it("returns rate 0 when no bookings", () => {
    const result = conversionRate([], {})
    expect(result.rate).toBe(0)
    expect(result.total).toBe(0)
  })

  it("filters by product", () => {
    const result = conversionRate(bookings, { product: ROVOS })
    expect(result.total).toBe(1)
    expect(result.won).toBe(0)
  })

  it("filters by date range — narrows to only matching bookings", () => {
    const result = conversionRate(bookings, { from: "2026-03-01", to: "2026-03-31" })
    expect(result.total).toBe(1)
    expect(result.won).toBe(1)
    expect(result.rate).toBe(1)
  })
})
