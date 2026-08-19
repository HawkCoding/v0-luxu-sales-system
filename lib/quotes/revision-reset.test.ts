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
    expect(plan.farAlong).toBe(false)
    expect(plan.clearedFields).toEqual(
      expect.arrayContaining([
        "quote_sent_at",
        "accepted_at",
        "deposit_requested_at",
        "deposit_paid",
        "deposit_confirmed_manually",
        "invoice_balance",
        "reservation_form_received_at",
      ]),
    )
  })

  it("clears only the stages actually crossed", () => {
    const plan = planRevisionReset({ ...base, stage: "quote_sent" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toContain("quote_sent_at")
    expect(plan.clearedFields).not.toContain("accepted_at")
  })

  it("still rewinds to enquiry once the deposit is paid, but flags farAlong", () => {
    const plan = planRevisionReset({
      ...base,
      stage: "voucher_sent",
      depositPaid: true,
      totalPaid: 25000,
    })

    // Floor is always Enquiry now -- money received never props the reset up
    // at Quote Accepted. The payments themselves are kept (applyRevisionReset
    // never touches the `payments` table); only the derived flags are cleared.
    expect(plan.targetStage).toBe("enquiry")
    expect(plan.farAlong).toBe(true)
    expect(plan.clearedFields).toEqual(
      expect.arrayContaining([
        "deposit_requested_at",
        "deposit_paid_at",
        "final_paid_at",
        "voucher_sent_at",
        "deposit_paid",
        "deposit_confirmed_manually",
      ]),
    )
    expect(plan.summary.join(" ")).toContain("Payments already received are kept on record")
  })

  it("flags farAlong whenever any payment was recorded, not only past Paid in Full", () => {
    const voucherSent = planRevisionReset({
      ...base,
      stage: "voucher_sent",
      depositPaid: true,
      totalPaid: 97000,
    })
    expect(voucherSent.farAlong).toBe(true)

    const finalPaid = planRevisionReset({ ...base, stage: "final_paid", totalPaid: 97000 })
    expect(finalPaid.farAlong).toBe(true)

    const depositPaid = planRevisionReset({ ...base, stage: "deposit_paid", totalPaid: 25000 })
    expect(depositPaid.farAlong).toBe(true)

    const noMoney = planRevisionReset({ ...base, stage: "deposit_requested" })
    expect(noMoney.farAlong).toBe(false)
  })

  it("treats any recorded payment as farAlong even when the flag is false", () => {
    const plan = planRevisionReset({ ...base, stage: "deposit_paid", totalPaid: 100 })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.farAlong).toBe(true)
    expect(plan.clearedFields).toContain("deposit_paid_at")
  })

  it("lists the steps that have to be re-walked", () => {
    const plan = planRevisionReset({ ...base, stage: "deposit_requested" })

    const summary = plan.summary.join(" ")
    expect(summary).toContain("send the revised quote")
    expect(summary).toContain("Quote Accepted")
    expect(summary).toContain("Guest details, reservation details and supplier references are kept")
    expect(summary).toContain("reservation form must be received again")
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

  it("always voids every invoice and supersedes the parent quote", () => {
    const plan = planRevisionReset({ ...base, stage: "accepted" })

    expect(plan.voidsInvoices).toBe(true)
    expect(plan.summary.join(" ")).toContain("Superseded")
  })
})

interface FakeOperation {
  table: string
  action: "update" | "insert" | "select"
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
  maybeSingle(): Promise<{ data: unknown; error: null }> {
    const data = Array.isArray(this.result) ? (this.result[0] ?? null) : this.result
    return Promise.resolve({ data, error: null })
  }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.result, error: null }).then(onfulfilled, onrejected)
  }
}

function createFakeSupabase(responses: {
  bookingUpdate?: { id: string } | null
  voided: Array<{ id: string }>
  cancelledFollowUps?: Array<{ id: string }>
}) {
  const operations: FakeOperation[] = []
  const client = {
    from(table: string) {
      return {
        select() {
          operations.push({ table, action: "select", payload: null })
          return new FakeQuery(null)
        },
        update(payload: unknown) {
          operations.push({ table, action: "update", payload })
          if (table === "bookings") {
            return new FakeQuery("bookingUpdate" in responses ? responses.bookingUpdate : { id: "booking-1" })
          }
          if (table === "invoices") {
            return new FakeQuery(responses.voided)
          }
          if (table === "correspondences") {
            return new FakeQuery(responses.cancelledFollowUps ?? [])
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
  it("voids every invoice, cancels the scheduled follow-up, and writes pipeline_history + audit rows", async () => {
    const { client, operations } = createFakeSupabase({
      voided: [{ id: "inv-draft-1" }, { id: "inv-final-1" }],
      cancelledFollowUps: [{ id: "corr-1" }],
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
      expectedUpdatedAt: "2026-07-23T00:00:00.000Z",
      now: new Date("2026-07-24T00:00:00.000Z"),
    })

    expect(result.voidedInvoiceIds).toEqual(["inv-draft-1", "inv-final-1"])
    expect(result.cancelledFollowUpIds).toEqual(["corr-1"])
    expect(result.stageChanged).toBe(true)

    const invoiceVoidOp = operations.find(
      (op) => op.table === "invoices" && (op.payload as { status?: string }).status === "void",
    )
    expect(invoiceVoidOp).toBeDefined()

    const historyOp = operations.find((op) => op.table === "pipeline_history")
    expect(historyOp?.payload).toEqual(
      expect.objectContaining({ booking_id: "booking-1", from_stage: "voucher_sent", to_stage: "enquiry" }),
    )

    const auditOp = operations.find((op) => op.table === "audit_logs")
    expect(auditOp?.payload).toEqual(
      expect.objectContaining({
        action: "quote_revision_reset",
        after_json: expect.objectContaining({
          voided_invoice_ids: ["inv-draft-1", "inv-final-1"],
          cancelled_follow_up_ids: ["corr-1"],
        }),
      }),
    )
  })

  it("throws StaleTransitionError when the booking update finds no matching row", async () => {
    const { client } = createFakeSupabase({
      bookingUpdate: null,
      voided: [],
    })
    const plan = planRevisionReset({ ...base, stage: "deposit_requested" })

    await expect(
      applyRevisionReset(client, {
        bookingId: "booking-1",
        parentQuoteId: "quote-1",
        plan,
        fromStage: "deposit_requested",
        actorName: "Douwlien",
        actorUserId: "user-1",
        expectedUpdatedAt: "2026-07-23T00:00:00.000Z",
      }),
    ).rejects.toThrow("modified by another user")
  })
})
