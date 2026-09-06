import { describe, expect, it } from "vitest"
import { MANUAL_OVERRIDE_UNIT_COLUMNS, SERVICES_WITH_SUPPLIER_SELECT, SERVICES_WITH_UNITS_SELECT } from "./service-columns"

describe("SERVICES_WITH_UNITS_SELECT", () => {
  // F-P1-3: manual_tour_price/manual_tour_price_set_at were written by
  // app/api/jobs/[id]/services/route.ts's PATCH handler (the unitRows insert) but silently absent
  // from this select, so a tour leg's override never survived reopening Build Booking -- the panel
  // collapsed to "No rate card price for this tour yet" and apply then 400'd on the missing rate
  // card. Nothing caught it: the row type declared the fields optional, and the route test's mock
  // harness returns fixture rows verbatim rather than filtering by the select string, so it can't
  // see a column go missing here. This is the one place that actually can.
  it.each(MANUAL_OVERRIDE_UNIT_COLUMNS)("selects the %s override column", (column) => {
    expect(SERVICES_WITH_UNITS_SELECT).toContain(column)
  })

  it("selects the units join at all", () => {
    expect(SERVICES_WITH_UNITS_SELECT).toContain("units:booking_service_units(")
  })

  it("keeps SERVICES_WITH_SUPPLIER_SELECT in sync (it only appends the supplier join)", () => {
    expect(SERVICES_WITH_SUPPLIER_SELECT).toBe(`${SERVICES_WITH_UNITS_SELECT}, suppliers(name, kind)`)
  })
})
