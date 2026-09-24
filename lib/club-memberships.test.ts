import { describe, expect, it } from "vitest"

import {
  cleanClubMemberships,
  clubMembershipsEqual,
  clubMembershipsSchema,
  distinctClubNames,
  hasIncompleteClubMembership,
  MAX_CLUB_MEMBERSHIPS,
  mergeClubMemberships,
  parseClubMemberships,
} from "./club-memberships"

describe("cleanClubMemberships", () => {
  it("trims entries and drops fully blank rows", () => {
    expect(
      cleanClubMemberships([
        { club: "  Rovos Rail ", number: " RR-1 " },
        { club: "", number: "  " },
      ]),
    ).toEqual([{ club: "Rovos Rail", number: "RR-1" }])
  })

  it("keeps half-filled rows so validation can flag them", () => {
    expect(cleanClubMemberships([{ club: "Rovos Rail", number: "" }])).toEqual([{ club: "Rovos Rail", number: "" }])
  })
})

describe("hasIncompleteClubMembership", () => {
  it("flags a row with only one field filled", () => {
    expect(hasIncompleteClubMembership([{ club: "Rovos Rail", number: " " }])).toBe(true)
    expect(hasIncompleteClubMembership([{ club: "", number: "123" }])).toBe(true)
  })

  it("accepts complete and fully blank rows", () => {
    expect(
      hasIncompleteClubMembership([
        { club: "Rovos Rail", number: "1" },
        { club: "", number: "" },
      ]),
    ).toBe(false)
  })
})

describe("mergeClubMemberships", () => {
  const existing = [
    { club: "Rovos Rail", number: "OLD-1" },
    { club: "SAA Voyager", number: "998877" },
  ]

  it("updates the number for a club already on file, matching case-insensitively", () => {
    expect(mergeClubMemberships(existing, [{ club: "rovos rail", number: "NEW-2" }])).toEqual([
      { club: "Rovos Rail", number: "NEW-2" },
      { club: "SAA Voyager", number: "998877" },
    ])
  })

  it("appends clubs the customer does not have yet", () => {
    expect(mergeClubMemberships(existing, [{ club: "Blue Train", number: "BT-5" }])).toHaveLength(3)
  })

  it("never removes existing entries", () => {
    expect(mergeClubMemberships(existing, [])).toEqual(existing)
  })

  it("ignores blank and half-filled incoming rows", () => {
    expect(
      mergeClubMemberships(existing, [
        { club: "Blue Train", number: "" },
        { club: "", number: "" },
      ]),
    ).toEqual(existing)
  })

  it("does not mutate the existing list", () => {
    const copy = existing.map((row) => ({ ...row }))
    mergeClubMemberships(existing, [{ club: "Rovos Rail", number: "X" }])
    expect(existing).toEqual(copy)
  })

  it("caps the merged list at the maximum", () => {
    const full = Array.from({ length: MAX_CLUB_MEMBERSHIPS }, (_, i) => ({ club: `Club ${i}`, number: `${i}` }))
    expect(mergeClubMemberships(full, [{ club: "One more", number: "1" }])).toHaveLength(MAX_CLUB_MEMBERSHIPS)
  })
})

describe("clubMembershipsEqual", () => {
  it("compares by content and order", () => {
    const a = [{ club: "A", number: "1" }]
    expect(clubMembershipsEqual(a, [{ club: "A", number: "1" }])).toBe(true)
    expect(clubMembershipsEqual(a, [{ club: "A", number: "2" }])).toBe(false)
    expect(clubMembershipsEqual(a, [])).toBe(false)
  })
})

describe("parseClubMemberships", () => {
  it("returns an empty list for non-array values", () => {
    expect(parseClubMemberships(null)).toEqual([])
    expect(parseClubMemberships({ club: "A", number: "1" })).toEqual([])
    expect(parseClubMemberships("[]")).toEqual([])
  })

  it("keeps only well-formed entries", () => {
    expect(parseClubMemberships([{ club: "A", number: "1" }, { club: "B" }, "junk", null, { club: 1, number: "2" }])).toEqual([
      { club: "A", number: "1" },
    ])
  })
})

describe("clubMembershipsSchema", () => {
  it("accepts well-formed entries and trims them", () => {
    expect(clubMembershipsSchema.parse([{ club: " Rovos Rail ", number: " 1 " }])).toEqual([
      { club: "Rovos Rail", number: "1" },
    ])
  })

  it("rejects a blank club or number", () => {
    expect(clubMembershipsSchema.safeParse([{ club: " ", number: "1" }]).success).toBe(false)
    expect(clubMembershipsSchema.safeParse([{ club: "A", number: "" }]).success).toBe(false)
  })

  it("rejects more entries than the maximum", () => {
    const tooMany = Array.from({ length: MAX_CLUB_MEMBERSHIPS + 1 }, (_, i) => ({ club: `C${i}`, number: "1" }))
    expect(clubMembershipsSchema.safeParse(tooMany).success).toBe(false)
  })
})

describe("distinctClubNames", () => {
  it("dedupes case-insensitively, keeps the first spelling and sorts", () => {
    expect(
      distinctClubNames([
        [{ club: "Rovos Rail", number: "1" }],
        [
          { club: "rovos rail", number: "2" },
          { club: "Blue Train", number: "3" },
          { club: "  ", number: "4" },
        ],
      ]),
    ).toEqual(["Blue Train", "Rovos Rail"])
  })
})
