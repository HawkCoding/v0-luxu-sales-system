import { describe, it, expect } from "vitest"
import { revenuePerProduct } from "./revenue-per-product"
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
    booking_number: "BT-2026-0002",
    consultant: "LB",
    departure_date: "2026-09-01",
    stage: "closed",
    outcome: "Won",
    source: "email",
    invoice_balance: 0,
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "b3",
    booking_number: "RR-2026-0001",
    consultant: "CDJ",
    departure_date: "2026-10-01",
    stage: "closed",
    outcome: "Won",
    source: "referral",
    invoice_balance: 0,
    created_at: "2026-04-15T10:00:00Z",
  },
]

const payments: PaymentInputRow[] = [
  { booking_id: "b1", amount: 10000, received_at: "2026-05-01T00:00:00Z" },
  { booking_id: "b2", amount: 8000, received_at: "2026-05-10T00:00:00Z" },
  { booking_id: "b3", amount: 15000, received_at: "2026-05-15T00:00:00Z" },
]

describe("revenuePerProduct", () => {
  it("groups revenue by product prefix", () => {
    const result = revenuePerProduct(bookings, payments, {})
    const bt = result.find((r) => r.product === "BT")
    const rr = result.find((r) => r.product === "RR")

    expect(bt?.revenue).toBe(18000)
    expect(bt?.bookingCount).toBe(2)
    expect(rr?.revenue).toBe(15000)
    expect(rr?.bookingCount).toBe(1)
  })

  it("filters by product", () => {
    const result = revenuePerProduct(bookings, payments, { product: "BT" })
    expect(result).toHaveLength(1)
    expect(result[0].product).toBe("BT")
    expect(result[0].revenue).toBe(18000)
  })

  it("sorts by revenue descending", () => {
    const result = revenuePerProduct(bookings, payments, {})
    expect(result[0].revenue).toBeGreaterThanOrEqual(result[1].revenue)
  })

  it("returns empty for no matching bookings", () => {
    const result = revenuePerProduct(bookings, payments, { consultant: "NOBODY" })
    expect(result).toHaveLength(0)
  })
})
