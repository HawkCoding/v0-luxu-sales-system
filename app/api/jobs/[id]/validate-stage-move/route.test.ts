import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

vi.mock("@/lib/role-utils", () => ({
  extractRoleFromJwt: vi.fn(() => null),
}))

vi.mock("@/lib/pipeline/validate-transition", () => ({
  validateTransition: vi.fn(() => []),
}))

import { POST } from "./route"
import { validateTransition } from "@/lib/pipeline/validate-transition"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const CUSTOMER_ID = "00000000-0000-4000-8000-00000000bbbb"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/jobs/" + BOOKING_ID + "/validate-stage-move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validBody = { targetStage: "quoted" }

const bookingRow = {
  id: BOOKING_ID,
  stage: "enquiry",
  source: "web",
  customer_id: CUSTOMER_ID,
  email_import_needs_review: false,
  email_import_review_resolved_at: null,
  deposit_paid: false,
  invoice_balance: 0,
  departure_date: "2026-06-01",
}

interface CreateSupabaseOptions {
  user?: { id: string } | null
  bookingData?: typeof bookingRow | null
  bookingError?: unknown
  role?: string | null
}

function createSupabaseMock({
  user = { id: USER_ID },
  bookingData = bookingRow,
  bookingError = null,
  role = "consultant",
}: CreateSupabaseOptions = {}) {
  return {
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
              single: vi.fn(async () => ({ data: bookingData, error: bookingError })),
            })),
          })),
        }
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: role ? { clearance_level: role } : null,
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
                data: { first_name: "Jane", last_name: "Doe", email: "j@example.com", phone: null, country: null },
                error: null,
              })),
            })),
          })),
        }
      }
      // quotes, documents, invoices, correspondences — return empty arrays
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            async then(resolve: (v: { data: unknown[]; error: null }) => void) {
              resolve({ data: [], error: null })
            },
          })),
          async then(resolve: (v: { data: unknown[]; error: null }) => void) {
            resolve({ data: [], error: null })
          },
        })),
      }
    }),
  }
}

describe("POST /api/jobs/[id]/validate-stage-move", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    vi.mocked(validateTransition).mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    const supabase = createSupabaseMock({ user: null })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(postJson(validBody), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 400 with flattened field errors (not raw Zod object) for invalid body", async () => {
    const supabase = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(postJson({ targetStage: "not_a_valid_stage" }), makeParams())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
    // details should be flattened field errors, not a raw Zod error with _errors/_def etc.
    if (body.details) {
      expect(body.details).not.toHaveProperty("_errors")
      expect(body.details).not.toHaveProperty("issues")
    }
  })

  it("returns 404 when booking is not found", async () => {
    const supabase = createSupabaseMock({ bookingData: null, bookingError: { code: "PGRST116" } })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(postJson(validBody), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 200 with failures, isManager, and autoCreatableInvoice on success", async () => {
    const supabase = createSupabaseMock({ role: "manager" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(postJson(validBody), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.failures)).toBe(true)
    expect(typeof body.isManager).toBe("boolean")
    expect(body.isManager).toBe(true)
    expect(typeof body.autoCreatableInvoice).toBe("boolean")
  })

  it("passes voucher readiness fields into transition validation", async () => {
    const supabase = createSupabaseMock({
      bookingData: {
        ...bookingRow,
        stage: "final_paid",
        deposit_paid: true,
        invoice_balance: 0,
        departure_date: "2026-06-01",
      },
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(postJson({ targetStage: "voucher_sent" }), makeParams())
    expect(res.status).toBe(200)
    expect(validateTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: expect.objectContaining({
          deposit_paid: true,
          invoice_balance: 0,
          departure_date: "2026-06-01",
        }),
        targetStage: "voucher_sent",
      }),
    )
  })

  it("returns isManager false for consultant role", async () => {
    const supabase = createSupabaseMock({ role: "consultant" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await POST(postJson(validBody), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isManager).toBe(false)
  })
})
