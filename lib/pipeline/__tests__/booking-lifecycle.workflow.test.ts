import { describe, expect, it, vi } from "vitest"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import { applyTransition } from "../apply-transition"
import { validateTransition } from "../validate-transition"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const DEPOSIT_INVOICE_ID = "00000000-0000-4000-8000-000000000002"
const FINAL_INVOICE_ID = "00000000-0000-4000-8000-000000000003"

const customer = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.test",
  phone: "+27110000000",
  country: "South Africa",
}

function createPaymentSupabase() {
  const bookingUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }))
  const invoiceUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }))

  return {
    bookingUpdate,
    invoiceUpdate,
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "quotes") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: {
                          id: "quote-1",
                          total: 1000,
                          status: "accepted",
                          created_at: "2026-05-01T00:00:00.000Z",
                        },
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          }
        }

        if (table === "payments") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ amount: 250 }, { amount: 750 }],
                error: null,
              })),
            })),
          }
        }

        if (table === "invoices") {
          return {
            select: vi.fn(() => {
              let capturedKind: string | undefined
              const makeEq = (depth: number): ReturnType<typeof vi.fn> =>
                vi.fn((_column: string, value?: string) => {
                  if (depth === 1 && value === "deposit") capturedKind = "deposit"
                  if (depth === 1 && value === "final") capturedKind = "final"
                  return {
                    eq: makeEq(depth + 1),
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(() => ({
                          maybeSingle: vi.fn(async () => {
                            if (capturedKind === "deposit") {
                              return {
                                data: { id: DEPOSIT_INVOICE_ID, amount: 250, status: "sent" },
                                error: null,
                              }
                            }
                            return {
                              data: { id: FINAL_INVOICE_ID, status: "sent" },
                              error: null,
                            }
                          }),
                        })),
                      })),
                    })),
                  }
                })
              return { eq: makeEq(0) }
            }),
            update: invoiceUpdate,
          }
        }

        if (table === "bookings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { deposit_paid: false, deposit_paid_at: null },
                  error: null,
                })),
              })),
            })),
            update: bookingUpdate,
          }
        }

        if (table === "audit_logs") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
}

interface TransitionOperation {
  table: string
  action: "update" | "insert"
  payload: unknown
  filters: Record<string, unknown>
}

function createTransitionSupabase(updatedRow: unknown) {
  const operations: TransitionOperation[] = []

  function createQuery(operation: TransitionOperation) {
    const query = {
      eq(column: string, value: unknown) {
        operation.filters[column] = value
        return query
      },
      select() {
        return query
      },
      single() {
        return Promise.resolve({ data: updatedRow, error: null })
      },
      then<TResult1 = { data: null; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected)
      },
    }
    return query
  }

  function createSelectQuery(data: unknown[]) {
    const query = {
      eq() {
        return query
      },
      in() {
        return query
      },
      not() {
        return query
      },
      then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
      },
    }
    return query
  }

  return {
    operations,
    supabase: {
      from(table: string) {
        return {
          select() {
            return createSelectQuery(
              table === "bookings" ? [{ departure_date: "2026-06-01" }] : [],
            )
          },
          update(payload: unknown) {
            const operation = { table, action: "update" as const, payload, filters: {} }
            operations.push(operation)
            return createQuery(operation)
          },
          insert(payload: unknown) {
            const operation = { table, action: "insert" as const, payload, filters: {} }
            operations.push(operation)
            return createQuery(operation)
          },
        }
      },
    },
  }
}

describe("booking lifecycle workflow regression", () => {
  it("keeps the happy path gates open from enquiry through closed", async () => {
    expect(
      validateTransition({
        booking: {
          id: BOOKING_ID,
          stage: "enquiry",
          source: "email",
          email_import_needs_review: true,
          email_import_review_resolved_at: null,
        },
        customer,
        targetStage: "quote_sent",
        quotes: [{ status: "sent", total: 1000 }],
      }).map((failure) => failure.gateId),
    ).toEqual(["email_import_review"])

    expect(
      validateTransition({
        booking: {
          id: BOOKING_ID,
          stage: "enquiry",
          source: "email",
          email_import_needs_review: true,
          email_import_review_resolved_at: "2026-05-13T10:00:00.000Z",
        },
        customer,
        targetStage: "quote_sent",
        quotes: [{ status: "sent", total: 1000 }],
      }),
    ).toEqual([])

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "quote_sent", source: "web_form" },
        customer,
        targetStage: "accepted",
        quotes: [{ status: "sent", total: 1000 }],
      }),
    ).toEqual([])

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "accepted", source: "web_form" },
        customer,
        targetStage: "deposit_requested",
        quotes: [{ status: "accepted", total: 1000 }],
        invoices: [{ kind: "deposit", status: "sent" }],
        correspondences: [{ kind: "invoice", subject: "Deposit invoice BT-2026-0001", status: "sent" }],
      }),
    ).toEqual([])

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "deposit_requested", source: "web_form" },
        customer,
        targetStage: "deposit_paid",
        manualConfirmations: { depositReceived: true },
      }),
    ).toEqual([])

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "deposit_paid", source: "web_form" },
        customer,
        targetStage: "final_paid",
        quotes: [{ status: "accepted", total: 1000 }],
        invoices: [{ kind: "final", status: "sent" }],
        correspondences: [{ kind: "invoice", subject: "Final invoice BT-2026-0001-FIN1", status: "sent" }],
        manualConfirmations: { finalPaymentReceived: true },
      }),
    ).toEqual([])

    expect(
      validateTransition({
        booking: {
          id: BOOKING_ID,
          stage: "final_paid",
          source: "web_form",
        },
        customer,
        targetStage: "voucher_sent",
        documents: [{ kind: "voucher_pdf", status: "generated" }],
        correspondences: [{ kind: "voucher", subject: "Travel voucher BT-2026-0001", status: "sent" }],
      }),
    ).toEqual([])

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "voucher_sent", source: "web_form" },
        customer,
        targetStage: "closed",
      }),
    ).toEqual([])
  })

  it("derives full payment state and voucher readiness from payments", async () => {
    const { supabase, bookingUpdate, invoiceUpdate } = createPaymentSupabase()

    const balance = await calculateInvoiceBalance(supabase as never, BOOKING_ID)
    expect(balance).toMatchObject({ quoteTotal: 1000, totalPaid: 1000, balance: 0 })

    const syncResult = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(syncResult).toMatchObject({ totalPaid: 1000, depositPaid: true, invoiceBalance: 0 })
    expect(bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deposit_paid: true, invoice_balance: 0 }),
    )
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "paid" }))

    expect(
      checkVoucherReadiness({
        stage: "final_paid",
        invoiceBalance: syncResult?.invoiceBalance ?? null,
        departureDate: "2026-06-01",
        customerEmail: "ada@example.test",
      }),
    ).toEqual({ ready: true, failures: [] })
  })

  it("applies voucher sent and closed side effects", async () => {
    const now = new Date("2026-05-13T10:00:00.000Z")
    const { supabase, operations } = createTransitionSupabase({
      id: BOOKING_ID,
      stage: "voucher_sent",
    })

    await applyTransition(supabase as never, {
      booking: {
        id: BOOKING_ID,
        booking_number: "BT-2026-0001",
        stage: "final_paid",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-13T09:00:00.000Z",
        customer_id: "customer-1",
        consultant: "LB",
      },
      departureDate: "2026-06-01",
      durationNights: 3,
      targetStage: "voucher_sent",
      actorName: "Leonie",
      actorUserId: "user-1",
      now,
    })

    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "documents",
        action: "update",
        payload: expect.objectContaining({ status: "sent" }),
        filters: expect.objectContaining({ booking_id: BOOKING_ID, kind: "voucher_pdf" }),
      }),
    )
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "customers",
        action: "update",
        payload: {
          first_travel_date: "2026-06-01",
          last_travel_date: "2026-06-01",
        },
      }),
    )

    const closing = createTransitionSupabase({ id: BOOKING_ID, stage: "closed" })
    await applyTransition(closing.supabase as never, {
      booking: {
        id: BOOKING_ID,
        booking_number: "BT-2026-0001",
        stage: "voucher_sent",
        source: "web_form",
        raw_text: null,
        updated_at: "2026-05-13T09:00:00.000Z",
        customer_id: "customer-1",
        consultant: "LB",
      },
      targetStage: "closed",
      actorName: "system",
      actorUserId: null,
      now,
    })

    expect(closing.operations[0]).toEqual(
      expect.objectContaining({
        table: "bookings",
        payload: expect.objectContaining({ stage: "closed", closed_at: now.toISOString() }),
      }),
    )
  })

  it("fails loudly for important blocked lifecycle moves", () => {
    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "quote_sent", source: "web_form" },
        customer,
        targetStage: "accepted",
        quotes: [],
      }).map((failure) => failure.gateId),
    ).toEqual(["quote_sent_or_accepted"])

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "deposit_requested", source: "web_form" },
        customer,
        targetStage: "deposit_paid",
      }),
    ).toContainEqual(expect.objectContaining({ gateId: "deposit_received_confirmation" }))

    expect(
      validateTransition({
        booking: { id: BOOKING_ID, stage: "deposit_paid", source: "web_form" },
        customer,
        targetStage: "final_paid",
        quotes: [{ status: "accepted", total: 1000 }],
        invoices: [{ kind: "final", status: "sent" }],
        correspondences: [{ kind: "invoice", subject: "Final invoice BT-2026-0001-FIN1", status: "sent" }],
      }),
    ).toContainEqual(expect.objectContaining({ gateId: "final_payment_confirmation" }))

    expect(
      checkVoucherReadiness({
        stage: "final_paid",
        invoiceBalance: 500,
        departureDate: "2026-06-01",
        customerEmail: "ada@example.test",
      }).failures,
    ).toContainEqual(expect.objectContaining({ code: "balance_not_zero" }))
  })
})
