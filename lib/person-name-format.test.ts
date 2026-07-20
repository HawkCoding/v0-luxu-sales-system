import { describe, expect, it } from "vitest"

import { formatCustomerSalutation, normalizeFirstName, normalizeLastName } from "./person-name-format"

describe("normalizeFirstName", () => {
  it("normalizes all-caps and lower-case values", () => {
    expect(normalizeFirstName("JOHN")).toBe("John")
    expect(normalizeFirstName("jane")).toBe("Jane")
  })

  it("normalizes whitespace and hyphenated names", () => {
    expect(normalizeFirstName("  MARY-JANE   ")).toBe("Mary-Jane")
  })

  it("normalizes apostrophes and Mc prefixes", () => {
    expect(normalizeFirstName("o'brien")).toBe("O'Brien")
    expect(normalizeFirstName("mcdonald")).toBe("McDonald")
  })

  it("keeps given-name tokens title-cased instead of particle lower-casing", () => {
    expect(normalizeFirstName("VAN HELSING")).toBe("Van Helsing")
  })
})

describe("formatCustomerSalutation", () => {
  it("addresses a titled customer as title and surname", () => {
    expect(formatCustomerSalutation({ title: "Mr", first_name: "John", last_name: "Smith" })).toBe("Mr Smith")
    expect(formatCustomerSalutation({ title: "Prof", first_name: "Alan", last_name: "James" })).toBe("Prof James")
  })

  it("falls back to the full name when no title is on record", () => {
    expect(formatCustomerSalutation({ title: null, first_name: "John", last_name: "Smith" })).toBe("John Smith")
    expect(formatCustomerSalutation({ first_name: "John", last_name: "Smith" })).toBe("John Smith")
  })

  it("treats a whitespace-only title as absent", () => {
    expect(formatCustomerSalutation({ title: "   ", first_name: "John", last_name: "Smith" })).toBe("John Smith")
  })

  it("falls back to the full name when the surname is missing", () => {
    expect(formatCustomerSalutation({ title: "Mr", first_name: "John", last_name: null })).toBe("John")
  })

  it("uses title and surname when the first name is missing", () => {
    expect(formatCustomerSalutation({ title: "Dr", first_name: null, last_name: "Smith" })).toBe("Dr Smith")
    expect(formatCustomerSalutation({ first_name: null, last_name: "Smith" })).toBe("Smith")
  })

  it("keeps surname particles intact", () => {
    expect(formatCustomerSalutation({ title: "Mr", first_name: "Pieter", last_name: "van der Berg" })).toBe(
      "Mr van der Berg",
    )
  })

  it("returns an empty string when nothing is on record", () => {
    expect(formatCustomerSalutation(null)).toBe("")
    expect(formatCustomerSalutation(undefined)).toBe("")
    expect(formatCustomerSalutation({ title: "Mr" })).toBe("")
  })
})

describe("normalizeLastName", () => {
  it("normalizes all-caps and lower-case values", () => {
    expect(normalizeLastName("SMITH")).toBe("Smith")
    expect(normalizeLastName("johnson")).toBe("Johnson")
  })

  it("applies conservative particle lower-casing for non-final surname tokens", () => {
    expect(normalizeLastName("VAN DER BERG")).toBe("van der Berg")
  })

  it("does not force lowercase for unsupported particles such as DE", () => {
    expect(normalizeLastName("DE KLERK")).toBe("De Klerk")
  })

  it("normalizes apostrophes and Mc prefixes", () => {
    expect(normalizeLastName("o'connor")).toBe("O'Connor")
    expect(normalizeLastName("mccarthy")).toBe("McCarthy")
  })

  it("normalizes Unicode composed characters", () => {
    expect(normalizeLastName("e\u0301LODIE")).toBe("Élodie")
  })
})
