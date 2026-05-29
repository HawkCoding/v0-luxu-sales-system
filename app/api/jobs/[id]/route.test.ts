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

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function makeRequest(body: unknown = { stage: "quoted" }) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createSupabase({ role = "consultant" }: { role?: string | null } = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  stage: "enquiry",
                  booking_number: "BT-2026-0001",
                  customer_id: "00000000-0000-4000-8000-000000000099",
                  consultant: null,
                  assigned_salesperson_id: null,
                  source: "enquiry_form",
                  raw_text: null,
                  email_import_needs_review: false,
                  email_import_review_resolved_at: null,
                  updated_at: "2026-01-01T00:00:00.000Z",
                  departure_date: null,
                  duration_nights: null,
                  deposit_paid: false,
                  invoice_balance: 0,
                  no_of_adults: 2,
                  no_of_children: 0,
                  no_of_suites: 1,
                },
                error: null,
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
                data: role ? { clearance_level: role } : null,
                error: null,
              })),
            })),
          })),
        }
      }

      // Return a no-op for other tables that may be queried
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
        insert: vi.fn(async () => ({ error: null })),
        update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      }
    }),
  }
}

describe("PATCH /api/jobs/[id]", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
      from: vi.fn(),
    })

    const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: BOOKING_ID }) })
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "readonly" }))

    const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: BOOKING_ID }) })
    expect(res.status).toBe(403)
  })
})
