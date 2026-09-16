import { describe, expect, it } from "vitest"
import { appendFieldDetails } from "./format-error-details"

describe("appendFieldDetails", () => {
  it("appends the failed field names to a generic 'Invalid request payload' message", () => {
    const message = appendFieldDetails("Invalid request payload", {
      details: { lineItems: ["Required"], travelDate: [] },
    })
    expect(message).toBe("Invalid request payload (lineItems)")
  })

  it("appends field names to the other generic default, 'Invalid request body'", () => {
    const message = appendFieldDetails("Invalid request body", { details: { bonus: ["Too small"] } })
    expect(message).toBe("Invalid request body (bonus)")
  })

  // The routes now build their own plain-English message naming the failed line (see
  // lib/api/describe-zod-issue.ts) -- appending "(lineItems)" on top of that would turn a
  // specific message back into a confusing one.
  it("leaves a specific server message alone", () => {
    const message = appendFieldDetails("Line 2 (Commission) Unit Price: can't be negative", {
      details: { lineItems: ["can't be negative"] },
    })
    expect(message).toBe("Line 2 (Commission) Unit Price: can't be negative")
  })

  it("returns the message unchanged when there is no details payload", () => {
    expect(appendFieldDetails("Invalid request payload", {})).toBe("Invalid request payload")
    expect(appendFieldDetails("Invalid request payload", null)).toBe("Invalid request payload")
  })
})
