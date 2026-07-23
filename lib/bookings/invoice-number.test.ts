import { beforeEach, describe, expect, it, vi } from "vitest"

const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: vi.fn(() => ({})),
}))

import { updateInvoiceNumber } from "./invoice-number"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function makeSupabase(existing: string | null, updateResult: { error: unknown } = { error: null }) {
  const updateChain = vi.fn(() => ({ eq: vi.fn(async () => updateResult) }))
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: BOOKING_ID, customer_invoice_number: existing },
                error: null,
              })),
            })),
          })),
          update: updateChain,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe("updateInvoiceNumber", () => {
  beforeEach(() => {
    auditMocks.writeAuditLog.mockClear()
  })

  it("writes audit with before/after when value changes", async () => {
    const supabase = makeSupabase("OLD-INV")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await updateInvoiceNumber(supabase as any, {
      bookingId: BOOKING_ID,
      value: "NEW-INV",
      actor: "Jane Doe",
      actorUserId: "u1",
    })
    expect(result.ok).toBe(true)
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "invoice_number_captured",
        entityId: BOOKING_ID,
        entityType: "Booking",
        before: { customer_invoice_number: "OLD-INV" },
        after: { customer_invoice_number: "NEW-INV" },
      }),
    )
  })

  it("skips audit when value unchanged", async () => {
    const supabase = makeSupabase("SAME")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await updateInvoiceNumber(supabase as any, {
      bookingId: BOOKING_ID,
      value: "SAME",
      actor: "Jane",
      actorUserId: "u1",
    })
    expect(result.ok).toBe(true)
    expect(auditMocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it("normalises empty string to null and records the clear", async () => {
    const supabase = makeSupabase("OLD")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await updateInvoiceNumber(supabase as any, {
      bookingId: BOOKING_ID,
      value: "   ",
      actor: "Jane",
      actorUserId: "u1",
    })
    expect(result.ok).toBe(true)
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        before: { customer_invoice_number: "OLD" },
        after: { customer_invoice_number: null },
      }),
    )
  })

  it("returns notFound when booking missing", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await updateInvoiceNumber(supabase as any, {
      bookingId: BOOKING_ID,
      value: "X",
      actor: "Jane",
      actorUserId: "u1",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.notFound).toBe(true)
  })
})
