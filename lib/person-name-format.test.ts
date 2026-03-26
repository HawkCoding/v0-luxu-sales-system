import { describe, expect, it } from "vitest"

import { normalizeFirstName, normalizeLastName } from "./person-name-format"

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
