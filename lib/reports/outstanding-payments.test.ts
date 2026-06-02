import { describe, it, expect } from "vitest"
import { outstandingPayments } from "./outstanding-payments"
import type { BookingInputRow } from "./types"

const bookings: BookingInputRow[] = [
  {
    id: "b1",
    booking_number: "BT-2026-0001",
    consultant: "LB",
    assigned_salesperson_id: "u-lb",
    owner_name: "Leonie",
    departure_date: "2026-08-01",
    stage: "deposit_paid",
    outcome: "Open",
    source: "email",
    invoice_balance: 12000,
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "b2",
    booking_number: "RR-2026-0001",
    consultant: "CDJ",
    assigned_salesperson_id: "u-cdj",
    owner_name: "Carmen",
    departure_date: "2026-09-01",
    stage: "closed",
    outcome: "Won",
    source: "referral",
    invoice_balance: 0,
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "b3",
    booking_number: "BT-2026-0002",
    consultant: null,
    assigned_salesperson_id: null,
    owner_name: null,
    departure_date: null,
    stage: "lost",
    outcome: "Lost",
    source: "email",
    invoice_balance: 5000,
    created_at: "2026-04-15T10:00:00Z",
  },
  {
    id: "b4",
    booking_number: "BT-2026-0003",
    consultant: "LB",
    assigned_salesperson_id: "u-lb",
    owner_name: "Leonie",
    departure_date: "2026-10-01",
    stage: "final_paid",
    outcome: "Open",
    source: "web_form",
    invoice_balance: 8000,
    created_at: "2026-05-01T10:00:00Z",
  },
]

describe("outstandingPayments", () => {
  it("returns only active bookings with positive balance", () => {
    const result = outstandingPayments(bookings, {})
    // b1 (deposit_paid, balance 12000) and b4 (final_paid, balance 8000)
    // b2 is closed with 0 balance, b3 is lost
    const ids = result.map((r) => r.bookingId)
    expect(ids).toContain("b1")
    expect(ids).toContain("b4")
    expect(ids).not.toContain("b2")
    expect(ids).not.toContain("b3")
  })

  it("excludes closed and lost bookings even if they have a balance", () => {
    const result = outstandingPayments(bookings, {})
    expect(result.find((r) => r.bookingId === "b3")).toBeUndefined()
  })

  it("sorts by balance descending", () => {
    const result = outstandingPayments(bookings, {})
    expect(result[0].balance).toBeGreaterThanOrEqual(result[1].balance)
  })

  it("filters by owner (assigned salesperson id)", () => {
    const result = outstandingPayments(bookings, { consultant: "u-lb" })
    expect(result.every((r) => r.consultant === "Leonie")).toBe(true)
  })

  it("filters by product", () => {
    const result = outstandingPayments(bookings, { product: "RR" })
    expect(result).toHaveLength(0) // RR booking is closed
  })
})
