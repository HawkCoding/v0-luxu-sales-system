import { describe, expect, it } from "vitest"

import {
  describePrefilled,
  fillBlanksFromCustomer,
  findCustomerRow,
  type PrefillableTraveller,
  type PrefillSourceCustomer,
} from "./traveller-prefill"

const CUSTOMER: PrefillSourceCustomer = {
  firstName: "Jane",
  lastName: "Doe",
  title: "Mrs",
  idPassport: "B7654321",
  dateOfBirth: "1990-05-05",
  country: "South Africa",
}

function row(overrides: Partial<PrefillableTraveller> = {}): PrefillableTraveller {
  return {
    key: overrides.key ?? "row-1",
    prefix: "",
    firstName: "Jane",
    lastName: "Doe",
    idPassport: "",
    dateOfBirth: "",
    residence: "",
    isChild: false,
    isPrimary: false,
    ...overrides,
  }
}

const createRow = (customer: PrefillSourceCustomer): PrefillableTraveller =>
  row({
    key: "seeded",
    firstName: customer.firstName,
    lastName: customer.lastName,
    prefix: customer.title ?? "",
    idPassport: customer.idPassport ?? "",
    dateOfBirth: customer.dateOfBirth ?? "",
    residence: customer.country ?? "",
    isPrimary: true,
  })

describe("findCustomerRow", () => {
  it("prefers the flagged primary guest over a name match", () => {
    const rows = [row({ key: "a" }), row({ key: "b", firstName: "Sam", lastName: "Smith", isPrimary: true })]
    expect(findCustomerRow(rows, CUSTOMER)).toBe(1)
  })

  it("falls back to an adult row with the same name, ignoring case and padding", () => {
    const rows = [row({ key: "a", firstName: "Sam", lastName: "Smith" }), row({ key: "b", firstName: " jane " })]
    expect(findCustomerRow(rows, CUSTOMER)).toBe(1)
  })

  it("never matches a child row on name", () => {
    expect(findCustomerRow([row({ isChild: true })], CUSTOMER)).toBe(-1)
  })

  it("returns -1 when the customer is not travelling", () => {
    const rows = [row({ firstName: "Sam", lastName: "Smith" })]
    expect(findCustomerRow(rows, CUSTOMER)).toBe(-1)
  })
})

describe("fillBlanksFromCustomer", () => {
  it("fills a returning customer's blank identity fields", () => {
    const result = fillBlanksFromCustomer([row()], CUSTOMER, createRow)
    expect(result.changed).toBe(true)
    expect(result.rows[0]).toMatchObject({
      prefix: "Mrs",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      residence: "South Africa",
      isPrimary: true,
    })
    expect(result.prefilled.get("row-1")).toEqual(
      new Set(["prefix", "idPassport", "dateOfBirth", "residence"]),
    )
  })

  it("never overwrites details already captured on the row", () => {
    const existing = row({ idPassport: "OTHER-99", dateOfBirth: "1975-01-01", isPrimary: true })
    const result = fillBlanksFromCustomer([existing], CUSTOMER, createRow)
    expect(result.rows[0].idPassport).toBe("OTHER-99")
    expect(result.rows[0].dateOfBirth).toBe("1975-01-01")
    expect(result.prefilled.get("row-1")).toEqual(new Set(["prefix", "residence"]))
  })

  it("treats a whitespace-only value as blank and fills it", () => {
    const result = fillBlanksFromCustomer([row({ idPassport: "   ", isPrimary: true })], CUSTOMER, createRow)
    expect(result.rows[0].idPassport).toBe("B7654321")
  })

  it("reports no change when the row is already complete", () => {
    const complete = row({
      prefix: "Mrs",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      residence: "South Africa",
      isPrimary: true,
    })
    const result = fillBlanksFromCustomer([complete], CUSTOMER, createRow)
    expect(result.changed).toBe(false)
    expect(result.rows[0]).toBe(complete)
    expect(result.prefilled.size).toBe(0)
  })

  it("skips fields the customer profile does not have", () => {
    const result = fillBlanksFromCustomer([row()], { ...CUSTOMER, dateOfBirth: null }, createRow)
    expect(result.rows[0].dateOfBirth).toBe("")
    expect(result.prefilled.get("row-1")?.has("dateOfBirth")).toBe(false)
  })

  it("claims primary on the name-matched row and clears the previous holder", () => {
    const rows = [row({ key: "a", firstName: "Sam", lastName: "Smith", isPrimary: true }), row({ key: "b" })]
    const result = fillBlanksFromCustomer(rows, CUSTOMER, createRow)
    // The flagged primary wins the lookup, so Sam is the customer's row here.
    expect(result.rows[0].isPrimary).toBe(true)
    expect(result.rows[1].isPrimary).toBe(false)
  })

  it("promotes a name-matched guest to primary when no primary is flagged", () => {
    const rows = [row({ key: "a", firstName: "Sam", lastName: "Smith" }), row({ key: "b" })]
    const result = fillBlanksFromCustomer(rows, CUSTOMER, createRow)
    expect(result.rows[1].isPrimary).toBe(true)
    expect(result.rows[0].isPrimary).toBe(false)
  })

  it("leaves other travellers alone when the customer is not travelling", () => {
    const rows = [row({ key: "a", firstName: "Sam", lastName: "Smith" })]
    const result = fillBlanksFromCustomer(rows, CUSTOMER, createRow)
    expect(result.changed).toBe(false)
    expect(result.rows).toBe(rows)
    expect(result.rows[0].idPassport).toBe("")
  })

  it("seeds a primary guest row when the booking has no guests yet", () => {
    const result = fillBlanksFromCustomer([], CUSTOMER, createRow)
    expect(result.changed).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ firstName: "Jane", idPassport: "B7654321", isPrimary: true })
    expect(result.prefilled.get("seeded")?.size).toBe(4)
  })

  it("marks nothing as prefilled when seeding from an empty customer profile", () => {
    const bare: PrefillSourceCustomer = { firstName: "Jane", lastName: "Doe" }
    const result = fillBlanksFromCustomer([], bare, createRow)
    expect(result.rows).toHaveLength(1)
    expect(result.prefilled.size).toBe(0)
  })
})

describe("describePrefilled", () => {
  it("lists filled fields in a stable, readable order", () => {
    expect(describePrefilled(new Set(["dateOfBirth", "prefix", "idPassport"]))).toBe(
      "title, ID/passport, date of birth",
    )
  })

  it("renders a single field on its own", () => {
    expect(describePrefilled(new Set(["idPassport"]))).toBe("ID/passport")
  })
})
