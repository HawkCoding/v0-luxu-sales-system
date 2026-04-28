import { describe, expect, it } from "vitest"

import type { AuditLog } from "./types"
import { getAuditDisplay, isDuplicateStageUpdate } from "./audit-display"

const baseLog: AuditLog = {
  id: "audit-1",
  actor: "Carmen de Jager",
  entityType: "Booking",
  entityId: "booking-1",
  action: "stage_change",
  createdAt: "2026-04-27T08:00:00.000Z",
}

describe("getAuditDisplay", () => {
  it("renders stage changes with friendly stage labels", () => {
    const display = getAuditDisplay(
      {
        ...baseLog,
        beforeJson: JSON.stringify({ stage: "accepted" }),
        afterJson: JSON.stringify({ stage: "deposit_requested" }),
      },
      {
        entities: {
          "booking-1": { label: "BT-2026-0001 - Carmen Smith" },
        },
      },
    )

    expect(display.title).toBe(
      "Carmen de Jager changed booking BT-2026-0001 - Carmen Smith from Quote Accepted to Deposit Invoice Sent",
    )
    expect(display.description).toBe("Stage change")
    expect(display.actorLabel).toBe("Carmen de Jager")
  })

  it("uses the booking consultant as a display actor for legacy consultant rows", () => {
    const display = getAuditDisplay(
      {
        ...baseLog,
        actor: "consultant",
        beforeJson: JSON.stringify({ stage: "accepted" }),
        afterJson: JSON.stringify({ stage: "deposit_requested" }),
      },
      {
        entities: {
          "booking-1": {
            label: "BT-2026-0001",
            actorLabel: "Carmen",
          },
        },
      },
    )

    expect(display.title).toBe("Carmen changed booking BT-2026-0001 from Quote Accepted to Deposit Invoice Sent")
    expect(display.actorLabel).toBe("Carmen")
  })

  it("renders generic record updates from changed fields", () => {
    const display = getAuditDisplay({
      ...baseLog,
      action: "record_updated",
      beforeJson: JSON.stringify({ terms_accepted: false, updated_at: "2026-04-27T08:00:00.000Z" }),
      afterJson: JSON.stringify({ terms_accepted: true, updated_at: "2026-04-27T08:01:00.000Z" }),
    })

    expect(display.title).toBe("Carmen de Jager updated booking Booking")
    expect(display.description).toBe("terms accepted changed from No to Yes")
  })

  it("falls back to a humanized action description", () => {
    const display = getAuditDisplay({
      ...baseLog,
      action: "send_deposit_email",
      entityType: "job",
    })

    expect(display.title).toBe("Carmen de Jager recorded send deposit email on job")
    expect(display.description).toBe("Send deposit email")
  })
})

describe("isDuplicateStageUpdate", () => {
  it("hides a trigger record update when an explicit matching stage change exists", () => {
    const stageChange: AuditLog = {
      ...baseLog,
      id: "audit-stage",
      action: "stage_change",
      beforeJson: JSON.stringify({ stage: "accepted" }),
      afterJson: JSON.stringify({ stage: "form_done" }),
    }
    const recordUpdate: AuditLog = {
      ...baseLog,
      id: "audit-record",
      action: "record_updated",
      beforeJson: JSON.stringify({ stage: "accepted", updated_at: "2026-04-27T08:00:00.000Z" }),
      afterJson: JSON.stringify({ stage: "form_done", updated_at: "2026-04-27T08:00:01.000Z" }),
      createdAt: "2026-04-27T08:00:01.000Z",
    }

    expect(isDuplicateStageUpdate(recordUpdate, [stageChange, recordUpdate])).toBe(true)
  })

  it("keeps updates when non-stage business fields changed", () => {
    const recordUpdate: AuditLog = {
      ...baseLog,
      action: "record_updated",
      beforeJson: JSON.stringify({ stage: "accepted", terms_accepted: false }),
      afterJson: JSON.stringify({ stage: "form_done", terms_accepted: true }),
    }

    expect(isDuplicateStageUpdate(recordUpdate, [recordUpdate])).toBe(false)
  })
})
