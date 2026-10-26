import { describe, expect, it } from "vitest"
import { buildSectionRows, formatSentLabel, type SectionSourceData } from "./job-section-rows"

// 10:00 SAST on 21 Oct 2026.
const NOW = new Date("2026-10-21T08:00:00.000Z")

function booking(id: string, stage: string, extra: Partial<SectionSourceData["bookings"][number]> = {}) {
  return {
    id,
    bookingNumber: `LTT-26-${id}`,
    customerId: "cust-1",
    stage,
    createdAt: "2026-10-01T08:00:00.000Z",
    ...extra,
  }
}

const customers = [{ id: "cust-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }]

describe("buildSectionRows", () => {
  it("splits records between Quotes and Bookings by stage and drops enquiries and lost", () => {
    const data: SectionSourceData = {
      bookings: [
        booking("0001", "enquiry"),
        booking("0002", "quoted"),
        booking("0003", "payment_schedule", { depositPaid: true }),
        booking("0004", "deposit_paid"),
        booking("0005", "trip_active"),
        booking("0006", "lost"),
      ],
      customers,
    }

    expect(buildSectionRows(data, "quotes", NOW).map((row) => row.id)).toEqual(["0002", "0003"])
    expect(buildSectionRows(data, "bookings", NOW).map((row) => row.id)).toEqual(["0004", "0005"])
  })

  it("totals the current quote, not every quote on the record", () => {
    const data: SectionSourceData = {
      bookings: [booking("0001", "deposit_paid")],
      customers,
      quotes: [
        { id: "q1", bookingId: "0001", status: "superseded", total: 90_000, currency: "ZAR" },
        { id: "q2", bookingId: "0001", status: "accepted", total: 100_000, currency: "USD", lastSentAt: "2026-10-12T09:00:00.000Z" },
        { id: "q3", bookingId: "0001", status: "draft", total: 120_000, currency: "ZAR" },
      ],
      payments: [
        { bookingId: "0001", amount: 25_000 },
        { bookingId: "0001", amount: 10_000.1 },
        { bookingId: "other", amount: 999 },
      ],
    }

    const [row] = buildSectionRows(data, "bookings", NOW)
    expect(row?.quoteTotal).toBe(100_000)
    expect(row?.currency).toBe("USD")
    expect(row?.totalPaid).toBe(35_000.1)
    expect(row?.balance).toBe(64_999.9)
    expect(row?.paymentStatus).toBe("deposit_paid")
  })

  it("clamps the balance at zero and leaves it empty without a quote", () => {
    const data: SectionSourceData = {
      bookings: [booking("0001", "final_paid"), booking("0002", "quote_sent")],
      customers,
      quotes: [{ id: "q1", bookingId: "0001", status: "accepted", total: 1_000 }],
      payments: [{ bookingId: "0001", amount: 1_200 }],
    }

    const [paid] = buildSectionRows(data, "bookings", NOW)
    const [unpriced] = buildSectionRows(data, "quotes", NOW)
    expect(paid?.balance).toBe(0)
    expect(paid?.currency).toBe("ZAR")
    expect(unpriced?.quoteTotal).toBeNull()
    expect(unpriced?.balance).toBeNull()
  })

  it("shows trip_active as paid in full under its canonical stage", () => {
    const [row] = buildSectionRows({ bookings: [booking("0001", "trip_active")], customers }, "bookings", NOW)
    expect(row?.paymentStatus).toBe("paid_in_full")
    expect(row?.canonicalStage).toBe("voucher_sent")
    expect(row?.stageLabel).toBe("Voucher Sent")
    expect(row?.href).toBe("/app/bookings/0001")
  })

  it("hints to move a paid deposit request on without moving it to Bookings", () => {
    const data: SectionSourceData = {
      bookings: [booking("0001", "deposit_requested", { depositPaid: true }), booking("0002", "deposit_requested")],
      customers,
      payments: [{ bookingId: "0001", amount: 5_000 }],
    }

    const rows = buildSectionRows(data, "quotes", NOW)
    expect(rows.map((row) => row.nextStep)).toEqual([
      "Payment received — move to Deposit Paid",
      "Waiting for the deposit",
    ])
    expect(rows[0]?.href).toBe("/app/quotes/0001")
    expect(buildSectionRows(data, "bookings", NOW)).toEqual([])
  })

  it("dates the row from the current quote's send, falling back to the booking's", () => {
    const data: SectionSourceData = {
      bookings: [
        booking("0001", "quote_sent"),
        booking("0002", "quote_sent", { quoteSentAt: "2026-10-20T09:00:00.000Z" }),
        booking("0003", "quote_sent"),
      ],
      customers,
      quotes: [{ id: "q1", bookingId: "0001", status: "sent", total: 10, lastSentAt: "2026-10-12T09:00:00.000Z" }],
    }

    expect(buildSectionRows(data, "quotes", NOW).map((row) => row.sentLabel)).toEqual([
      "Sent 12 Oct · 9 days ago",
      "Sent 20 Oct · yesterday",
      null,
    ])
  })

  it("names unknown customers and trims supplier names", () => {
    const [row] = buildSectionRows(
      { bookings: [booking("0001", "accepted", { customerId: "missing", supplierName: "  " })], customers },
      "quotes",
      NOW,
    )
    expect(row?.customerName).toBe("Unknown")
    expect(row?.customerEmail).toBe("")
    expect(row?.supplier).toBeNull()
    expect(row?.nextStep).toBe("Send the deposit invoice")
  })
})

describe("formatSentLabel", () => {
  it("counts South African calendar days", () => {
    // 23:30 SAST on the 20th is still "yesterday" at 10:00 SAST on the 21st.
    expect(formatSentLabel("2026-10-20T21:30:00.000Z", NOW)).toBe("Sent 20 Oct · yesterday")
    expect(formatSentLabel("2026-10-21T06:00:00.000Z", NOW)).toBe("Sent 21 Oct · today")
  })

  it("keeps the year for an older send", () => {
    expect(formatSentLabel("2025-12-30T09:00:00.000Z", NOW)).toBe("Sent 30 Dec 2025 · 295 days ago")
  })

  it("returns null without a send date", () => {
    expect(formatSentLabel(null, NOW)).toBeNull()
    expect(formatSentLabel("not a date", NOW)).toBeNull()
  })
})
