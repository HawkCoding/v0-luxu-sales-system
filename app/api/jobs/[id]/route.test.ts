import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

const transitionMocks = vi.hoisted(() => ({
  validateTransition: vi.fn(() => []),
  applyTransition: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

vi.mock("@/lib/role-utils", () => ({
  extractRoleFromJwt: vi.fn(() => null),
}))

vi.mock("@/lib/pipeline/validate-transition", () => ({
  validateTransition: transitionMocks.validateTransition,
}))

vi.mock("@/lib/pipeline/apply-transition", () => ({
  applyTransition: transitionMocks.applyTransition,
}))

import { PATCH } from "./route"
import type { GateFailure } from "@/lib/pipeline/validate-transition"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const CUSTOMER_ID = "00000000-0000-4000-8000-00000000bbbb"

const bookingRow = {
  id: BOOKING_ID,
  booking_number: "BT-2026-0001",
  customer_id: CUSTOMER_ID,
  stage: "final_paid",
  consultant: "LB",
  assigned_salesperson_id: null,
  source: "web_form",
  raw_text: null,
  email_import_needs_review: false,
  email_import_review_resolved_at: null,
  updated_at: "2026-05-14T09:00:00.000Z",
  departure_date: "2026-06-01",
  duration_nights: 3,
  deposit_paid: true,
  invoice_balance: 0,
}

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

function patchJson(body: unknown) {
  return new Request("http://localhost/api/jobs/" + BOOKING_ID, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createFailure(gateId: string): GateFailure {
  return {
    gateId,
    message: `${gateId} failed`,
    fixHint: "Fix the booking before moving stages.",
    severity: "block",
  }
}

interface SupabaseOptions {
  user?: { id: string; email?: string } | null
  role?: string | null
  booking?: typeof bookingRow | null
}

function createSupabaseMock({
  user = { id: USER_ID, email: "consultant@example.test" },
  role = "consultant",
  booking = bookingRow,
}: SupabaseOptions = {}) {
  const pipelineHistoryInsert = vi.fn(async () => ({ error: null }))
  const auditInsert = vi.fn(async () => ({ error: null }))

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : { message: "Unauthorized" },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: booking, error: booking ? null : { code: "PGRST116" } })),
              maybeSingle: vi.fn(async () => ({ data: booking ? { updated_at: booking.updated_at } : null, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: booking, error: null })),
              })),
            })),
          })),
        }
      }

      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: role
                  ? {
                      name: "Test",
                      surname: "User",
                      email: "consultant@example.test",
                      clearance_level: role,
                    }
                  : null,
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  first_name: "Ada",
                  last_name: "Lovelace",
                  email: "ada@example.test",
                  phone: "+27110000000",
                  country: "South Africa",
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [{ id: "quote-1", status: "accepted", total: 1000, created_at: "2026-05-01T00:00:00.000Z" }],
                error: null,
              })),
            })),
          })),
        }
      }

      if (["documents", "invoices", "correspondences", "payments"].includes(table)) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "pipeline_history") {
        return { insert: pipelineHistoryInsert }
      }

      if (table === "audit_logs") {
        return { insert: auditInsert }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, pipelineHistoryInsert, auditInsert }
}

describe("PATCH /api/jobs/[id]", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    transitionMocks.validateTransition.mockReset()
    transitionMocks.validateTransition.mockReturnValue([])
    transitionMocks.applyTransition.mockReset()
    transitionMocks.applyTransition.mockResolvedValue({
      updated: {
        ...bookingRow,
        stage: "voucher_sent",
        cancel_reason: null,
        cancelled_at: null,
        updated_at: "2026-05-14T10:00:00.000Z",
      },
      crossedStages: ["voucher_sent"],
      createdInvoiceDocument: false,
      scheduledDepositCorrespondence: false,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = createSupabaseMock({ user: null })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "voucher_sent" }), makeParams())

    expect(response.status).toBe(401)
  })

  it("returns 403 for readonly stage mutations", async () => {
    const { supabase } = createSupabaseMock({ role: "readonly" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "voucher_sent" }), makeParams())

    expect(response.status).toBe(403)
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("applies a valid stage move", async () => {
    const { supabase, pipelineHistoryInsert, auditInsert } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "voucher_sent" }), makeParams())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ id: BOOKING_ID, stage: "voucher_sent" })
    expect(transitionMocks.applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetStage: "voucher_sent",
        booking: expect.objectContaining({ id: BOOKING_ID, stage: "final_paid" }),
      }),
    )
    expect(pipelineHistoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({ from_stage: "final_paid", to_stage: "voucher_sent" }),
    )
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "stage_change" }))
  })

  it("returns 422 for an invalid stage move", async () => {
    transitionMocks.validateTransition.mockReturnValueOnce([createFailure("quote_sent_required")])
    const { supabase } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "accepted" }), makeParams())

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      failures: [expect.objectContaining({ gateId: "quote_sent_required" })],
    })
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
  })

  it("returns 422 for the Needs Review gate", async () => {
    transitionMocks.validateTransition.mockReturnValueOnce([createFailure("email_import_review")])
    const { supabase } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "quote_sent" }), makeParams())

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      failures: [expect.objectContaining({ gateId: "email_import_review" })],
    })
  })

  it("returns 422 for the payment gate", async () => {
    transitionMocks.validateTransition.mockReturnValueOnce([createFailure("deposit_received_confirmation")])
    const { supabase } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "deposit_paid" }), makeParams())

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      failures: [expect.objectContaining({ gateId: "deposit_received_confirmation" })],
    })
  })

  it("returns 422 for the voucher gate", async () => {
    transitionMocks.validateTransition.mockReturnValueOnce([createFailure("voucher_balance_zero")])
    const { supabase } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchJson({ stage: "voucher_sent" }), makeParams())

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      failures: [expect.objectContaining({ gateId: "voucher_balance_zero" })],
    })
  })
})
