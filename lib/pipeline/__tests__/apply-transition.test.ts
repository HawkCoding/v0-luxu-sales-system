import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/types"
import { applyTransition } from "../apply-transition"

interface Operation {
  table: string
  action: "update" | "insert"
  payload: unknown
  filters: Record<string, unknown>
}

class FakeQuery {
  private filters: Record<string, unknown> = {}
  private returnsSingle = false

  constructor(
    private readonly operation: Operation,
    private readonly updatedRow: unknown,
  ) {}

  eq(column: string, value: unknown): FakeQuery {
    this.filters[column] = value
    this.operation.filters = this.filters
    return this
  }

  select(): FakeQuery {
    return this
  }

  single(): FakeQuery {
    this.returnsSingle = true
    return this
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const value = {
      data: this.returnsSingle ? this.updatedRow : null,
      error: null,
    }

    return Promise.resolve(value).then(onfulfilled, onrejected)
  }
}

function createFakeSupabase(updatedRow: unknown): {
  client: SupabaseClient<Database>
  operations: Operation[]
} {
  const operations: Operation[] = []
  const client = {
    from(table: string) {
      return {
        update(payload: unknown) {
          const operation: Operation = { table, action: "update", payload, filters: {} }
          operations.push(operation)
          return new FakeQuery(operation, updatedRow)
        },
        insert(payload: unknown) {
          const operation: Operation = { table, action: "insert", payload, filters: {} }
          operations.push(operation)
          return new FakeQuery(operation, updatedRow)
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  return { client, operations }
}

describe("applyTransition", () => {
  it("stamps intermediate forward stages when skipping", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z")
    const updatedRow = {
      id: "booking-1",
      stage: "final_paid",
      invoice_balance: 0,
    }
    const { client, operations } = createFakeSupabase(updatedRow)

    await applyTransition(client, {
      booking: {
        id: "booking-1",
        booking_number: "BT-2026-0001",
        stage: "enquiry",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-1",
        consultant: "DR",
      },
      targetStage: "final_paid",
      actorName: "Douwlien",
      actorUserId: "user-1",
      manualConfirmations: {
        createDepositInvoice: true,
        depositReceived: true,
        finalPaymentReceived: true,
      },
      quotes: [{ id: "quote-1", status: "sent", total: 1000, created_at: "2026-05-01T08:00:00.000Z" }],
      documents: [],
      correspondences: [],
      now,
    })

    expect(operations[0]).toEqual(
      expect.objectContaining({
        table: "bookings",
        action: "update",
        payload: expect.objectContaining({
          quote_sent_at: now.toISOString(),
          accepted_at: now.toISOString(),
          deposit_requested_at: now.toISOString(),
          deposit_paid_at: now.toISOString(),
          final_paid_at: now.toISOString(),
          deposit_paid: true,
          invoice_balance: 0,
          stage: "final_paid",
        }),
      }),
    )
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "quotes",
        action: "update",
        payload: expect.objectContaining({ status: "accepted" }),
      }),
    )
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "documents",
        action: "insert",
        payload: expect.objectContaining({ kind: "invoice_pdf", status: "generated" }),
      }),
    )
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "correspondences",
        action: "insert",
        payload: expect.objectContaining({ kind: "invoice", status: "scheduled" }),
      }),
    )
  })

  it("allows cron-style closing without running validation", async () => {
    const now = new Date("2026-05-01T03:00:00.000Z")
    const { client, operations } = createFakeSupabase({
      id: "booking-2",
      stage: "closed",
      invoice_balance: 0,
    })

    const result = await applyTransition(client, {
      booking: {
        id: "booking-2",
        booking_number: "BT-2026-0002",
        stage: "voucher_sent",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-04-30T09:00:00.000Z",
        customer_id: "customer-2",
        consultant: "MVE",
      },
      targetStage: "closed",
      actorName: "system_cron",
      actorUserId: null,
      now,
    })

    expect(result.crossedStages).toEqual(["closed"])
    expect(operations[0]?.payload).toEqual(
      expect.objectContaining({
        closed_at: now.toISOString(),
        stage: "closed",
      }),
    )
  })

  it("schedules deposit correspondence when an invoice document already exists", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z")
    const { client, operations } = createFakeSupabase({
      id: "booking-3",
      stage: "deposit_requested",
      invoice_balance: null,
    })

    const result = await applyTransition(client, {
      booking: {
        id: "booking-3",
        booking_number: "BT-2026-0003",
        stage: "accepted",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-3",
        consultant: "DR",
      },
      targetStage: "deposit_requested",
      actorName: "Douwlien",
      actorUserId: "user-1",
      manualConfirmations: {
        createInvoiceCorrespondence: true,
      },
      quotes: [{ id: "quote-3", status: "accepted", total: 1234.56, created_at: "2026-05-01T08:00:00.000Z" }],
      documents: [{ id: "document-3", kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
      now,
    })

    expect(result.scheduledDepositCorrespondence).toBe(true)
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "correspondences",
        action: "insert",
        payload: expect.objectContaining({
          booking_id: "booking-3",
          kind: "invoice",
          status: "scheduled",
          body_html: expect.stringContaining("308.64"),
        }),
      }),
    )
  })
})
