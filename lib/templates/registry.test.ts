import { describe, expect, it } from "vitest"
import { TEMPLATE_TOKENS, tokenGroup, type TemplateTokenGroup, type TemplateTokenSpec } from "./registry"

/**
 * Characterization tests for the email-template token registry.
 *
 * The Templates page groups token chips Rail vs Stay and opens on whichever matches the variant's
 * supplier kind (app/app/templates/page.tsx:122). Generalising the primary-product feature replaces
 * that binary with one group per SupplierKind, which is presentation only -- every token still
 * resolves in every template. This file freezes which tokens sit in which group today, so the
 * migration has to reproduce a train variant's and a hotel variant's chip lists exactly.
 */

/** The same de-duplicated union the Templates page builds for its token reference. */
function allSpecs(): TemplateTokenSpec[] {
  const seen = new Map<string, TemplateTokenSpec>()
  for (const specs of Object.values(TEMPLATE_TOKENS)) {
    for (const spec of specs) if (!seen.has(spec.name)) seen.set(spec.name, spec)
  }
  return [...seen.values()]
}

function namesInGroup(group: TemplateTokenGroup): string[] {
  return allSpecs()
    .filter((spec) => tokenGroup(spec) === group)
    .map((spec) => spec.name)
    .sort()
}

describe("template token groups", () => {
  it("rail tokens are unchanged", () => {
    expect(namesInGroup("rail")).toMatchInlineSnapshot(`
      [
        "departureDate",
        "departureDateShort",
        "direction",
        "rateLabel",
        "routeName",
        "suiteConfiguration",
        "suiteDescription",
        "suiteType",
        "trainOnlyNote",
      ]
    `)
  })

  it("stay tokens are unchanged", () => {
    expect(namesInGroup("stay")).toMatchInlineSnapshot(`
      [
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
      ]
    `)
  })

  it("always-available tokens are unchanged", () => {
    expect(namesInGroup("always")).toMatchInlineSnapshot(`
      [
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
        "voucherNumber",
      ]
    `)
  })

  it("every token falls in exactly one group", () => {
    const specs = allSpecs()
    const grouped = [...namesInGroup("always"), ...namesInGroup("rail"), ...namesInGroup("stay")]
    expect(grouped.length).toBe(specs.length)
    expect(new Set(grouped).size).toBe(specs.length)
  })

  it("defaults an ungrouped token to always", () => {
    expect(tokenGroup({ name: "x", description: "", kind: "scalar", sample: "" })).toBe("always")
  })

  /**
   * Block tokens are inserted as raw HTML rather than escaped, so the set of them is a security
   * boundary as much as a presentation one. Frozen so the group migration cannot quietly widen it.
   */
  it("block tokens are unchanged", () => {
    expect(
      allSpecs()
        .filter((spec) => spec.kind === "block")
        .map((spec) => spec.name)
        .sort(),
    ).toMatchInlineSnapshot(`
      [
        "bankingDetails",
        "guestInfo",
        "quoteSummaryTable",
        "trainOnlyNote",
      ]
    `)
  })
})
