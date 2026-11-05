import { describe, expect, it } from "vitest"
import { canonicalJson, computeContentFingerprint, contentOf, fingerprintOf } from "./content-fingerprint"

type Row = Record<string, unknown>

interface Fixture {
  bookings: Row[]
  travellers: Row[]
  booking_pax_groups: Row[]
  booking_services: Row[]
  booking_service_units: Row[]
  booking_transport_requests: Row[]
  booking_vehicle_rental_details: Row[]
  quotes: Row[]
  quote_line_items: Row[]
  invoices: Row[]
  failTable?: string
}

function baseFixture(): Fixture {
  return {
    bookings: [
      {
        departure_date: "2026-12-01",
        duration_nights: 3,
        no_of_adults: 2,
        no_of_children: 0,
        customer_invoice_number: "244453",
        customer: { first_name: "Ada", last_name: "Lovelace" },
      },
    ],
    travellers: [
      { id: "t1", booking_id: "b1", first_name: "Ada", last_name: "Lovelace", sort_order: 0, created_at: "2026-10-01" },
      { id: "t2", booking_id: "b1", first_name: "Charles", last_name: "Babbage", sort_order: 1, created_at: "2026-10-01" },
    ],
    booking_pax_groups: [],
    booking_services: [
      {
        id: "s1",
        booking_id: "b1",
        supplier_id: "sup-1",
        service_date: "2026-12-01",
        nights: 3,
        notes: "Window seat please",
        supplier_reference: "REF-1",
        confirmation_date: "2026-11-01",
        paid_with: "card",
        updated_at: "2026-11-01T10:00:00Z",
      },
    ],
    booking_service_units: [
      { id: "u1", service_id: "s1", adult_count: 2, child_count: 0, fare_override_set_at: "2026-11-01" },
    ],
    booking_transport_requests: [
      { id: "r1", booking_id: "b1", pickup_point: "Airport", dropoff_point: "Hotel", supplier_reference: "TR-1" },
    ],
    booking_vehicle_rental_details: [],
    quotes: [{ id: "q1", subtotal: 1000, total: 900, currency: "ZAR" }],
    quote_line_items: [
      { description: "Rovos Rail", qty: 2, unit_price: 450, total: 900, sort_order: 0 },
    ],
    invoices: [{ id: "inv1", amount: 225, currency: "ZAR", due_date: "2026-12-04", deposit_percentage: 25, kind: "deposit", quote_id: "q1" }],
  }
}

function fakeClient(fixture: Fixture) {
  return {
    from(table: string) {
      const result = () => {
        if (fixture.failTable === table) return { data: null, error: { message: "boom" } }
        const data = (fixture as unknown as Record<string, Row[]>)[table]
        if (!data) throw new Error(`Unexpected table ${table}`)
        return { data, error: null }
      }
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq", "in", "order", "limit"]) chain[method] = () => chain
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return chain
    },
  } as never
}

async function fingerprint(
  fixture: Fixture,
  docType: "quote" | "invoice" | "voucher" = "quote",
): Promise<string> {
  return computeContentFingerprint(fakeClient(fixture), {
    bookingId: "b1",
    docType,
    quoteId: "q1",
    invoiceId: "inv1",
  })
}

describe("canonicalJson", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
  })

  it("keeps array order, because it is content", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })
})

describe("contentOf", () => {
  it("drops ids, timestamps, provenance and empty values", () => {
    expect(
      contentOf(
        { id: "x", created_at: "t", updated_at: "t", price_override_set_by: "u", note: "", dates: [], kept: "yes", zero: 0 },
        "quote",
      ),
    ).toEqual({ kept: "yes", zero: 0 })
  })

  it("keeps supplier references and notes for a voucher only", () => {
    const row = { supplier_reference: "REF", notes: "n", voucher_footnote: "f", nights: 2 }
    expect(contentOf(row, "voucher")).toEqual(row)
    expect(contentOf(row, "quote")).toEqual({ nights: 2 })
    expect(contentOf(row, "invoice")).toEqual({ nights: 2 })
  })

  it("never keeps supplier payment admin", () => {
    expect(contentOf({ booking_date: "d", confirmation_date: "d", payment_made_date: "d", paid_with: "card" }, "voucher")).toEqual(
      {},
    )
  })
})

describe("computeContentFingerprint", () => {
  it("is stable when ids, timestamps and row order change but the content does not", async () => {
    const before = await fingerprint(baseFixture())

    const after = baseFixture()
    after.travellers = [...after.travellers].reverse().map((t, i) => ({ ...t, id: `new-${i}`, created_at: "2027-01-01" }))
    after.booking_services = after.booking_services.map((s) => ({ ...s, id: "s-new", updated_at: "2027-01-01T00:00:00Z" }))
    after.booking_service_units = after.booking_service_units.map((u) => ({ ...u, id: "u-new", service_id: "s-new" }))
    expect(await fingerprint(after)).toBe(before)
  })

  it("changes when the dates, guests, units or prices change", async () => {
    const before = await fingerprint(baseFixture())

    const moved = baseFixture()
    moved.booking_services[0].service_date = "2026-12-05"
    expect(await fingerprint(moved)).not.toBe(before)

    const departure = baseFixture()
    departure.bookings[0].departure_date = "2026-12-05"
    expect(await fingerprint(departure)).not.toBe(before)

    const guest = baseFixture()
    guest.travellers.push({ id: "t3", first_name: "Grace", last_name: "Hopper", sort_order: 2 })
    expect(await fingerprint(guest)).not.toBe(before)

    const units = baseFixture()
    units.booking_service_units[0].adult_count = 3
    expect(await fingerprint(units)).not.toBe(before)

    const price = baseFixture()
    price.quote_line_items[0].unit_price = 500
    expect(await fingerprint(price)).not.toBe(before)

    const total = baseFixture()
    total.quotes[0].total = 800
    expect(await fingerprint(total)).not.toBe(before)
  })

  it("does not flag supplier admin or provenance changes", async () => {
    const before = await fingerprint(baseFixture(), "voucher")
    const after = baseFixture()
    after.booking_services[0].confirmation_date = "2026-11-20"
    after.booking_services[0].paid_with = "eft"
    after.booking_service_units[0].fare_override_set_at = "2026-11-30"
    expect(await fingerprint(after, "voucher")).toBe(before)
  })

  it("flags a supplier reference change on the voucher but not on the quote or invoice", async () => {
    const edited = baseFixture()
    edited.booking_services[0].supplier_reference = "REF-2"
    edited.booking_transport_requests[0].supplier_reference = "TR-2"

    expect(await fingerprint(edited, "voucher")).not.toBe(await fingerprint(baseFixture(), "voucher"))
    expect(await fingerprint(edited, "quote")).toBe(await fingerprint(baseFixture(), "quote"))
    expect(await fingerprint(edited, "invoice")).toBe(await fingerprint(baseFixture(), "invoice"))
  })

  it("gives each document type its own fingerprint", async () => {
    const fingerprints = await Promise.all([
      fingerprint(baseFixture(), "quote"),
      fingerprint(baseFixture(), "invoice"),
      fingerprint(baseFixture(), "voucher"),
    ])
    expect(new Set(fingerprints).size).toBe(3)
  })

  it("flags an invoice amount or due date change", async () => {
    const before = await fingerprint(baseFixture(), "invoice")
    const amount = baseFixture()
    amount.invoices[0].amount = 300
    expect(await fingerprint(amount, "invoice")).not.toBe(before)
    const due = baseFixture()
    due.invoices[0].due_date = "2026-12-10"
    expect(await fingerprint(due, "invoice")).not.toBe(before)
  })

  it("throws when the booking data cannot be read, so callers can treat it as unknown", async () => {
    const broken = baseFixture()
    broken.failTable = "travellers"
    await expect(fingerprint(broken)).rejects.toThrow(/travellers/)
  })
})

describe("fingerprintOf", () => {
  it("is a 64-character hex digest", () => {
    expect(fingerprintOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
})
