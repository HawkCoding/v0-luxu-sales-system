import { describe, expect, it } from "vitest"
import {
  TEMPLATE_TOKENS,
  isUniversalToken,
  tokenKinds,
  type TemplateTokenSpec,
} from "./registry"
import { SUPPLIER_KIND_LABELS, type SupplierKind } from "@/lib/types"

/**
 * The email-template token registry.
 *
 * The Templates page groups token chips by the product a template is for and opens on the group
 * matching its supplier's kind. Scoping is presentation only -- every token still resolves in every
 * template -- but a train variant's and a hotel variant's chip lists must not move, so both are
 * pinned in full below.
 */

/** The same de-duplicated union the Templates page builds for its token reference. */
function allSpecs(): TemplateTokenSpec[] {
  const seen = new Map<string, TemplateTokenSpec>()
  for (const specs of Object.values(TEMPLATE_TOKENS)) {
    for (const spec of specs) if (!seen.has(spec.name)) seen.set(spec.name, spec)
  }
  return [...seen.values()]
}

/** The tokens a variant for this kind shows in its own section, in the page's order. */
function namesForKind(kind: SupplierKind): string[] {
  return allSpecs()
    .filter((spec) => !isUniversalToken(spec) && tokenKinds(spec).includes(kind))
    .map((spec) => spec.name)
    .sort()
}

function universalNames(): string[] {
  return allSpecs()
    .filter(isUniversalToken)
    .map((spec) => spec.name)
    .sort()
}

describe("template token scoping", () => {
  /**
   * These two lists are the old "rail" and "stay" groups verbatim. Reproducing them is what makes
   * the move to per-kind scoping invisible to an author writing either variant.
   */
  it("a train variant shows exactly the tokens it always did", () => {
    expect(namesForKind("train_operator")).toEqual([
      "departureDate",
      "departureDateShort",
      "direction",
      "rateLabel",
      "routeName",
      "suiteConfiguration",
      "suiteDescription",
      "suiteType",
      "trainOnlyNote",
    ])
  })

  it("a hotel variant shows exactly the tokens it always did", () => {
    expect(namesForKind("hotel_property")).toEqual([
      "checkInDate",
      "checkInTime",
      "checkOutDate",
      "checkOutTime",
      "mealPlan",
      "nights",
      "propertyAddress",
      "propertyLocation",
      "propertyName",
      "roomDescription",
      "roomType",
    ])
  })

  it("the shared vocabulary is unchanged", () => {
    expect(universalNames()).toEqual([
      "adultCount",
      "amountDue",
      "bankingDetails",
      "childCount",
      "clientSurname",
      "consultantName",
      "customerName",
      "daysOverdue",
      "depositAmount",
      "depositPercentage",
      "dueDate",
      "finalAmount",
      "finalDueDate",
      "guestCount",
      "guestInfo",
      "invoiceNumber",
      "jobNumber",
      "lastSentDate",
      "outstandingAmount",
      "quoteSummaryTable",
      "receivedAmount",
      "supplierName",
      "total",
      "tripEndDate",
      "tripStartDate",
      "tripTitle",
      "unitNoun",
      "unitNounPlural",
      "voucherNumber",
    ])
  })

  it("gives every product type something of its own to say", () => {
    for (const kind of Object.keys(SUPPLIER_KIND_LABELS) as SupplierKind[]) {
      expect(namesForKind(kind).length, kind).toBeGreaterThan(0)
    }
  })

  it("scopes the stay vocabulary to properties alone", () => {
    // These are read off a hotel leg (lib/templates/stay-tokens.ts) and have nothing to say about
    // any other product, so no other kind should offer them.
    for (const name of ["checkInDate", "mealPlan", "propertyAddress", "roomType"]) {
      const spec = allSpecs().find((candidate) => candidate.name === name)
      expect(tokenKinds(spec!), name).toEqual(["hotel_property"])
    }
  })

  it("offers a direction only to products that run from an origin to a destination", () => {
    const spec = allSpecs().find((candidate) => candidate.name === "direction")
    expect(tokenKinds(spec!).sort()).toEqual(
      ["airline", "train_operator", "transfers", "vehicle_rental"].sort(),
    )
  })

  it("keeps the train-only note on trains", () => {
    const spec = allSpecs().find((candidate) => candidate.name === "trainOnlyNote")
    expect(tokenKinds(spec!)).toEqual(["train_operator"])
  })

  it("stops describing shared tokens as rail-shaped", () => {
    for (const name of ["supplierName", "departureDate", "rateLabel"]) {
      const spec = allSpecs().find((candidate) => candidate.name === name)
      expect(spec!.description.toLowerCase(), name).not.toContain("train")
    }
  })

  it("scopes every token to at least one product", () => {
    for (const spec of allSpecs()) {
      expect(tokenKinds(spec).length, spec.name).toBeGreaterThan(0)
    }
  })

  it("defaults an unscoped token to every product", () => {
    expect(tokenKinds({ name: "x", description: "", kind: "scalar", sample: "" })).toHaveLength(7)
  })

  /**
   * Block tokens are inserted as raw HTML rather than escaped, so the set of them is a security
   * boundary as much as a presentation one. Frozen so the scoping change cannot quietly widen it.
   */
  it("block tokens are unchanged", () => {
    expect(
      allSpecs()
        .filter((spec) => spec.kind === "block")
        .map((spec) => spec.name)
        .sort(),
    ).toEqual(["bankingDetails", "guestInfo", "quoteSummaryTable", "trainOnlyNote"])
  })
})
