import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))
vi.mock("@/lib/role-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/role-utils")>()),
  extractRoleFromJwt: vi.fn(() => null),
}))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: vi.fn(async () => {}) }))
vi.mock("@/lib/invoices/sync-booking-payment-state", () => ({
  syncBookingPaymentState: vi.fn(async () => ({ totalPaid: 0, depositPaid: false, invoiceBalance: 0 })),
}))

import { POST } from "./route"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const REASON_ID = "00000000-0000-0000-aa01-000000000005"
const OTHER_REASON_ID = "00000000-0000-0000-aa01-000000000006"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

function postJson(body: unknown) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

interface MockOptions {
  user?: { id: string; email: string } | null
  role?: string
  bookingStage?: string
  bookingOwnerId?: string | null
  assignedSalespersonId?: string | null
  bookingOutcome?: string
  reason?: { id: string; label: string; applies_to: string; active: boolean } | null
  updateResult?: { data: unknown; error: unknown }
  totalPaid?: number
  depositInvoiceAmount?: number
  fullInvoiceAmount?: number
  depositRefundable?: boolean
  defaultDepositPercentage?: number
}

function createSupabaseMock(opts: MockOptions = {}) {
  const {
    user = { id: USER_ID, email: "test@example.com" },
    role = "consultant",
    bookingStage = "enquiry",
    bookingOwnerId = USER_ID,
    assignedSalespersonId = null,
    bookingOutcome = "Open",
    reason = { id: REASON_ID, label: "Customer cancelled", applies_to: "Cancelled", active: true },
    updateResult = { data: { id: BOOKING_ID, booking_number: "BT-2026-0001", stage: "lost", updated_at: "2026-05-17T10:00:00Z" }, error: null },
    totalPaid = 0,
    depositInvoiceAmount = 0,
    fullInvoiceAmount = 0,
    depositRefundable = false,
    defaultDepositPercentage = 25,
  } = opts

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: user ? null : { message: "No user" } })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { name: "Test", surname: "User", email: "test@example.com", clearance_level: role },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  booking_number: "BT-2026-0001",
                  stage: bookingStage,
                  owner_user_id: bookingOwnerId,
                  assigned_salesperson_id: assignedSalespersonId,
                  outcome: bookingOutcome,
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => updateResult),
              })),
            })),
          })),
        }
      }
      if (table === "outcome_reasons") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: reason, error: null })),
            })),
          })),
        }
      }
      if (table === "pipeline_history") {
        return { insert: vi.fn(async () => ({ error: null })) }
      }
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, key?: string) => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  key === "default_deposit_percentage"
                    ? { value: String(defaultDepositPercentage) }
                    : { value: depositRefundable ? "true" : "false" },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "payments") {
        const paymentsData = totalPaid > 0 ? [{ amount: totalPaid }] : []
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: paymentsData, error: null })),
          })),
          insert: vi.fn(async () => ({ data: null, error: null })),
        }
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn((_col: string, kind?: string) => {
                const invoiceData =
                  kind === "full"
                    ? fullInvoiceAmount > 0
                      ? { amount: fullInvoiceAmount }
                      : null
                    : depositInvoiceAmount > 0
                      ? { amount: depositInvoiceAmount }
                      : null
                return {
                  in: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: invoiceData, error: null })),
                      })),
                    })),
                  })),
                }
              }),
            })),
          })),
        }
      }
      return {}
    }),
  }

  supabaseMocks.createSessionClient.mockResolvedValue(supabase)
  return supabase
}

describe("POST /api/jobs/[id]/cancel", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    createSupabaseMock({ user: null })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 403 for a retired or unrecognised clearance level", async () => {
    createSupabaseMock({ role: "readonly" })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 404 when booking not found", async () => {
    const supabase = createSupabaseMock()
    supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { name: "Test", surname: "User", email: "test@example.com", clearance_level: "manager" }, error: null })),
            })),
          })),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }
      return {}
    })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 400 for missing outcomeReasonId", async () => {
    createSupabaseMock()
    const res = await POST(postJson({}), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 400 when reason does not apply to Cancelled", async () => {
    createSupabaseMock({
      role: "manager",
      reason: { id: OTHER_REASON_ID, label: "Price too high", applies_to: "Lost", active: true },
    })
    const res = await POST(postJson({ outcomeReasonId: OTHER_REASON_ID }), makeParams())
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/does not apply to Cancelled/i)
  })

  it("returns 400 when reason is inactive", async () => {
    createSupabaseMock({
      role: "manager",
      reason: { id: REASON_ID, label: "Customer cancelled", applies_to: "Cancelled", active: false },
    })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 400 when reason is Other but notes are empty", async () => {
    createSupabaseMock({
      role: "manager",
      reason: { id: REASON_ID, label: "Other", applies_to: "Cancelled", active: true },
    })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID, outcomeNotes: "  " }), makeParams())
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Notes are required/i)
  })

  it("returns 400 when stage requires refund capture but refundStatus missing", async () => {
    createSupabaseMock({ role: "manager", bookingStage: "deposit_paid" })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/refundStatus is required/i)
  })

  it("returns 403 when consultant tries to cancel another user's booking", async () => {
    createSupabaseMock({ role: "consultant", bookingOwnerId: OTHER_USER_ID, assignedSalespersonId: null })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 200 when consultant cancels own booking (owner match)", async () => {
    createSupabaseMock({ role: "consultant", bookingOwnerId: USER_ID })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it("returns 200 when consultant cancels booking where they are assigned salesperson", async () => {
    createSupabaseMock({ role: "consultant", bookingOwnerId: OTHER_USER_ID, assignedSalespersonId: USER_ID })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(200)
  })

  it("returns 200 when manager cancels any booking", async () => {
    createSupabaseMock({ role: "manager", bookingOwnerId: OTHER_USER_ID })
    const res = await POST(postJson({ outcomeReasonId: REASON_ID }), makeParams())
    expect(res.status).toBe(200)
  })

  it("returns 200 with full refund fields persisted for deposit_paid stage", async () => {
    createSupabaseMock({ role: "manager", bookingStage: "deposit_paid" })
    const res = await POST(
      postJson({
        outcomeReasonId: REASON_ID,
        refundStatus: "refunded",
        refundAmount: 500,
        refundReference: "REF-001",
        refundedAt: "2026-05-17",
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it("returns 200 for Other reason with valid notes", async () => {
    createSupabaseMock({
      role: "manager",
      reason: { id: REASON_ID, label: "Other", applies_to: "Both", active: true },
    })
    const res = await POST(
      postJson({ outcomeReasonId: REASON_ID, outcomeNotes: "Custom reason here" }),
      makeParams(),
    )
    expect(res.status).toBe(200)
  })

  it("calculates forfeit-deposit refund automatically when no refundAmount override is given", async () => {
    // totalPaid=5000, depositAmount=2000, depositRefundable=false → fee=2000, suggestedRefund=3000
    createSupabaseMock({
      role: "manager",
      bookingStage: "deposit_paid",
      totalPaid: 5000,
      depositInvoiceAmount: 2000,
      depositRefundable: false,
    })

    const res = await POST(
      postJson({ outcomeReasonId: REASON_ID, refundStatus: "refunded" }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // syncBookingPaymentState is called only when finalRefundAmount > 0 (3000 in this case)
    expect(vi.mocked(syncBookingPaymentState)).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      expect.objectContaining({ actorUserId: USER_ID }),
    )
  })

  it("suggests a notional deposit-percentage cancellation fee when only a full-payment invoice exists", async () => {
    // totalPaid=10000, fullInvoiceAmount=10000, no separate deposit invoice, default 25%
    // → notional fee = 2500, suggestedRefund = 7500
    createSupabaseMock({
      role: "manager",
      bookingStage: "deposit_paid",
      totalPaid: 10000,
      depositInvoiceAmount: 0,
      fullInvoiceAmount: 10000,
      depositRefundable: false,
      defaultDepositPercentage: 25,
    })

    const res = await POST(
      postJson({ outcomeReasonId: REASON_ID, refundStatus: "refunded" }),
      makeParams(),
    )
    expect(res.status).toBe(200)

    expect(vi.mocked(syncBookingPaymentState)).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      expect.objectContaining({ actorUserId: USER_ID }),
    )
  })

  it("inserts negative payment row using consultant refundAmount override and calls sync", async () => {
    createSupabaseMock({
      role: "manager",
      bookingStage: "deposit_paid",
      totalPaid: 5000,
      depositInvoiceAmount: 2000,
      depositRefundable: false,
    })

    const res = await POST(
      postJson({
        outcomeReasonId: REASON_ID,
        refundStatus: "refunded",
        refundAmount: 1500,  // explicit override — lower than calculated 3000
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Override is > 0, so sync should still be called
    expect(vi.mocked(syncBookingPaymentState)).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      expect.objectContaining({ actorUserId: USER_ID }),
    )
  })
})
