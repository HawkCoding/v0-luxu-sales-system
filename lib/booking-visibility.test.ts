import { describe, expect, it } from "vitest"
import {
  getCanonicalRecordPath,
  getRecordHref,
  getRecordNoun,
  getRecordSection,
  getRecordTabHref,
  getSectionFromPathname,
  isVisibleInBookings,
  isVisibleInEnquiries,
  isVisibleInQuotes,
  RECORD_SECTIONS,
  type RecordSection,
} from "./booking-visibility"
import { getCanonicalPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage } from "./types"

// Every stage value the bookings table can hold, aliases included.
const STAGE_TABLE: Array<[PipelineStage, RecordSection | null]> = [
  ["enquiry", "enquiries"],
  ["quoted", "quotes"],
  ["quote_sent", "quotes"],
  ["accepted", "quotes"],
  ["form_done", "quotes"],
  ["deposit_requested", "quotes"],
  ["payment_schedule", "quotes"],
  ["deposit_paid", "bookings"],
  ["final_paid", "bookings"],
  ["voucher_sent", "bookings"],
  ["trip_active", "bookings"],
  ["closed", "bookings"],
  ["lost", null],
]

describe("record sections", () => {
  it("covers all 13 pipeline stages", () => {
    expect(STAGE_TABLE.map(([stage]) => stage).sort()).toEqual(
      (Object.keys(PIPELINE_STAGE_LABELS) as PipelineStage[]).sort(),
    )
  })

  it.each(STAGE_TABLE)("puts %s in %s", (stage, section) => {
    const record = { stage }
    expect(getRecordSection(stage)).toBe(section)
    expect(isVisibleInEnquiries(record)).toBe(section === "enquiries")
    expect(isVisibleInQuotes(record)).toBe(section === "quotes")
    expect(isVisibleInBookings(record)).toBe(section === "bookings")
  })

  it.each(STAGE_TABLE)("shows %s in at most one list", (stage) => {
    const record = { stage }
    const lists = [isVisibleInEnquiries(record), isVisibleInQuotes(record), isVisibleInBookings(record)]
    expect(lists.filter(Boolean).length).toBeLessThanOrEqual(1)
  })

  it("lists each section's canonical stages in RECORD_SECTIONS", () => {
    for (const [stage, section] of STAGE_TABLE) {
      if (!section) continue
      expect(RECORD_SECTIONS[section].stages).toContain(getCanonicalPipelineStage(stage))
    }
  })

  it("keeps lost and unknown stages out of every list", () => {
    for (const stage of ["lost", "not_a_stage", ""]) {
      expect(getRecordSection(stage)).toBeNull()
      expect(isVisibleInEnquiries({ stage })).toBe(false)
      expect(isVisibleInQuotes({ stage })).toBe(false)
      expect(isVisibleInBookings({ stage })).toBe(false)
    }
  })
})

describe("getRecordNoun", () => {
  it("names the record after its section", () => {
    expect(getRecordNoun("enquiry")).toBe("enquiry")
    expect(getRecordNoun("payment_schedule")).toBe("quote")
    expect(getRecordNoun("trip_active")).toBe("booking")
    expect(getRecordNoun("lost")).toBe("booking")
  })
})

describe("getRecordTabHref", () => {
  it("stays on the record's current detail path", () => {
    expect(getRecordTabHref("/app/quotes/abc", "abc", "?tab=references")).toBe("/app/quotes/abc?tab=references")
    expect(getRecordTabHref("/app/enquiries/abc/", "abc", "?tab=quotes")).toBe("/app/enquiries/abc?tab=quotes")
  })

  it("falls back to the neutral jobs path off the record's page", () => {
    expect(getRecordTabHref("/app/pipeline", "abc", "?tab=references")).toBe("/app/jobs/abc?tab=references")
    expect(getRecordTabHref("/app/quotes/other", "abc")).toBe("/app/jobs/abc")
    expect(getRecordTabHref(null, "abc", "?tab=x")).toBe("/app/jobs/abc?tab=x")
  })
})

describe("getRecordHref", () => {
  it.each([
    ["enquiry", "/app/enquiries/job-1"],
    ["quoted", "/app/quotes/job-1"],
    ["deposit_requested", "/app/quotes/job-1"],
    ["deposit_paid", "/app/bookings/job-1"],
    ["trip_active", "/app/bookings/job-1"],
    ["closed", "/app/bookings/job-1"],
    ["lost", "/app/jobs/job-1"],
  ])("links a %s record to %s", (stage, href) => {
    expect(getRecordHref("job-1", stage)).toBe(href)
  })
})

describe("getSectionFromPathname", () => {
  it.each([
    ["/app/enquiries", "enquiries"],
    ["/app/enquiries/job-1", "enquiries"],
    ["/app/quotes", "quotes"],
    ["/app/quotes/job-1", "quotes"],
    ["/app/bookings/job-1", "bookings"],
    ["/app/jobs/job-1", null],
    ["/app/pipeline", null],
    ["/app/quotes-archive", null],
    ["/app", null],
    [null, null],
  ])("reads %s as %s", (pathname, section) => {
    expect(getSectionFromPathname(pathname)).toBe(section)
  })
})

describe("getCanonicalRecordPath", () => {
  it("moves an old bookings link for a quote to the Quotes section", () => {
    expect(getCanonicalRecordPath("/app/bookings/job-1", "job-1", "quote_sent")).toBe("/app/quotes/job-1")
  })

  it("moves a legacy jobs link to the record's section", () => {
    expect(getCanonicalRecordPath("/app/jobs/job-1", "job-1", "enquiry")).toBe("/app/enquiries/job-1")
    expect(getCanonicalRecordPath("/app/jobs/job-1/", "job-1", "voucher_sent")).toBe("/app/bookings/job-1")
  })

  it("returns null when the path is already canonical", () => {
    expect(getCanonicalRecordPath("/app/quotes/job-1", "job-1", "accepted")).toBeNull()
    expect(getCanonicalRecordPath("/app/bookings/job-1", "job-1", "deposit_paid")).toBeNull()
    expect(getCanonicalRecordPath("/app/enquiries/job-1", "job-1", "enquiry")).toBeNull()
  })

  it("leaves a lost record wherever it was opened", () => {
    expect(getCanonicalRecordPath("/app/bookings/job-1", "job-1", "lost")).toBeNull()
    expect(getCanonicalRecordPath("/app/jobs/job-1", "job-1", "lost")).toBeNull()
  })

  it("ignores paths that are not this record's detail page", () => {
    expect(getCanonicalRecordPath("/app/bookings/other-job", "job-1", "quote_sent")).toBeNull()
    expect(getCanonicalRecordPath("/app/bookings", "job-1", "quote_sent")).toBeNull()
    expect(getCanonicalRecordPath("/app/pipeline", "job-1", "quote_sent")).toBeNull()
    expect(getCanonicalRecordPath("/app/bookings/job-1/edit", "job-1", "quote_sent")).toBeNull()
  })
})
