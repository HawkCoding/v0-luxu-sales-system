import { describe, expect, it } from "vitest"
import {
  autoPaxGroupLabel,
  paxGroupLabel,
  paxGroupNamesFromSuiteTypes,
  resolvePaxGroupMetas,
} from "@/lib/pax-groups/labels"

const names = paxGroupNamesFromSuiteTypes([
  {
    id: "suite-deluxe",
    name: "Deluxe Suite",
    bedroomTypeIds: ["bed-twin", "bed-double"],
    bedroomTypes: ["Twin", "Double"],
  },
  { id: "suite-royal", name: "Royal Suite" },
])

describe("autoPaxGroupLabel", () => {
  it("names a group by its unit's bedroom type, suite type and position", () => {
    expect(autoPaxGroupLabel(2, { suiteTypeId: "suite-deluxe", bedroomTypeId: "bed-twin" }, names)).toBe(
      "Twin Deluxe Suite 2",
    )
  })

  it("leaves the bedroom type out when none was picked", () => {
    expect(autoPaxGroupLabel(3, { suiteTypeId: "suite-royal", bedroomTypeId: null }, names)).toBe("Royal Suite 3")
  })

  it("falls back to Suite <position> with no unit, or an unknown suite type", () => {
    expect(autoPaxGroupLabel(4, null, names)).toBe("Suite 4")
    expect(autoPaxGroupLabel(5, { suiteTypeId: "suite-gone", bedroomTypeId: "bed-twin" }, names)).toBe("Suite 5")
  })
})

describe("paxGroupLabel", () => {
  it("prefers the typed label, trimmed", () => {
    expect(
      paxGroupLabel({ position: 1, label: "  The Chens  " }, { suiteTypeId: "suite-deluxe", bedroomTypeId: null }, names),
    ).toBe("The Chens")
  })

  it("treats a blank typed label as automatic", () => {
    expect(paxGroupLabel({ position: 1, label: "   " }, { suiteTypeId: "suite-deluxe", bedroomTypeId: null }, names)).toBe(
      "Deluxe Suite 1",
    )
  })
})

describe("resolvePaxGroupMetas", () => {
  it("names every group off its own primary unit, in position order", () => {
    const metas = resolvePaxGroupMetas(
      [
        { id: "g2", position: 2, label: null },
        { id: "g1", position: 1, label: null },
        { id: "g3", position: 3, label: "Grandparents" },
      ],
      [
        { paxGroupIds: ["g1"], suiteTypeId: "suite-deluxe", bedroomTypeId: "bed-twin" },
        { paxGroupIds: ["g2"], suiteTypeId: "suite-deluxe", bedroomTypeId: "bed-double" },
        { paxGroupIds: ["g3"], suiteTypeId: "suite-royal", bedroomTypeId: null },
      ],
      names,
    )

    expect(metas).toEqual([
      { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
      { id: "g2", position: 2, label: "Double Deluxe Suite 2" },
      { id: "g3", position: 3, label: "Grandparents" },
    ])
  })

  it("still names a group whose primary unit is missing", () => {
    expect(resolvePaxGroupMetas([{ id: "g1", position: 1, label: null }], [], names)).toEqual([
      { id: "g1", position: 1, label: "Suite 1" },
    ])
  })

  it("returns nothing for a booking without groups", () => {
    expect(resolvePaxGroupMetas([], [], names)).toEqual([])
  })
})
