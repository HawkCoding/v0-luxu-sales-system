import { describe, expect, it, vi } from "vitest"
import { withProductSuppliers } from "./product-suppliers"
import type { BookingInputRow } from "./types"

/**
 * Report product attribution.
 *
 * Attribution reads bookings.primary_supplier_id first, so a booking headed by any kind of supplier
 * is counted; the older route -> supplier path stays as a train-only fallback for bookings that
 * predate the column. Before that, a standalone stay was reported as "Unassigned" no matter what,
 * because syncBookingRoute clears route_id on a booking whose "route" is a meal plan -- while the
 * reporting page happily offered the property in its Product filter.
 */

type RouteRow = { id: string; supplier: { id: string; name: string; kind: string } | null }
type SupplierRow = { id: string; name: string }

function supabaseStub(options: { routes?: RouteRow[]; suppliers?: SupplierRow[] } = {}) {
  const queried: string[] = []
  const from = vi.fn((table: string) => {
    queried.push(table)
    const data = table === "suppliers" ? (options.suppliers ?? []) : (options.routes ?? [])
    return { select: () => ({ in: () => Promise.resolve({ data, error: null }) }) }
  })
  return { supabase: { from }, from, queried }
}

function booking(overrides: Partial<BookingInputRow> & { id: string }): BookingInputRow {
  return {
    booking_number: "LTT-2026-0001",
    consultant: "LB",
    assigned_salesperson_id: null,
    route_id: null,
    primary_supplier_id: null,
    departure_date: "2026-08-01",
    stage: "closed",
    outcome: "Won",
    source: "email",
    invoice_balance: 0,
    created_at: "2026-03-01T10:00:00Z",
    ...overrides,
  }
}

const BLUE_TRAIN_ROUTE: RouteRow = {
  id: "r-bt",
  supplier: { id: "sup-bt", name: "The Blue Train", kind: "train_operator" },
}

describe("withProductSuppliers", () => {
  it("resolves an older train booking's product from its route", async () => {
    const { supabase } = supabaseStub({ routes: [BLUE_TRAIN_ROUTE] })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-bt" })],
    )

    expect(row.product_supplier_id).toBe("sup-bt")
    expect(row.product_supplier_name).toBe("The Blue Train")
  })

  it("skips every query when no booking carries a product at all", async () => {
    const { supabase, from } = supabaseStub()

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1" })],
    )

    expect(from).not.toHaveBeenCalled()
    expect(row.product_supplier_id).toBeNull()
    expect(row.product_supplier_name).toBeNull()
  })

  /**
   * The fix. A standalone stay has route_id = null by design, so before this it was reported as
   * Unassigned however it was filtered.
   */
  it("attributes a hotel-primary booking to the property", async () => {
    const { supabase } = supabaseStub({
      suppliers: [{ id: "sup-shalati", name: "Kruger Shalati - Train on the Bridge" }],
    })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", primary_supplier_id: "sup-shalati" })],
    )

    expect(row.product_supplier_id).toBe("sup-shalati")
    expect(row.product_supplier_name).toBe("Kruger Shalati - Train on the Bridge")
  })

  it("attributes a booking headed by any other kind just the same", async () => {
    const { supabase } = supabaseStub({
      suppliers: [{ id: "sup-cruise", name: "Cape Winelands Cruises" }],
    })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", primary_supplier_id: "sup-cruise" })],
    )

    expect(row.product_supplier_id).toBe("sup-cruise")
  })

  // The primary supplier is the product; a route left on the booking is an add-on's, not the thing
  // that was sold.
  it("prefers the primary supplier over the route's supplier", async () => {
    const { supabase } = supabaseStub({
      routes: [BLUE_TRAIN_ROUTE],
      suppliers: [{ id: "sup-shalati", name: "Kruger Shalati - Train on the Bridge" }],
    })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-bt", primary_supplier_id: "sup-shalati" })],
    )

    expect(row.product_supplier_id).toBe("sup-shalati")
  })

  /**
   * The route fallback stays deliberately train-only. On a booking predating primary_supplier_id a
   * leftover route is as likely to belong to a transfer add-on as to the product, and attributing
   * revenue to a transfer company is worse than leaving it unassigned.
   */
  it("keeps the route fallback narrow to train operators", async () => {
    const { supabase } = supabaseStub({
      routes: [{ id: "r-air", supplier: { id: "sup-air", name: "Airlink", kind: "airline" } }],
    })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-air" })],
    )

    expect(row.product_supplier_id).toBeNull()
  })

  it("leaves a booking whose route row is missing unattributed", async () => {
    const { supabase } = supabaseStub({ routes: [{ id: "r-gone", supplier: null }] })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-gone" })],
    )

    expect(row.product_supplier_id).toBeNull()
  })

  it("does not look up routes for bookings that already have a primary supplier", async () => {
    const { supabase, queried } = supabaseStub({
      suppliers: [{ id: "sup-shalati", name: "Kruger Shalati - Train on the Bridge" }],
    })

    await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-bt", primary_supplier_id: "sup-shalati" })],
    )

    expect(queried).toEqual(["suppliers"])
  })

  it("preserves every other field on the booking row", async () => {
    const { supabase } = supabaseStub({ routes: [BLUE_TRAIN_ROUTE] })
    const input = booking({ id: "b1", route_id: "r-bt", booking_number: "LTT-2026-0042", invoice_balance: 1250 })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [input],
    )

    expect(row).toMatchObject({ id: "b1", booking_number: "LTT-2026-0042", invoice_balance: 1250 })
  })
})
