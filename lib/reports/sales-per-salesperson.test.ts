import { describe, it, expect } from "vitest"
import { salesPerSalesperson } from "./sales-per-salesperson"
import type { BookingInputRow, PaymentInputRow } from "./types"

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
    departure_date: "2026-10-01",
    stage: "closed",
    outcome: "Won",
    source: "referral",
    invoice_balance: 0,
    created_at: "2026-04-15T10:00:00Z",
  },
  {
    id: "b4",
    booking_number: "BT-2026-0003",
    consultant: null,
    departure_date: null,
    stage: "enquiry",
    outcome: "Open",
    source: "email",
    invoice_balance: null,
    created_at: "2026-05-01T10:00:00Z",
  },
]

const payments: PaymentInputRow[] = [
  { booking_id: "b1", amount: 10000, received_at: "2026-05-01T00:00:00Z" },
  { booking_id: "b2", amount: 3000, received_at: "2026-05-10T00:00:00Z" },
  { booking_id: "b3", amount: 8000, received_at: "2026-05-15T00:00:00Z" },
]

describe("salesPerSalesperson", () => {
  it("groups bookings and revenue by consultant", () => {
    const result = salesPerSalesperson(bookings, payments, {})
    const lb = result.find((r) => r.consultant === "LB")
    const cdj = result.find((r) => r.consultant === "CDJ")
    const unassigned = result.find((r) => r.consultant === "Unassigned")

    expect(lb?.bookingCount).toBe(2)
    expect(lb?.revenue).toBe(13000)
    expect(lb?.wonCount).toBe(1)

    expect(cdj?.bookingCount).toBe(1)
    expect(cdj?.revenue).toBe(8000)
    expect(cdj?.wonCount).toBe(1)

    expect(unassigned?.bookingCount).toBe(1)
    expect(unassigned?.revenue).toBe(0)
    expect(unassigned?.wonCount).toBe(0)
  })

  it("filters by consultant", () => {
    const result = salesPerSalesperson(bookings, payments, { consultant: "CDJ" })
    expect(result).toHaveLength(1)
    expect(result[0].consultant).toBe("CDJ")
  })

  it("filters by product", () => {
    const result = salesPerSalesperson(bookings, payments, { product: "RR" })
    expect(result).toHaveLength(1)
    expect(result[0].consultant).toBe("LB")
    expect(result[0].bookingCount).toBe(1)
  })

  it("filters by date range", () => {
    const result = salesPerSalesperson(bookings, payments, { from: "2026-04-01", to: "2026-04-30" })
    // b2 (2026-04-01) and b3 (2026-04-15) match
    const total = result.reduce((s, r) => s + r.bookingCount, 0)
    expect(total).toBe(2)
  })

  it("returns empty when no bookings match filter", () => {
    const result = salesPerSalesperson(bookings, payments, { consultant: "NOBODY" })
    expect(result).toHaveLength(0)
  })

  it("sorts by revenue descending", () => {
    const result = salesPerSalesperson(bookings, payments, {})
    expect(result[0].revenue).toBeGreaterThanOrEqual(result[1].revenue)
  })
})
