import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/types"
import { applyRevisionReset, planRevisionReset } from "./revision-reset"

const base = { depositPaid: false, totalPaid: 0, outcome: "Open" as string | null }

describe("planRevisionReset", () => {
  it("rewinds an unpaid booking all the way to enquiry", () => {
    const plan = planRevisionReset({ ...base, stage: "deposit_requested" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.changesStage).toBe(true)
    expect(plan.keepsDeposit).toBe(false)
    expect(plan.clearedFields).toEqual(
      expect.arrayContaining([
        "quote_sent_at",
        "accepted_at",
        "deposit_requested_at",
        "deposit_paid",
        "deposit_confirmed_manually",
        "invoice_balance",
      ]),
    )
  })

  it("clears only the stages actually crossed", () => {
    const plan = planRevisionReset({ ...base, stage: "quote_sent" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toContain("quote_sent_at")
    expect(plan.clearedFields).not.toContain("accepted_at")
  })

  it("floors the reset at deposit_requested once the deposit is paid", () => {
    const plan = planRevisionReset({
      ...base,
      stage: "voucher_sent",
      depositPaid: true,
      totalPaid: 25000,
    })

    expect(plan.targetStage).toBe("deposit_requested")
    expect(plan.keepsDeposit).toBe(true)
    expect(plan.clearedFields).toEqual(
      expect.arrayContaining(["deposit_paid_at", "final_paid_at", "voucher_sent_at"]),
    )
    expect(plan.clearedFields).not.toContain("deposit_paid")
    expect(plan.clearedFields).not.toContain("invoice_balance")
    expect(plan.summary.join(" ")).toContain("Payments already received are kept")
  })

  it("flags farAlong once the booking reached Paid in Full or later", () => {
    const voucherSent = planRevisionReset({
      ...base,
      stage: "voucher_sent",
      depositPaid: true,
      totalPaid: 97000,
    })
    expect(voucherSent.farAlong).toBe(true)
    expect(voucherSent.summary.join(" ")).toContain("already reached")

    const finalPaid = planRevisionReset({ ...base, stage: "final_paid", totalPaid: 97000 })
    expect(finalPaid.farAlong).toBe(true)

    const depositPaid = planRevisionReset({ ...base, stage: "deposit_paid", totalPaid: 25000 })
    expect(depositPaid.farAlong).toBe(false)
    expect(depositPaid.summary.join(" ")).not.toContain("already reached")
  })

  it("treats any recorded payment as a deposit floor even when the flag is false", () => {
    const plan = planRevisionReset({ ...base, stage: "deposit_paid", totalPaid: 100 })

    expect(plan.targetStage).toBe("deposit_requested")
    expect(plan.keepsDeposit).toBe(true)
  })

  it("clears an auto-set Won outcome", () => {
    const plan = planRevisionReset({ ...base, stage: "voucher_sent", outcome: "Won" })

    expect(plan.clearedFields).toEqual(expect.arrayContaining(["outcome", "outcome_set_at"]))
  })

  it("is a no-op for a booking already at the floor", () => {
    const plan = planRevisionReset({ ...base, stage: "enquiry" })

    expect(plan.changesStage).toBe(false)
    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toEqual([])
    expect(plan.summary[0]).toContain("stays at Enquiry")
  })

  it("leaves off-ladder stages alone", () => {
    const plan = planRevisionReset({ ...base, stage: "lost" })

    expect(plan.changesStage).toBe(false)
    expect(plan.targetStage).toBe("lost")
  })

  it("canonicalises legacy stage aliases", () => {
    const plan = planRevisionReset({ ...base, stage: "payment_schedule" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toContain("deposit_requested_at")
  })

  it("always voids unpaid invoices and supersedes the parent quote", () => {
    const plan = planRevisionReset({ ...base, stage: "accepted" })

    expect(plan.voidsInvoices).toBe(true)
    expect(plan.summary.join(" ")).toContain("Superseded")
  })
})

interface FakeOperation {
  table: string
  action: "update" | "insert"
  payload: unknown
}

class FakeQuery {
  constructor(private readonly result: unknown) {}
  eq(): FakeQuery {
    return this
  }
  in(): FakeQuery {
    return this
  }
  select(): FakeQuery {
    return this
  }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.result, error: null }).then(onfulfilled, onrejected)
  }
}

function createFakeSupabase(responses: { voided: Array<{ id: string }>; reopened: Array<{ id: string }> }) {
  const operations: FakeOperation[] = []
  const client = {
    from(table: string) {
      return {
        update(payload: unknown) {
          operations.push({ table, action: "update", payload })
          if (table === "invoices") {
            const status = (payload as { status?: string }).status
            if (status === "void") return new FakeQuery(responses.voided)
            if (status === "sent") return new FakeQuery(responses.reopened)
          }
          return new FakeQuery(null)
        },
        insert(payload: unknown) {
          operations.push({ table, action: "insert", payload })
          return new FakeQuery(null)
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  return { client, operations }
}

describe("applyRevisionReset", () => {
  it("reopens paid final/full invoices instead of voiding them", async () => {
    const { client, operations } = createFakeSupabase({
      voided: [{ id: "inv-draft-1" }],
      reopened: [{ id: "inv-final-1" }],
    })
    const plan = planRevisionReset({
      stage: "voucher_sent",
      depositPaid: true,
      totalPaid: 97000,
      outcome: "Open",
    })

    const result = await applyRevisionReset(client, {
      bookingId: "booking-1",
      parentQuoteId: "quote-1",
      plan,
      fromStage: "voucher_sent",
      actorName: "Douwlien",
      actorUserId: "user-1",
      now: new Date("2026-07-24T00:00:00.000Z"),
    })

    expect(result.voidedInvoiceIds).toEqual(["inv-draft-1"])
    expect(result.reopenedInvoiceIds).toEqual(["inv-final-1"])

    const reopenOp = operations.find(
      (op) => op.table === "invoices" && (op.payload as { status?: string }).status === "sent",
    )
    expect(reopenOp).toBeDefined()

    const auditOp = operations.find((op) => op.table === "audit_logs")
    expect(auditOp?.payload).toEqual(
      expect.objectContaining({
        action: "quote_revision_reset",
        after_json: expect.objectContaining({ reopened_invoice_ids: ["inv-final-1"] }),
      }),
    )
  })
})
