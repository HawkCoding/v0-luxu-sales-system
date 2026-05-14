import { beforeEach, describe, expect, it, vi } from "vitest"
import { syncBookingPaymentState } from "./sync-booking-payment-state"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const DEPOSIT_INVOICE_ID = "00000000-0000-4000-8000-000000000002"
const FINAL_INVOICE_ID = "00000000-0000-4000-8000-000000000003"

function makeSupabase({
  quote = { total: 10000 },
  payments = [] as { amount: number }[],
  depositInvoice = null as { id: string; amount: number; status: string } | null,
  finalInvoice = null as { id: string; status: string } | null,
  currentBooking = { deposit_paid: false, deposit_paid_at: null as string | null },
  bookingUpdateError = null as Error | null,
  invoiceUpdateError = null as Error | null,
} = {}) {
  const bookingUpdate = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: bookingUpdateError })),
  }))
  const invoiceUpdate = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: invoiceUpdateError })),
  }))
  const auditInsert = vi.fn(async () => ({ error: null }))

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "quotes") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(async () =>
                        quote ? { data: quote, error: null } : { data: null, error: null },
                      ),
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
              eq: vi.fn(async () => ({ data: payments, error: null })),
            })),
          }
        }
        if (table === "invoices") {
          return {
            select: vi.fn(() => {
              // Track which "kind" eq is called with to route to deposit vs final result
              let capturedKind: string | undefined
              const makeEq = (depth: number): ReturnType<typeof vi.fn> =>
                vi.fn((_col: string, val?: string) => {
                  if (depth === 1 && val === "deposit") capturedKind = "deposit"
                  if (depth === 1 && val === "final") capturedKind = "final"
                  return {
                    eq: makeEq(depth + 1),
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(() => ({
                          maybeSingle: vi.fn(async () => {
                            if (capturedKind === "deposit") {
                              return depositInvoice
                                ? { data: depositInvoice, error: null }
                                : { data: null, error: null }
                            }
                            return finalInvoice
                              ? { data: finalInvoice, error: null }
                              : { data: null, error: null }
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
                single: vi.fn(async () => ({ data: currentBooking, error: null })),
              })),
            })),
            update: bookingUpdate,
          }
        }
        if (table === "audit_logs") {
          return { insert: auditInsert }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    },
    bookingUpdate,
    invoiceUpdate,
    auditInsert,
  }
}

describe("syncBookingPaymentState", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns null and skips updates when no accepted quote exists", async () => {
    const { supabase, bookingUpdate } = makeSupabase({ quote: null as unknown as { total: number } })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result).toBeNull()
    expect(bookingUpdate).not.toHaveBeenCalled()
  })

  it("returns null when quote total is zero", async () => {
    const { supabase, bookingUpdate } = makeSupabase({ quote: { total: 0 } })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result).toBeNull()
    expect(bookingUpdate).not.toHaveBeenCalled()
  })

  it("computes correct balance with no payments", async () => {
    const { supabase, bookingUpdate } = makeSupabase({
      quote: { total: 10000 },
      payments: [],
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result).toMatchObject({ totalPaid: 0, depositPaid: false, invoiceBalance: 10000 })
    expect(bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_balance: 10000, deposit_paid: false }),
    )
  })

  it("sets deposit_paid false when payments do not cover deposit threshold", async () => {
    const { supabase } = makeSupabase({
      payments: [{ amount: 1000 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "sent" },
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result?.depositPaid).toBe(false)
    expect(result?.invoiceBalance).toBe(9000)
  })

  it("sets deposit_paid true when payments exactly cover deposit threshold", async () => {
    const { supabase, invoiceUpdate, auditInsert } = makeSupabase({
      payments: [{ amount: 2500 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "sent" },
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result?.depositPaid).toBe(true)
    expect(result?.invoiceBalance).toBe(7500)
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deposit_marked_paid", entity_id: BOOKING_ID }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "booking_confirmed", entity_id: BOOKING_ID }),
    )
  })

  it("marks deposit invoice paid on first coverage, not again when already paid", async () => {
    const { supabase, invoiceUpdate } = makeSupabase({
      payments: [{ amount: 2500 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "paid" },
    })
    await syncBookingPaymentState(supabase as never, BOOKING_ID)
    // invoiceUpdate not called since status is already 'paid'
    expect(invoiceUpdate).not.toHaveBeenCalled()
  })

  it("marks final invoice paid when invoice_balance reaches zero", async () => {
    const { supabase, invoiceUpdate, auditInsert } = makeSupabase({
      payments: [{ amount: 10000 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "paid" },
      finalInvoice: { id: FINAL_INVOICE_ID, status: "sent" },
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result?.invoiceBalance).toBe(0)
    // Should update final invoice status to paid
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "invoice_marked_paid", entity_id: BOOKING_ID }),
    )
  })

  it("handles overpayment — balance floors at zero", async () => {
    const { supabase } = makeSupabase({
      payments: [{ amount: 12000 }],
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result?.invoiceBalance).toBe(0)
  })

  it("sums multiple partial payments correctly", async () => {
    const { supabase } = makeSupabase({
      payments: [{ amount: 1000 }, { amount: 1500 }, { amount: 500 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "sent" },
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result?.totalPaid).toBe(3000)
    expect(result?.depositPaid).toBe(true)
    expect(result?.invoiceBalance).toBe(7000)
  })

  it("sets deposit_paid_at only when deposit first becomes paid", async () => {
    const { supabase, bookingUpdate } = makeSupabase({
      payments: [{ amount: 2500 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "sent" },
      currentBooking: { deposit_paid: false, deposit_paid_at: null },
    })
    await syncBookingPaymentState(supabase as never, BOOKING_ID)
    const updateCall = (bookingUpdate.mock.calls as unknown[][])[0][0] as Record<string, unknown>
    expect(updateCall.deposit_paid_at).toBeDefined()
  })

  it("does not overwrite deposit_paid_at when already paid", async () => {
    const { supabase, bookingUpdate } = makeSupabase({
      payments: [{ amount: 2500 }],
      depositInvoice: { id: DEPOSIT_INVOICE_ID, amount: 2500, status: "paid" },
      currentBooking: { deposit_paid: true, deposit_paid_at: "2026-01-01T00:00:00Z" },
    })
    await syncBookingPaymentState(supabase as never, BOOKING_ID)
    const updateCall = (bookingUpdate.mock.calls as unknown[][])[0][0] as Record<string, unknown>
    expect(updateCall.deposit_paid_at).toBeUndefined()
  })

  it("does not set deposit_paid when no deposit invoice exists", async () => {
    const { supabase } = makeSupabase({
      payments: [{ amount: 5000 }],
      depositInvoice: null,
    })
    const result = await syncBookingPaymentState(supabase as never, BOOKING_ID)
    expect(result?.depositPaid).toBe(false)
  })
})
