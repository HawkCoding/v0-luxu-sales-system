import { describe, expect, it } from "vitest"
import {
  findMatchingInboundSubjectRule,
  isValidSubjectPattern,
  matchesInboundSubjectRule,
} from "@/lib/inbound-email/rules"

describe("inbound subject rules", () => {
  it("matches contains, exact, and regex rules", () => {
    expect(matchesInboundSubjectRule("New Enquiry from website", {
      id: "1",
      name: "Website",
      subjectPattern: "new enquiry",
      matchType: "contains",
      active: true,
    })).toBe(true)

    expect(matchesInboundSubjectRule("New Enquiry", {
      id: "2",
      name: "Exact",
      subjectPattern: "New Enquiry",
      matchType: "exact",
      active: true,
    })).toBe(true)

    expect(matchesInboundSubjectRule("Rovos form #123", {
      id: "3",
      name: "Regex",
      subjectPattern: "form #[0-9]+",
      matchType: "regex",
      active: true,
    })).toBe(true)
  })

  it("ignores inactive and invalid regex rules", () => {
    expect(matchesInboundSubjectRule("New Enquiry", {
      id: "1",
      name: "Inactive",
      subjectPattern: "New",
      matchType: "contains",
      active: false,
    })).toBe(false)

    expect(matchesInboundSubjectRule("New Enquiry", {
      id: "2",
      name: "Invalid",
      subjectPattern: "[",
      matchType: "regex",
      active: true,
    })).toBe(false)
  })

  it("returns the first active matching rule", () => {
    const match = findMatchingInboundSubjectRule("Blue Train form", [
      { id: "1", name: "No", subjectPattern: "Rovos", matchType: "contains", active: true },
      { id: "2", name: "Yes", subjectPattern: "Blue Train", matchType: "contains", active: true },
    ])

    expect(match?.id).toBe("2")
  })
})

describe("isValidSubjectPattern", () => {
  it("accepts anything for contains and exact", () => {
    expect(isValidSubjectPattern("New enquiry [unclosed(", "contains")).toBe(true)
    expect(isValidSubjectPattern("New enquiry [unclosed(", "exact")).toBe(true)
  })

  it("accepts a compilable regex", () => {
    expect(isValidSubjectPattern("^New submission from (Blue Train|Rovos)", "regex")).toBe(true)
  })

  it("rejects a regex that does not compile", () => {
    // Saved as-is, such a rule matched nothing at all -- not even its own literal text -- and told
    // the admin who wrote it nothing.
    expect(isValidSubjectPattern("New enquiry [unclosed(", "regex")).toBe(false)
  })
})
