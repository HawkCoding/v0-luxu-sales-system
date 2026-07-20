import { describe, it, expect } from "vitest"
import { enquiriesBySource } from "./enquiries-by-source"
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
    departure_date: null,
    stage: "enquiry",
    outcome: "Open",
    source: "email",
    invoice_balance: null,
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
    outcome: "Open",
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
    outcome: "Open",
    source: "web_form",
    invoice_balance: null,
    created_at: "2026-05-01T10:00:00Z",
  },
]

describe("enquiriesBySource", () => {
  it("groups bookings by source", () => {
    const result = enquiriesBySource(bookings, {})
    const emailRow = result.find((r) => r.source === "email")
    const referralRow = result.find((r) => r.source === "referral")
    const webFormRow = result.find((r) => r.source === "web_form")

    expect(emailRow?.count).toBe(2)
    expect(referralRow?.count).toBe(1)
    expect(webFormRow?.count).toBe(1)
  })

  it("sorts by count descending", () => {
    const result = enquiriesBySource(bookings, {})
    expect(result[0].count).toBeGreaterThanOrEqual(result[result.length - 1].count)
  })

  it("filters by product", () => {
    const result = enquiriesBySource(bookings, { product: ROVOS })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("email")
    expect(result[0].count).toBe(1)
  })

  it("filters by date range", () => {
    const result = enquiriesBySource(bookings, { from: "2026-05-01", to: "2026-05-31" })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe("web_form")
  })

  it("returns empty for no bookings", () => {
    expect(enquiriesBySource([], {})).toHaveLength(0)
  })
})
