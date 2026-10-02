import { describe, expect, it } from "vitest"
import { groupGuestsByRoom, guestNameLinesByRoom, joinNameList, type RoomRosterGuest } from "./guest-rooms"

function guest(prefix: string, first: string, last: string, roomWith: string | null = null): RoomRosterGuest {
  return { prefix, first_name: first, last_name: last, room_with: roomWith }
}

const CARMEN = guest("Mrs", "Carmen", "De Jongh")
const LOURENS = guest("Mr", "Lourens", "De Jongh")
const STEYN = guest("Mr", "Steyn", "van Coller")
const JUNE = guest("Mrs", "June", "van Coller")

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
