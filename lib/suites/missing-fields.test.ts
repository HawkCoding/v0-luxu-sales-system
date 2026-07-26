import { describe, expect, it } from "vitest"
import { SUITE_TYPE_MISSING_FIELD, withSuiteTypeMissingField } from "@/lib/suites/missing-fields"

describe("withSuiteTypeMissingField", () => {
  it("adds the suite-type gap while suites remain unidentified", () => {
    expect(withSuiteTypeMissingField(["Departure date"], true)).toEqual([
      "Departure date",
      SUITE_TYPE_MISSING_FIELD,
    ])
  })

  it("removes it once the suites resolve, preserving unrelated gaps", () => {
    // Auto-clear is a recompute, not a blanket clear -- other missing fields must survive.
    expect(withSuiteTypeMissingField(["Departure date", SUITE_TYPE_MISSING_FIELD], false)).toEqual([
      "Departure date",
    ])
  })

  it("does not duplicate the entry when it is already present", () => {
    expect(withSuiteTypeMissingField([SUITE_TYPE_MISSING_FIELD], true)).toEqual([
      SUITE_TYPE_MISSING_FIELD,
    ])
  })

  it("returns an empty list when nothing is missing", () => {
    expect(withSuiteTypeMissingField([SUITE_TYPE_MISSING_FIELD], false)).toEqual([])
  })
})
