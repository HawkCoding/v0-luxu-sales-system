import { describe, expect, it } from "vitest"
import { emptyStayTokens, loadStayTokens } from "./stay-tokens"

const SHALATI_ID = "00000000-0000-4000-8000-000000000a01"
const ANOTHER_HOTEL_ID = "00000000-0000-4000-8000-000000000a02"
const ROVOS_ID = "00000000-0000-4000-8000-000000000b01"

interface LegFixture {
  id: string
  sort_order: number | null
  service_date: string | null
  nights: number | null
  supplier_id: string | null
  route: { name: string | null } | null
  supplier: {
    name: string | null
    kind: string | null
    location: string | null
    street_address: string | null
    default_time_start: string | null
    default_time_end: string | null
  } | null
}

function shalatiLeg(overrides: Partial<LegFixture> = {}): LegFixture {
  return {
    id: "leg-shalati",
    sort_order: 1,
    service_date: "2026-05-05",
    nights: 3,
    supplier_id: SHALATI_ID,
    route: { name: "All-inclusive" },
    supplier: {
      name: "Kruger Shalati - Train on the Bridge",
      kind: "hotel_property",
      location: "Kruger National Park",
      street_address: "Selati Station & Bridge, Skukuza Rest Camp",
      default_time_start: "14:00",
      default_time_end: "11:00",
    },
    ...overrides,
  }
}

function rovosLeg(overrides: Partial<LegFixture> = {}): LegFixture {
  return {
    id: "leg-rovos",
    sort_order: 0,
    service_date: "2026-05-10",
    nights: null,
    supplier_id: ROVOS_ID,
    route: { name: "Pretoria → Cape Town" },
    supplier: {
      name: "Rovos Rail",
      kind: "train_operator",
      location: "Pretoria",
      street_address: "Rovos Rail Station",
      default_time_start: "09:00",
      default_time_end: "15:00",
    },
    ...overrides,
  }
}

/**
 * Stand-in for the two chains loadStayTokens builds: the selected booking_services legs, and the
 * app_settings lookup getHotelDefaultTimes makes for the fallback check-in/check-out times.
 */
function makeSupabase(legs: LegFixture[], options: { legsError?: boolean } = {}) {
  return {
    from(table: string) {
      if (table === "booking_services") {
        // Thenable so any number of chained .eq() calls can be awaited at the end.
        const result = options.legsError
          ? { data: null, error: new Error("boom") }
          : { data: legs, error: null }
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
        }
        return builder
      }
      if (table === "app_settings") {
        const builder = {
          select: () => builder,
          in: async () => ({
            data: [
              { key: "hotel_default_check_in_time", value: "15:00" },
              { key: "hotel_default_check_out_time", value: "10:00" },
            ],
            error: null,
          }),
        }
        return builder
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe("loadStayTokens", () => {
  it("describes a standalone Kruger Shalati stay", async () => {
    const tokens = await loadStayTokens(makeSupabase([shalatiLeg()]) as never, "booking-1", SHALATI_ID, null)

    expect(tokens).toEqual({
      checkInDate: "05 May 2026",
      checkOutDate: "08 May 2026",
      nights: "3",
      mealPlan: "All-inclusive",
      propertyName: "Kruger Shalati - Train on the Bridge",
      propertyLocation: "Kruger National Park",
      propertyAddress: "Selati Station & Bridge, Skukuza Rest Camp",
      checkInTime: "14h00",
      checkOutTime: "11h00",
    })
  })

  // nights is the captured fact; check-out is derived so the two can never disagree.
  it("derives check-out from the night count, not a stored column", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([shalatiLeg({ service_date: "2026-12-30", nights: 4 })]) as never,
      "booking-1",
      SHALATI_ID,
      null,
    )
    expect(tokens.checkOutDate).toBe("03 January 2027")
  })

  it("falls back to the booking's own night count when the leg has none", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([shalatiLeg({ nights: null })]) as never,
      "booking-1",
      SHALATI_ID,
      2,
    )
    expect(tokens.nights).toBe("2")
    expect(tokens.checkOutDate).toBe("07 May 2026")
  })

  it("leaves check-out empty when there is no night count anywhere", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([shalatiLeg({ nights: null })]) as never,
      "booking-1",
      SHALATI_ID,
      null,
    )
    expect(tokens.nights).toBe("")
    expect(tokens.checkOutDate).toBe("")
    expect(tokens.checkInDate).toBe("05 May 2026")
  })

  it("returns nothing for a rail-only booking, so the send degrades to a missing line", async () => {
    const tokens = await loadStayTokens(makeSupabase([rovosLeg()]) as never, "booking-1", ROVOS_ID, 3)
    expect(tokens).toEqual(emptyStayTokens())
  })

  // A Rovos booking with a pre-night hotel: the stay tokens name the hotel, while supplierName
  // (resolved elsewhere) still names the train.
  it("picks the hotel leg on a mixed rail + hotel booking", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([rovosLeg(), shalatiLeg({ supplier_id: ANOTHER_HOTEL_ID })]) as never,
      "booking-1",
      ROVOS_ID,
      null,
    )
    expect(tokens.propertyName).toBe("Kruger Shalati - Train on the Bridge")
    expect(tokens.checkInDate).toBe("05 May 2026")
  })

  it("prefers the primary supplier's own hotel leg over another hotel on the booking", async () => {
    const other = shalatiLeg({
      id: "leg-other",
      sort_order: 0,
      supplier_id: ANOTHER_HOTEL_ID,
      service_date: "2026-05-01",
      supplier: {
        name: "Protea Hotel",
        kind: "hotel_property",
        location: "Nelspruit",
        street_address: "1 Main Road",
        default_time_start: "14:00",
        default_time_end: "10:00",
      },
    })
    const tokens = await loadStayTokens(
      makeSupabase([other, shalatiLeg()]) as never,
      "booking-1",
      SHALATI_ID,
      null,
    )
    expect(tokens.propertyName).toBe("Kruger Shalati - Train on the Bridge")
    expect(tokens.checkInDate).toBe("05 May 2026")
  })

  it("falls back to the app-wide times when the property sets none of its own", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([
        shalatiLeg({
          supplier: {
            name: "Kruger Shalati - Train on the Bridge",
            kind: "hotel_property",
            location: null,
            street_address: null,
            default_time_start: null,
            default_time_end: null,
          },
        }),
      ]) as never,
      "booking-1",
      SHALATI_ID,
      null,
    )
    expect(tokens.checkInTime).toBe("15h00")
    expect(tokens.checkOutTime).toBe("10h00")
    expect(tokens.propertyLocation).toBe("")
    expect(tokens.propertyAddress).toBe("")
  })

  // A hotel supplier's "route" is its meal plan; an unset one must not leak an empty label.
  it("leaves the meal plan empty when the leg has no route", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([shalatiLeg({ route: null })]) as never,
      "booking-1",
      SHALATI_ID,
      null,
    )
    expect(tokens.mealPlan).toBe("")
  })

  it("degrades to empties rather than throwing when the query fails", async () => {
    const tokens = await loadStayTokens(
      makeSupabase([shalatiLeg()], { legsError: true }) as never,
      "booking-1",
      SHALATI_ID,
      null,
    )
    expect(tokens).toEqual(emptyStayTokens())
  })
})
