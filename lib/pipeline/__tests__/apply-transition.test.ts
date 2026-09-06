import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import type { Database } from "@/lib/supabase/types"

const EMPTY_BANKING = {
  bank_name: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_branch_code: "",
  bank_swift_code: "",
  company_address: "",
  company_reg_number: "",
  company_vat_number: "",
  company_tel: "",
  company_cell: "",
  company_fax: "",
  company_email: "",
  company_website: "",
}

vi.mock("@/lib/settings-access", () => ({
  getBankingSettings: vi.fn(async () => EMPTY_BANKING),
}))

const composeMocks = vi.hoisted(() => ({
  composeEmail: vi.fn(async () => ({
    subject: "Deposit Invoice — BT-2026-0001",
    bodyHtml: "<html><p>deposit</p></html>",
    bodyContentHtml: "<p>deposit</p>",
    warnings: [],
  })),
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: composeMocks.composeEmail,
}))

vi.mock("@/lib/templates/resolve-shared-tokens", () => ({
  resolveSharedEmailTokens: vi.fn(async () => ({ tokens: {}, blocks: {} })),
}))

const syncMocks = vi.hoisted(() => ({
  syncBookingPaymentState: vi.fn(async () => null),
}))

vi.mock("@/lib/invoices/sync-booking-payment-state", () => ({
  syncBookingPaymentState: syncMocks.syncBookingPaymentState,
}))

import { applyTransition } from "../apply-transition"

interface Operation {
  table: string
  action: "update" | "insert" | "select"
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

  in(column: string, value: unknown): FakeQuery {
    this.filters[column] = value
    this.operation.filters = this.filters
    return this
  }

  not(column: string, operator: string, value: unknown): FakeQuery {
    this.filters[column] = { operator, value }
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

  maybeSingle(): FakeQuery {
    this.returnsSingle = true
    return this
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const value = {
      data: this.updatedRow,
      error: null,
    }

    return Promise.resolve(value).then(onfulfilled, onrejected)
  }
}

function createFakeSupabase(
  updatedRow: unknown,
  options: { completedBookings?: Array<{ departure_date: string | null }> } = {},
): {
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
        select() {
          const operation: Operation = { table, action: "select", payload: null, filters: {} }
          const result = table === "bookings" ? (options.completedBookings ?? []) : { value: "25" }
          return new FakeQuery(operation, result)
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
          deposit_confirmed_manually: true,
          stage: "final_paid",
        }),
      }),
    )
    // F-P1-8: invoice_balance is no longer forced to 0 by the transition itself -- it is derived
    // from actual payments by syncBookingPaymentState below. A fixture with no payments at all
    // must not see the booking's balance written to zero here.
    expect(operations[0]?.payload).not.toHaveProperty("invoice_balance")
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "quotes",
        action: "update",
        payload: expect.objectContaining({ status: "accepted" }),
      }),
    )
    // Crossing deposit_requested no longer fabricates an invoice document or a
    // draft deposit email — both belonged to the removed create_invoice_25pct
    // shortcut, and the gate is a hard block now.
    expect(operations).not.toContainEqual(
      expect.objectContaining({ table: "documents", action: "insert" }),
    )
    expect(operations).not.toContainEqual(
      expect.objectContaining({ table: "correspondences", action: "insert" }),
    )
    // Called once for the `accepted` crossing (promoting the sent quote) and once more for the
    // `final_paid` crossing (deriving the real balance) -- see apply-transition.ts.
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledTimes(2)
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledWith(
      client,
      "booking-1",
      expect.objectContaining({ actorName: "Douwlien", actorUserId: "user-1" }),
    )
  })

  it("derives the real balance instead of trusting the tick when crossing only final_paid", async () => {
    // F-P1-8 exact repro: a booking already at deposit_paid with a part payment on record moves to
    // final_paid. The gate (validate-transition.test.ts) is what refuses this while money is
    // outstanding; this test covers apply-transition's side of it -- once the gate is satisfied
    // (or overridden), the transition itself must never fabricate a zero balance.
    const now = new Date("2026-05-01T10:00:00.000Z")
    const updatedRow = { id: "booking-9", stage: "final_paid", invoice_balance: 52438.5 }
    const { client, operations } = createFakeSupabase(updatedRow)
    syncMocks.syncBookingPaymentState.mockClear()

    await applyTransition(client, {
      booking: {
        id: "booking-9",
        booking_number: "BT-2026-0034",
        stage: "deposit_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-9",
        consultant: "DR",
      },
      targetStage: "final_paid",
      actorName: "Douwlien",
      actorUserId: "user-1",
      manualConfirmations: { finalPaymentReceived: true },
      quotes: [{ id: "quote-9", status: "accepted", total: 174795, created_at: "2026-05-01T08:00:00.000Z" }],
      documents: [],
      correspondences: [],
      now,
    })

    expect(operations[0]).toEqual(
      expect.objectContaining({
        table: "bookings",
        action: "update",
        payload: expect.objectContaining({ final_paid_at: now.toISOString(), stage: "final_paid" }),
      }),
    )
    expect(operations[0]?.payload).not.toHaveProperty("invoice_balance")
    // No quote to promote (it is already accepted), so this is the only sync call, and it is what
    // actually derives invoice_balance from quotes/payments -- never a written zero.
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledTimes(1)
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledWith(
      client,
      "booking-9",
      expect.objectContaining({ actorName: "Douwlien", actorUserId: "user-1" }),
    )
  })

  it("does not resync payment state when the accepted stage isn't crossed", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z")
    const { client } = createFakeSupabase({
      id: "booking-bal",
      stage: "deposit_requested",
      invoice_balance: null,
    })

    syncMocks.syncBookingPaymentState.mockClear()

    await applyTransition(client, {
      booking: {
        id: "booking-bal",
        booking_number: "BT-2026-0009",
        stage: "accepted",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-bal",
        consultant: "DR",
      },
      targetStage: "deposit_requested",
      actorName: "Douwlien",
      actorUserId: "user-1",
      quotes: [{ id: "quote-bal", status: "accepted", total: 1234.56, created_at: "2026-05-01T08:00:00.000Z" }],
      documents: [{ id: "document-bal", kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
      now,
    })

    expect(syncMocks.syncBookingPaymentState).not.toHaveBeenCalled()
  })

  it("backfills invoice_balance from the accepted quote when the booking balance is unset", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z")
    const { client, operations } = createFakeSupabase({
      id: "booking-bal",
      stage: "deposit_requested",
      invoice_balance: null,
    })

    await applyTransition(client, {
      booking: {
        id: "booking-bal",
        booking_number: "BT-2026-0009",
        stage: "accepted",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-bal",
        consultant: "DR",
      },
      targetStage: "deposit_requested",
      actorName: "Douwlien",
      actorUserId: "user-1",
      quotes: [{ id: "quote-bal", status: "accepted", total: 1234.56, created_at: "2026-05-01T08:00:00.000Z" }],
      documents: [{ id: "document-bal", kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
      now,
    })

    const balanceUpdate = operations.find(
      (op) =>
        op.table === "bookings" &&
        op.action === "update" &&
        typeof op.payload === "object" &&
        op.payload !== null &&
        "invoice_balance" in (op.payload as Record<string, unknown>) &&
        Object.keys(op.payload as Record<string, unknown>).length === 1,
    )
    expect(balanceUpdate?.payload).toEqual({ invoice_balance: 1234.56 })
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

  it("creates no invoice document and drafts no deposit email when crossing deposit_requested", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z")
    const { client, operations } = createFakeSupabase({
      id: "booking-3",
      stage: "deposit_requested",
      invoice_balance: null,
    })

    await applyTransition(client, {
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
      quotes: [{ id: "quote-3", status: "accepted", total: 1234.56, created_at: "2026-05-01T08:00:00.000Z" }],
      documents: [{ id: "document-3", kind: "invoice_pdf", status: "generated" }],
      correspondences: [],
      now,
    })

    // The gate is a hard block cleared by a real invoice and a real send, so
    // by the time the transition runs there is nothing left for it to fabricate.
    expect(operations).not.toContainEqual(
      expect.objectContaining({ table: "correspondences", action: "insert" }),
    )
    expect(operations).not.toContainEqual(
      expect.objectContaining({ table: "documents", action: "insert" }),
    )
    expect(composeMocks.composeEmail).not.toHaveBeenCalled()
    // The balance seed is unrelated to the removed shortcut and stays.
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "bookings",
        action: "update",
        payload: expect.objectContaining({ invoice_balance: 1234.56 }),
      }),
    )
  })

  it("sets first and last travel date on first voucher sent", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z")
    const { client, operations } = createFakeSupabase(
      {
        id: "booking-4",
        stage: "voucher_sent",
      },
      { completedBookings: [{ departure_date: "2026-06-10" }] },
    )

    await applyTransition(client, {
      booking: {
        id: "booking-4",
        booking_number: "BT-2026-0004",
        stage: "final_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-4",
        consultant: "LB",
      },
      targetStage: "voucher_sent",
      actorName: "Leonie",
      actorUserId: "user-1",
      now,
    })

    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "customers",
        action: "update",
        payload: {
          first_travel_date: "2026-06-10",
          last_travel_date: "2026-06-10",
        },
        filters: expect.objectContaining({ id: "customer-4" }),
      }),
    )
  })

  it("moves first travel date back when an earlier second voucher is sent", async () => {
    const { client, operations } = createFakeSupabase(
      {
        id: "booking-5",
        stage: "voucher_sent",
      },
      {
        completedBookings: [
          { departure_date: "2026-07-01" },
          { departure_date: "2026-06-01" },
        ],
      },
    )

    await applyTransition(client, {
      booking: {
        id: "booking-5",
        booking_number: "BT-2026-0005",
        stage: "final_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-5",
        consultant: "LB",
      },
      targetStage: "voucher_sent",
      actorName: "Leonie",
      actorUserId: "user-1",
    })

    const customerOp = operations.find((op) => op.table === "customers" && op.action === "update")
    expect(customerOp).toBeDefined()
    expect(customerOp?.payload).toEqual({
      first_travel_date: "2026-06-01",
      last_travel_date: "2026-07-01",
    })
  })

  it("moves last travel date forward when a later second voucher is sent", async () => {
    const { client, operations } = createFakeSupabase(
      {
        id: "booking-6",
        stage: "voucher_sent",
      },
      {
        completedBookings: [
          { departure_date: "2026-06-01" },
          { departure_date: "2026-08-01" },
        ],
      },
    )

    await applyTransition(client, {
      booking: {
        id: "booking-6",
        booking_number: "BT-2026-0006",
        stage: "final_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-6",
        consultant: "LB",
      },
      targetStage: "voucher_sent",
      actorName: "Leonie",
      actorUserId: "user-1",
    })

    const customerOp = operations.find((op) => op.table === "customers" && op.action === "update")
    expect(customerOp?.payload).toEqual({
      first_travel_date: "2026-06-01",
      last_travel_date: "2026-08-01",
    })
  })

  it("excludes bookings with null departure dates from date calculations", async () => {
    const { client, operations } = createFakeSupabase(
      {
        id: "booking-7",
        stage: "voucher_sent",
      },
      {
        completedBookings: [
          { departure_date: null },
          { departure_date: "2026-07-15" },
        ],
      },
    )

    await applyTransition(client, {
      booking: {
        id: "booking-7",
        booking_number: "BT-2026-0007",
        stage: "final_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-7",
        consultant: "LB",
      },
      targetStage: "voucher_sent",
      actorName: "Leonie",
      actorUserId: "user-1",
    })

    const customerOp = operations.find((op) => op.table === "customers" && op.action === "update")
    expect(customerOp?.payload).toEqual({
      first_travel_date: "2026-07-15",
      last_travel_date: "2026-07-15",
    })
  })

  it("skips customer travel date update when no completed bookings have departure dates", async () => {
    const { client, operations } = createFakeSupabase(
      {
        id: "booking-8",
        stage: "voucher_sent",
      },
      { completedBookings: [] },
    )

    await applyTransition(client, {
      booking: {
        id: "booking-8",
        booking_number: "BT-2026-0008",
        stage: "final_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-01T09:00:00.000Z",
        customer_id: "customer-8",
        consultant: "LB",
      },
      targetStage: "voucher_sent",
      actorName: "Leonie",
      actorUserId: "user-1",
    })

    expect(operations.some((op) => op.table === "customers")).toBe(false)
  })
})
