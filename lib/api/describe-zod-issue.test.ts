import { describe, expect, it } from "vitest"
import { z } from "zod"
import { describeValidationIssue, humanizeKey } from "./describe-zod-issue"

function firstIssue(schema: z.ZodTypeAny, value: unknown) {
  const result = schema.safeParse(value)
  if (result.success) throw new Error("expected schema to fail")
  return result.error.issues[0]
}

describe("humanizeKey", () => {
  it("splits camelCase and capitalises the first letter", () => {
    expect(humanizeKey("unitPrice")).toBe("Unit Price")
    expect(humanizeKey("text")).toBe("Text")
  })
})

describe("describeValidationIssue", () => {
  it("passes a custom message through unchanged", () => {
    const schema = z.string().refine(() => false, { message: "Each city may only have one station address" })
    expect(describeValidationIssue(firstIssue(schema, "x"))).toBe(
      "Each city may only have one station address",
    )
  })

  it("prefixes a nested array path with a humanized field name and #N", () => {
    const schema = z.object({ inclusionLines: z.array(z.object({ text: z.string().max(5) })) })
    const issue = firstIssue(schema, { inclusionLines: Array(13).fill({}).map(() => ({ text: "too long" })) })
    expect(describeValidationIssue(issue)).toBe("Inclusion Lines #1 Text: String must contain at most 5 character(s)")
  })

  it("rewrites a nonnegative violation as plain English", () => {
    const schema = z.object({ qty: z.number().nonnegative() })
    const issue = firstIssue(schema, { qty: -1 })
    expect(describeValidationIssue(issue)).toBe("Qty: can't be negative")
  })

  it("names a line via lineLabel instead of a bare index", () => {
    const schema = z.object({
      lineItems: z.array(z.object({ unitPrice: z.number().nonnegative() })),
    })
    const issue = firstIssue(schema, { lineItems: [{ unitPrice: 5 }, { unitPrice: -46320 }] })

    const message = describeValidationIssue(issue, {
      lineLabel: (index) => `Line ${index + 1} (Commission)`,
    })

    expect(message).toBe("Line 2 (Commission) Unit Price: can't be negative")
  })

  it("falls back to a bare index when lineLabel returns nothing for it", () => {
    const schema = z.object({
      lineItems: z.array(z.object({ unitPrice: z.number().nonnegative() })),
    })
    const issue = firstIssue(schema, { lineItems: [{ unitPrice: -5 }] })

    const message = describeValidationIssue(issue, { lineLabel: () => undefined })

    expect(message).toBe("Line Items #1 Unit Price: can't be negative")
  })
})
