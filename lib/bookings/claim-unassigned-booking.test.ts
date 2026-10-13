import { describe, expect, it, vi } from "vitest"
import { claimUnassignedBooking } from "./claim-unassigned-booking"

interface FakeOptions {
  claimedRows: { id: string }[]
  updateError?: { message: string } | null
  currentAssignee?: string | null
  auditError?: { message: string } | null
}

function fakeSupabase(options: FakeOptions) {
  const updateIs = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: options.claimedRows, error: options.updateError ?? null }),
  })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: updateIs }) })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { assigned_salesperson_id: options.currentAssignee ?? null },
        error: null,
      }),
    }),
  })
  const auditInsert = vi.fn().mockResolvedValue({ error: options.auditError ?? null })

  const from = vi.fn((table: string) => {
    if (table === "audit_logs") return { insert: auditInsert }
    return { update, select }
  })

  return { client: { from } as never, update, updateIs, auditInsert }
}

const input = { bookingId: "b1", userId: "u1", actorName: "Carmen" }

describe("claimUnassignedBooking", () => {
  it("assigns the current user to an unassigned booking and audits it", async () => {
    const fake = fakeSupabase({ claimedRows: [{ id: "b1" }] })

    const result = await claimUnassignedBooking(fake.client, input)

    expect(result).toEqual({ ok: true, claimed: true, assignedSalespersonId: "u1" })
    expect(fake.update).toHaveBeenCalledWith({ assigned_salesperson_id: "u1" })
    expect(fake.updateIs).toHaveBeenCalledWith("assigned_salesperson_id", null)
    expect(fake.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "salesperson_auto_assigned", entity_id: "b1" }),
    )
  })

  it("leaves an existing assignment alone and reports it", async () => {
    const fake = fakeSupabase({ claimedRows: [], currentAssignee: "other" })

    const result = await claimUnassignedBooking(fake.client, input)

    expect(result).toEqual({ ok: true, claimed: false, assignedSalespersonId: "other" })
    expect(fake.auditInsert).not.toHaveBeenCalled()
  })

  it("surfaces an update failure", async () => {
    const fake = fakeSupabase({ claimedRows: [], updateError: { message: "rls" } })

    const result = await claimUnassignedBooking(fake.client, input)

    expect(result).toEqual({ ok: false, error: { message: "rls" } })
  })

  it("surfaces an audit failure", async () => {
    const fake = fakeSupabase({ claimedRows: [{ id: "b1" }], auditError: { message: "audit down" } })

    const result = await claimUnassignedBooking(fake.client, input)

    expect(result.ok).toBe(false)
  })
})
