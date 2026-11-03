import { describe, expect, it, vi } from "vitest"
import {
  buildAvailabilityHtml,
  buildAvailabilitySentence,
  buildBookingPaxGroupsView,
  buildGuestHeadings,
  loadBookingPaxGroups,
  numberTravellersByPaxGroup,
  type BookingPaxGroupsView,
  type PaxGroupServiceRow,
} from "@/lib/pax-groups/booking-pax-groups"
import { carmenPaxGroupRows } from "@/lib/pax-groups/carmen-sample.fixtures"

function carmenView(): BookingPaxGroupsView {
  const { groupRows, services, primarySupplierId } = carmenPaxGroupRows()
  const view = buildBookingPaxGroupsView(groupRows, services, primarySupplierId)
  if (!view) throw new Error("expected a view")
  return view
}

describe("buildBookingPaxGroupsView", () => {
  it("names each group off its own primary unit, in position order", () => {
    expect(carmenView().groups).toEqual([
      { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
      { id: "g2", position: 2, label: "Twin Deluxe Suite 2" },
      { id: "g3", position: 3, label: "Twin Deluxe Suite 3" },
      { id: "g4", position: 4, label: "Twin Deluxe Suite 4" },
      { id: "g5", position: 5, label: "Twin Deluxe Suite 5" },
      { id: "g6", position: 6, label: "Double Deluxe Suite 6" },
    ])
  })

  it("prefers a typed label", () => {
    const { groupRows, services, primarySupplierId } = carmenPaxGroupRows()
    const rows = groupRows.map((group) => (group.id === "g3" ? { ...group, label: "  The Chen children " } : group))
    expect(buildBookingPaxGroupsView(rows, services, primarySupplierId)?.groups[2].label).toBe("The Chen children")
  })

  it("reads the primary leg's route in prose, its date, and the rooms other legs assign", () => {
    const view = carmenView()
    expect(view.routeName).toBe("Pretoria to Cape Town")
    expect(view.departureDate).toBe("2026-08-11")
    expect(view.primarySupplierKind).toBe("train_operator")
    expect(view.rooms).toEqual([
      { groupIds: ["g1"], typeName: "Classic Ocean View Room" },
      { groupIds: ["g2", "g3"], typeName: "Signature Family Ocean View 2 Bedroom Apartment" },
      { groupIds: ["g4", "g5"], typeName: "Signature Family Ocean View 2 Bedroom Apartment" },
      { groupIds: ["g6"], typeName: "Classic Ocean View Room" },
    ])
  })

  it("reverses the route with the booking", () => {
    const { groupRows, services, primarySupplierId } = carmenPaxGroupRows()
    const reversed = services.map((row) => (row.id === "leg-train" ? { ...row, route_reversed: true } : row))
    expect(buildBookingPaxGroupsView(groupRows, reversed, primarySupplierId)?.routeName).toBe("Cape Town to Pretoria")
  })

  it("takes the primary supplier's leg over a hotel seeded one room per suite", () => {
    const { groupRows, services } = carmenPaxGroupRows()
    // Two groups, a hotel leg listed first whose two rooms each serve one group.
    const two = groupRows.slice(0, 2)
    const hotel = services.find((row) => row.id === "leg-hotel") as PaxGroupServiceRow
    const train = services.find((row) => row.id === "leg-train") as PaxGroupServiceRow
    const seededHotel = { ...hotel, units: [hotel.units?.[0], { ...hotel.units?.[0], pax_group_ids: ["g2"] }] } as PaxGroupServiceRow
    const twoSuiteTrain = { ...train, units: (train.units ?? []).slice(0, 2) }
    const view = buildBookingPaxGroupsView(two, [seededHotel, twoSuiteTrain], "s-blue-train")
    expect(view?.primarySupplierKind).toBe("train_operator")
    expect(view?.groups.map((group) => group.label)).toEqual(["Twin Deluxe Suite 1", "Twin Deluxe Suite 2"])
    expect(view?.rooms.map((room) => room.groupIds)).toEqual([["g1"], ["g2"]])
  })

  it("is null with fewer than two groups", () => {
    const { groupRows, services, primarySupplierId } = carmenPaxGroupRows()
    expect(buildBookingPaxGroupsView(groupRows.slice(0, 1), services, primarySupplierId)).toBeNull()
  })
})

describe("loadBookingPaxGroups", () => {
  it("is null, without reading services, when the booking has fewer than two groups", async () => {
    const from = vi.fn(() => {
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq", "order"]) chain[method] = () => chain
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: "g1", position: 1, label: null }], error: null }).then(resolve)
      return chain
    })
    expect(await loadBookingPaxGroups({ from } as never, "booking-1")).toBeNull()
    expect(from).toHaveBeenCalledTimes(1)
  })

  it("never throws", async () => {
    const failing = {
      from() {
        throw new Error("no database")
      },
    }
    expect(await loadBookingPaxGroups(failing as never, "booking-1")).toBeNull()
  })
})

describe("buildGuestHeadings", () => {
  it("heads every group by its suite type and position, without the bedroom type", () => {
    expect(buildGuestHeadings(carmenView())).toEqual([
      { groupId: "g1", heading: "Deluxe Suite 1" },
      { groupId: "g2", heading: "Deluxe Suite 2" },
      { groupId: "g3", heading: "Deluxe Suite 3" },
      { groupId: "g4", heading: "Deluxe Suite 4" },
      { groupId: "g5", heading: "Deluxe Suite 5" },
      { groupId: "g6", heading: "Deluxe Suite 6" },
    ])
  })

  it("keeps a typed name, and a group with no primary unit its own label", () => {
    const view = carmenView()
    const headings = buildGuestHeadings({
      ...view,
      groups: view.groups.map((group) => (group.id === "g2" ? { ...group, label: "The Chens" } : group)),
      primaryUnits: view.primaryUnits.filter((unit) => unit.groupId !== "g3"),
    })
    expect(headings[1]).toEqual({ groupId: "g2", heading: "The Chens" })
    expect(headings[2].heading).toBe(view.groups[2].label)
  })
})

describe("buildAvailabilitySentence", () => {
  it("counts the suites by bedroom, suite and bathroom type on the route's departure, in the {{suiteDescription}} grammar", () => {
    expect(buildAvailabilitySentence(carmenView())).toBe(
      "On the Pretoria to Cape Town departure, 11 August 2026 we can still assist you with 5 x Twin bedded Deluxe Suites with a shower & 1 x Double bedded Deluxe Suite with a ¾ bath.",
    )
  })

  it("puts the route, date and suites in bold for the email body, escaping every value", () => {
    expect(buildAvailabilityHtml(carmenView())).toBe(
      "On the <strong>Pretoria to Cape Town</strong> departure, <strong>11 August 2026</strong> we can still assist you with <strong>5 x Twin bedded Deluxe Suites with a shower &amp; 1 x Double bedded Deluxe Suite with a ¾ bath</strong>.",
    )
    const view = carmenView()
    expect(buildAvailabilityHtml({ ...view, routeName: "<i>A</i> to B" })).toContain("<strong>&lt;i&gt;A&lt;/i&gt; to B</strong>")
    expect(buildAvailabilityHtml({ ...view, primaryUnits: [] })).toBe("")
  })

  it("reads naturally without a route or a date", () => {
    const view = carmenView()
    expect(buildAvailabilitySentence({ ...view, routeName: null })).toMatch(/^On the 11 August 2026 departure we can still/)
    expect(buildAvailabilitySentence({ ...view, departureDate: null })).toMatch(/^On the Pretoria to Cape Town departure we can still/)
    expect(buildAvailabilitySentence({ ...view, routeName: null, departureDate: null })).toMatch(/^We can still assist you with 5 x/)
  })

  it("is empty when no suite names a type", () => {
    const view = carmenView()
    expect(
      buildAvailabilitySentence({ ...view, primaryUnits: view.primaryUnits.map((unit) => ({ ...unit, suiteTypeName: null })) }),
    ).toBe("")
  })
})

describe("numberTravellersByPaxGroup", () => {
  const groups = [
    { id: "g2", position: 2 },
    { id: "g1", position: 1 },
  ]

  it("numbers guests by group position, then roster order, with the unplaced last", () => {
    const travellers = [
      { name: "A", pax_group_id: "g2" },
      { name: "B", pax_group_id: null },
      { name: "C", pax_group_id: "g1" },
      { name: "D", pax_group_id: "g2" },
      { name: "E", pax_group_id: "gone" },
    ]
    expect(numberTravellersByPaxGroup(travellers, groups)?.map((entry) => [entry.traveller.name, entry.number])).toEqual([
      ["C", "1.1"],
      ["A", "2.1"],
      ["D", "2.2"],
      ["B", null],
      ["E", null],
    ])
  })

  it("is null when nobody is placed, or with fewer than two groups", () => {
    expect(numberTravellersByPaxGroup([{ pax_group_id: null }], groups)).toBeNull()
    expect(numberTravellersByPaxGroup([{ pax_group_id: "g1" }], [{ id: "g1", position: 1 }])).toBeNull()
  })
})
