import { describe, expect, it } from "vitest"

import type { AuditLog } from "./types"
import { exportAuditToCsv, exportAuditToText } from "./export-audit"

const baseLog: AuditLog = {
  id: "audit-1",
  actor: "Jane Admin",
  entityType: "Booking",
  entityId: "booking-123",
  action: "updated",
  createdAt: "2026-03-07T10:30:00.000Z",
}

describe("exportAuditToText", () => {
  it("renders a friendly message when there are no audit entries", () => {
    const result = exportAuditToText([], "JOB-001")

    expect(result).toContain("AUDIT TRAIL EXPORT")
    expect(result).toContain("Job Number: JOB-001")
    expect(result).toContain("Total Entries: 0")
    expect(result).toContain("No audit entries found for this job.")
    expect(result).toContain("End of Audit Trail")
  })

  it("renders a single audit entry with all key fields", () => {
    const result = exportAuditToText([baseLog], "JOB-001")

    expect(result).toContain("Entry #1")
    expect(result).toContain("Actor: Jane Admin")
    expect(result).toContain("Action: updated")
    expect(result).toContain("Entity: Booking (ID: booking-123)")
    expect(result).toContain("Timestamp:")
  })

  it("numbers multiple entries correctly", () => {
    const result = exportAuditToText(
      [
        baseLog,
        { ...baseLog, id: "audit-2", action: "created", entityId: "booking-456" },
      ],
      "JOB-002",
    )

    expect(result).toContain("Entry #1")
    expect(result).toContain("Entry #2")
    expect(result).toContain("Entity: Booking (ID: booking-456)")
  })

  it("pretty prints valid before, after, and metadata JSON", () => {
    const result = exportAuditToText(
      [
        {
          ...baseLog,
          beforeJson: JSON.stringify({ stage: "enquiry" }),
          afterJson: JSON.stringify({ stage: "quoted" }),
          metaJson: JSON.stringify({ changedBy: "Jane Admin" }),
        },
      ],
      "JOB-003",
    )

    expect(result).toContain("Before State:")
    expect(result).toContain('"stage": "enquiry"')
    expect(result).toContain("After State:")
    expect(result).toContain('"stage": "quoted"')
    expect(result).toContain("Metadata:")
    expect(result).toContain('"changedBy": "Jane Admin"')
  })

  it("falls back to raw invalid JSON without crashing", () => {
    const result = exportAuditToText(
      [
        {
          ...baseLog,
          beforeJson: "{not-valid-json",
        },
      ],
      "JOB-004",
    )

    expect(result).toContain("Before State:")
    expect(result).toContain("{not-valid-json")
  })
})

describe("exportAuditToCsv", () => {
  it("exports headers and audit fields as RFC 4180 quoted cells", () => {
    const result = exportAuditToCsv([
      {
        ...baseLog,
        beforeJson: JSON.stringify({ note: 'old "value"' }),
        afterJson: JSON.stringify({ note: "new,value" }),
        metaJson: JSON.stringify({ source: "test" }),
      },
    ])

    expect(result.split("\r\n")[0]).toBe(
      '"Timestamp","Actor","Action","Description","Entity Type","Entity ID","Before (JSON)","After (JSON)","Metadata"',
    )
    expect(result).toContain('"2026-03-07T10:30:00.000Z"')
    expect(result).toContain('"Jane Admin recorded updated on Booking"')
    expect(result).toContain('"{""note"":""old \\""value\\""""}"')
    expect(result).toContain('"{""note"":""new,value""}"')
  })

  it("exports an empty audit log with only the header row", () => {
    const result = exportAuditToCsv([])

    expect(result).toBe(
      '"Timestamp","Actor","Action","Description","Entity Type","Entity ID","Before (JSON)","After (JSON)","Metadata"',
    )
  })
})
