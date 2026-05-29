import { describe, it, expect } from "vitest"
import { conversionRate } from "./conversion-rate"
import type { BookingInputRow } from "./types"

const bookings: BookingInputRow[] = [
  {
    id: "b1",
    booking_number: "BT-2026-0001",
    consultant: "LB",
    departure_date: "2026-08-01",
    stage: "closed",
    outcome: "Won",
    source: "email",
    invoice_balance: 0,
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "b2",
    booking_number: "RR-2026-0001",
    consultant: "LB",
    departure_date: "2026-09-01",
    stage: "quote_sent",
    outcome: "Open",
    source: "web_form",
    invoice_balance: 5000,
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "b3",
    booking_number: "BT-2026-0002",
    consultant: "CDJ",
    departure_date: null,
    stage: "enquiry",
    outcome: "Lost",
    source: "referral",
    invoice_balance: null,
    created_at: "2026-04-15T10:00:00Z",
  },
  {
    id: "b4",
    booking_number: "BT-2026-0003",
    consultant: "CDJ",
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
    const result = conversionRate(bookings, { product: "RR" })
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
