import { describe, expect, it } from "vitest"
import {
  buildSupplierPhrasePattern,
  deriveSupplierMatchPhrases,
  matchSupplierInText,
} from "@/lib/suppliers/match-phrases"

const BLUE_TRAIN = { name: "The Blue Train", kind: "train_operator" as const }
const ROVOS = { name: "Rovos Rail", kind: "train_operator" as const }
const SHALATI = { name: "Kruger Shalati - Train on the Bridge", kind: "hotel_property" as const }

describe("deriveSupplierMatchPhrases", () => {
  it("keeps a name with no descriptive tail as a single phrase", () => {
    expect(deriveSupplierMatchPhrases(ROVOS)).toEqual(["Rovos Rail"])
  })

  it("adds the brand segment before a dash, longest first", () => {
    expect(deriveSupplierMatchPhrases(SHALATI)).toEqual([
      "Kruger Shalati - Train on the Bridge",
      "Kruger Shalati",
    ])
  })

  it("splits on an en dash and on an opening parenthesis too", () => {
    expect(deriveSupplierMatchPhrases({ name: "Blue Train – Luxury Rail", kind: "train_operator" })).toContain(
      "Blue Train",
    )
    expect(deriveSupplierMatchPhrases({ name: "Toyota Tours (Transfers)", kind: "transfers" })).toContain(
      "Toyota Tours",
    )
  })

  // One word is not specific enough to scan a whole email body for -- "Kruger" alone would fire on
  // any Rovos enquiry from a customer of that surname.
  it("refuses a single-word brand segment", () => {
    expect(deriveSupplierMatchPhrases({ name: "Kruger - Train on the Bridge", kind: "hotel_property" })).toEqual([
      "Kruger - Train on the Bridge",
    ])
  })

  it("takes explicit phrases over the derived ones", () => {
    expect(
      deriveSupplierMatchPhrases({ ...SHALATI, emailMatchPhrases: "Shalati Bridge, Kruger Shalati" }),
      // Equal-length phrases keep the order they were typed in; only longer ones jump the queue.
    ).toEqual(["Shalati Bridge", "Kruger Shalati"])
  })

  it("falls back to the derived phrases when the override is blank", () => {
    expect(deriveSupplierMatchPhrases({ ...SHALATI, emailMatchPhrases: "  ,  " })).toEqual([
      "Kruger Shalati - Train on the Bridge",
      "Kruger Shalati",
    ])
  })
})

describe("buildSupplierPhrasePattern", () => {
  it("treats a leading definite article as optional on both sides", () => {
    expect(buildSupplierPhrasePattern("The Blue Train").test("we want the blue train")).toBe(true)
    expect(buildSupplierPhrasePattern("The Blue Train").test("we want Blue Train")).toBe(true)
  })

  it("matches on whole words only", () => {
    expect(buildSupplierPhrasePattern("Rovos Rail").test("Rovos Railway Society")).toBe(false)
  })
})

describe("matchSupplierInText", () => {
  const pool = [BLUE_TRAIN, ROVOS, SHALATI]

  // The whole reason the subject is scanned: a Kruger Shalati body never names the property, and
  // the Gravity form calls itself "Kruger Shalati Enquiry", not by the supplier's full name.
  it("matches the brand segment in a Gravity Forms subject", () => {
    expect(matchSupplierInText("New submission from Kruger Shalati Enquiry - Kluever", pool)).toEqual({
      name: "Kruger Shalati - Train on the Bridge",
      kind: "hotel_property",
      phrase: "Kruger Shalati",
    })
  })

  // The trap this guards: a real Rovos fixture has the surname Kruger. One shared token must not
  // be enough to hand the enquiry to a different supplier.
  it("does not match Shalati on the surname Kruger alone", () => {
    expect(matchSupplierInText("New submission from Rovos Rail SA Specials 2026 - Kruger", pool)).toEqual({
      name: "Rovos Rail",
      kind: "train_operator",
      phrase: "Rovos Rail",
    })
  })

  it("returns null when no supplier is named", () => {
    expect(matchSupplierInText("Out of office until Monday", pool)).toBeNull()
  })

  it("returns null for empty text", () => {
    expect(matchSupplierInText("   ", pool)).toBeNull()
  })

  it("prefers the longest matching phrase when one name contains another", () => {
    const overlapping = [
      { name: "Blue Train", kind: "train_operator" as const },
      { name: "Blue Train Luxury Collection", kind: "train_operator" as const },
    ]
    expect(matchSupplierInText("enquiry for the Blue Train Luxury Collection", overlapping)?.name).toBe(
      "Blue Train Luxury Collection",
    )
  })
})
