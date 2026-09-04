import { describe, expect, it, vi } from "vitest"
import { withProductSuppliers } from "./product-suppliers"
import type { BookingInputRow } from "./types"

/**
 * Characterization tests for report product attribution.
 *
 * Reporting resolves a booking's product through bookings.route_id -> routes.supplier_id, and
 * counts it only when that supplier is a train operator. Both halves break for a primary product of
 * any other kind: a standalone stay has route_id = null by design (syncBookingRoute clears it), so
 * it never reaches the kind filter at all. The reporting page meanwhile already offers every
 * sells_standalone supplier in its Product picker, so those suppliers can be selected and return
 * nothing.
 *
 * Today's behaviour is frozen here; the phase that moves attribution onto
 * bookings.primary_supplier_id updates the two cases marked "today:".
 */

type RouteRow = { id: string; supplier: { id: string; name: string; kind: string } | null }

function supabaseStub(routes: RouteRow[]) {
  const inFilter = vi.fn().mockResolvedValue({ data: routes, error: null })
  const select = vi.fn().mockReturnValue({ in: inFilter })
  const from = vi.fn().mockReturnValue({ select })
  return { supabase: { from }, from, select, inFilter }
}

function booking(overrides: Partial<BookingInputRow> & { id: string }): BookingInputRow {
  return {
    booking_number: "LTT-2026-0001",
    consultant: "LB",
    assigned_salesperson_id: null,
    route_id: null,
    departure_date: "2026-08-01",
    stage: "closed",
    outcome: "Won",
    source: "email",
    invoice_balance: 0,
    created_at: "2026-03-01T10:00:00Z",
    ...overrides,
  }
}

describe("withProductSuppliers", () => {
  it("resolves a train booking's product from its route", async () => {
    const { supabase } = supabaseStub([
      { id: "r-bt", supplier: { id: "sup-bt", name: "The Blue Train", kind: "train_operator" } },
    ])

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-bt" })],
    )

    expect(row.product_supplier_id).toBe("sup-bt")
    expect(row.product_supplier_name).toBe("The Blue Train")
  })

  it("skips the query entirely when no booking carries a route", async () => {
    const { supabase, from } = supabaseStub([])

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: null })],
    )

    expect(from).not.toHaveBeenCalled()
    expect(row.product_supplier_id).toBeNull()
    expect(row.product_supplier_name).toBeNull()
  })

  // today: a standalone stay has no route at all, so it is attributed to nothing and the reporting
  // page's Product filter returns no rows for the property the booking was actually sold on.
  it("today: a hotel-primary booking resolves to no product", async () => {
    const { supabase } = supabaseStub([])

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: null })],
    )

    expect(row.product_supplier_id).toBeNull()
  })

  // today: even when a non-train supplier's route IS on the booking, the kind filter drops it.
  it("today: a non-train route supplier is filtered out", async () => {
    const { supabase } = supabaseStub([
      { id: "r-air", supplier: { id: "sup-air", name: "Airlink", kind: "airline" } },
    ])

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-air" })],
    )

    expect(row.product_supplier_id).toBeNull()
  })

  it("leaves a booking whose route row is missing unattributed", async () => {
    const { supabase } = supabaseStub([{ id: "r-gone", supplier: null }])

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [booking({ id: "b1", route_id: "r-gone" })],
    )

    expect(row.product_supplier_id).toBeNull()
  })

  it("preserves every other field on the booking row", async () => {
    const { supabase } = supabaseStub([
      { id: "r-bt", supplier: { id: "sup-bt", name: "The Blue Train", kind: "train_operator" } },
    ])
    const input = booking({ id: "b1", route_id: "r-bt", booking_number: "LTT-2026-0042", invoice_balance: 1250 })

    const [row] = await withProductSuppliers(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      [input],
    )

    expect(row).toMatchObject({ id: "b1", booking_number: "LTT-2026-0042", invoice_balance: 1250 })
  })
})
