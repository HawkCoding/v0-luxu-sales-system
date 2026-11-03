import { describe, expect, it } from "vitest"
import {
  groupGuestsByRoom,
  guestNameLinesByPaxGroup,
  guestNameLinesByRoom,
  joinNameList,
  scopeTransferBlocksToPaxGroups,
  type RoomRosterGuest,
} from "./guest-rooms"

function guest(prefix: string, first: string, last: string, roomWith: string | null = null): RoomRosterGuest {
  return { prefix, first_name: first, last_name: last, room_with: roomWith }
}

const CARMEN = guest("Mrs", "Carmen", "De Jongh")
const LOURENS = guest("Mr", "Lourens", "De Jongh")
const STEYN = guest("Mr", "Steyn", "van Coller")
const JUNE = guest("Mrs", "June", "van Coller")

describe("guestNameLinesByPaxGroup", () => {
  const groups = [
    { id: "g2", position: 2 },
    { id: "g1", position: 1 },
  ]
  const placed = (roster: RoomRosterGuest, groupId: string | null) => ({ ...roster, pax_group_id: groupId })

  it("prints one line per suite in position order, the unplaced last, whatever Room with says", () => {
    expect(
      guestNameLinesByPaxGroup(
        [
          placed({ ...CARMEN, room_with: "Steyn van Coller" }, "g2"),
          placed(STEYN, "g1"),
          placed(LOURENS, "g2"),
          placed(JUNE, null),
          placed(guest("Ms", "Old", "Suite"), "g-deleted"),
        ],
        groups,
      ),
    ).toEqual(["Mr Steyn van Coller", "Mrs Carmen De Jongh and Mr Lourens De Jongh", "Mrs June van Coller and Ms Old Suite"])
  })

  it("skips a suite nobody is placed in", () => {
    expect(guestNameLinesByPaxGroup([placed(CARMEN, "g2"), placed(LOURENS, null)], groups)).toEqual([
      "Mrs Carmen De Jongh",
      "Mr Lourens De Jongh",
    ])
  })

  it("is null when nobody is placed, with fewer than two groups, or when it comes to one line", () => {
    expect(guestNameLinesByPaxGroup([placed(CARMEN, null), placed(LOURENS, null)], groups)).toBeNull()
    expect(guestNameLinesByPaxGroup([placed(CARMEN, "g1")], [{ id: "g1", position: 1 }])).toBeNull()
    expect(guestNameLinesByPaxGroup([placed(CARMEN, "g1"), placed(LOURENS, "g1")], groups)).toBeNull()
  })
})

describe("joinNameList", () => {
  it("joins the way a sentence names a party", () => {
    expect(joinNameList([])).toBe("")
    expect(joinNameList(["A"])).toBe("A")
    expect(joinNameList(["A", "B"])).toBe("A and B")
    expect(joinNameList(["A", "B", "C"])).toBe("A, B and C")
  })
})

describe("guestNameLinesByRoom", () => {
  it("prints one line per room when room-mates are named in Room with", () => {
    const roster = [
      { ...CARMEN, room_with: "Lourens De Jongh" },
      LOURENS,
      { ...STEYN, room_with: "Mrs June van Coller" },
      JUNE,
    ]
    expect(guestNameLinesByRoom(roster)).toEqual([
      "Mrs Carmen De Jongh and Mr Lourens De Jongh",
      "Mr Steyn van Coller and Mrs June van Coller",
    ])
  })

  it("keeps roster order within and across rooms, whichever side names the room-mate", () => {
    const roster = [CARMEN, STEYN, { ...LOURENS, room_with: "carmen de jongh" }, { ...JUNE, room_with: "Steyn" }]
    expect(guestNameLinesByRoom(roster)).toEqual([
      "Mrs Carmen De Jongh and Mr Lourens De Jongh",
      "Mr Steyn van Coller and Mrs June van Coller",
    ])
  })

  it("groups guests who share a room label", () => {
    const roster = [
      { ...CARMEN, room_with: "Room 1" },
      { ...STEYN, room_with: "Room 2" },
      { ...LOURENS, room_with: "room 1" },
      { ...JUNE, room_with: "Room 2" },
    ]
    expect(guestNameLinesByRoom(roster)).toEqual([
      "Mrs Carmen De Jongh and Mr Lourens De Jongh",
      "Mr Steyn van Coller and Mrs June van Coller",
    ])
  })

  it("puts a family room on one line when several names are listed", () => {
    const child = guest("Miss", "Emma", "De Jongh")
    const roster = [{ ...CARMEN, room_with: "Lourens & Emma" }, LOURENS, child, { ...STEYN, room_with: "June" }, JUNE]
    expect(guestNameLinesByRoom(roster)).toEqual([
      "Mrs Carmen De Jongh, Mr Lourens De Jongh and Miss Emma De Jongh",
      "Mr Steyn van Coller and Mrs June van Coller",
    ])
  })

  it("does not guess rooms for guests nobody placed — they stay together on a closing line", () => {
    const roster = [{ ...CARMEN, room_with: "Lourens De Jongh" }, LOURENS, STEYN, JUNE]
    expect(guestNameLinesByRoom(roster)).toEqual([
      "Mrs Carmen De Jongh and Mr Lourens De Jongh",
      "Mr Steyn van Coller and Mrs June van Coller",
    ])
    expect(groupGuestsByRoom(roster)?.[1]).toEqual([STEYN, JUNE])
  })

  it("keeps a guest in a room of their own on a line of their own", () => {
    const roster = [{ ...CARMEN, room_with: "Lourens" }, LOURENS, { ...STEYN, room_with: "Single" }]
    expect(guestNameLinesByRoom(roster)).toEqual(["Mrs Carmen De Jongh and Mr Lourens De Jongh", "Mr Steyn van Coller"])
  })

  it("does not match an ambiguous first name to either guest", () => {
    const roster = [
      { ...STEYN, room_with: "June" },
      guest("Mrs", "June", "van Coller"),
      guest("Ms", "June", "Smith"),
    ]
    // "June" names nobody in particular, so it reads as a label only Steyn carries.
    expect(groupGuestsByRoom(roster)).toEqual([[roster[0]], [roster[1], roster[2]]])
  })

  it("returns null when no Room with was filled in, leaving the single-line fallback", () => {
    expect(groupGuestsByRoom([CARMEN, LOURENS, STEYN, JUNE])).toBeNull()
    expect(guestNameLinesByRoom([CARMEN, LOURENS, STEYN, JUNE])).toBeNull()
    expect(guestNameLinesByRoom([{ ...CARMEN, room_with: "   " }, LOURENS])).toBeNull()
  })

  it("returns null when everyone is in one room — one line already says that", () => {
    expect(guestNameLinesByRoom([{ ...CARMEN, room_with: "Lourens De Jongh" }, LOURENS])).toBeNull()
  })

  it("ignores a guest naming themself", () => {
    expect(groupGuestsByRoom([{ ...CARMEN, room_with: "Carmen De Jongh" }, LOURENS])).toEqual([
      [{ ...CARMEN, room_with: "Carmen De Jongh" }],
      [LOURENS],
    ])
  })
})

describe("pax groups on the voucher", () => {
  const groups = [
    { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
    { id: "g2", position: 2, label: "Double Deluxe Suite 2" },
    { id: "g3", position: 3, label: "Twin Deluxe Suite 3" },
  ]
  const guests = [
    { ...guest("Mr", "Wei", "Lin"), pax_group_id: "g1" },
    { ...guest("Mrs", "Mei", "Wang"), pax_group_id: "g1" },
    { ...guest("Mr", "Johan", "Merwe"), pax_group_id: "g2" },
    { ...guest("Mr", "Late", "Booker"), pax_group_id: null },
  ]

  it("heads each suite's guest line with its label", () => {
    expect(guestNameLinesByPaxGroup(guests, groups)).toEqual([
      "Twin Deluxe Suite 1 – Mr Wei Lin and Mrs Mei Wang",
      "Double Deluxe Suite 2 – Mr Johan Merwe",
      "Mr Late Booker",
    ])
  })

  const headcounts = [
    { groupId: "g1", adults: 2, children: 0, infants: 0 },
    { groupId: "g2", adults: 1, children: 1, infants: 1 },
    { groupId: "g3", adults: 2, children: 0, infants: 0 },
  ]
  const blocks = [
    { serviceType: "transfer", transportRequestId: "tr-own", serviceData: { passengerCount: 7 } },
    { serviceType: "transfer", transportRequestId: "tr-shared", serviceData: { passengerCount: 7 } },
    { serviceType: "transfer", transportRequestId: "tr-every", serviceData: { passengerCount: 7 } },
    { serviceType: "train", transportRequestId: null, serviceData: {} },
  ]
  const requestGroups = new Map<string, string[]>([
    ["tr-own", ["g2"]],
    ["tr-shared", []],
    ["tr-every", ["g1", "g2", "g3"]],
  ])

  it("scopes a transfer only some suites take to those suites' guests and headcount", () => {
    const scoped = scopeTransferBlocksToPaxGroups(blocks, { requestGroups, groups, headcounts, guests })
    expect(scoped[0].serviceData).toEqual({
      passengerCount: 7,
      paxGroupGuests: { lines: ["Double Deluxe Suite 2 – Mr Johan Merwe"], adults: 1, children: 1, infants: 1 },
    })
    // Shared by every suite (or naming them all), and anything not a transfer: unchanged.
    expect(scoped.slice(1)).toEqual(blocks.slice(1))
  })

  it("changes nothing without group mode", () => {
    expect(scopeTransferBlocksToPaxGroups(blocks, { requestGroups, groups: [], headcounts, guests })).toEqual(blocks)
  })
})
