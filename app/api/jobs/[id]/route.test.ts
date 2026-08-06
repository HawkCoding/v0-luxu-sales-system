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

const BASE_BOOKING = {
  id: BOOKING_ID,
  stage: "enquiry",
  booking_number: "BT-2026-0001",
  customer_id: "00000000-0000-4000-8000-000000000099",
  consultant: null as string | null,
  assigned_salesperson_id: null as string | null,
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
  child_ages: null as number[] | null,
  customer_invoice_number: null,
}

function createSupabase({
  role = "consultant",
  booking = BASE_BOOKING,
  updateMock,
  insertMock,
}: {
  role?: string | null
  booking?: typeof BASE_BOOKING
  updateMock?: ReturnType<typeof vi.fn>
  insertMock?: ReturnType<typeof vi.fn>
} = {}) {
  const update =
    updateMock ??
    vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { ...booking, ...patch }, error: null })),
        })),
      })),
    }))
  const insert = insertMock ?? vi.fn(async () => ({ error: null }))

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: booking, error: null })),
            })),
          })),
          update,
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

      if (table === "audit_logs") {
        return { insert }
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

  describe("baseline field-conflict detection", () => {
    const SALESPERSON_CURRENT = "00000000-0000-4000-8000-0000000000c1"
    const SALESPERSON_NEW = "00000000-0000-4000-8000-0000000000c2"
    const SALESPERSON_ORIGINAL = "00000000-0000-4000-8000-0000000000c3"
    const SALESPERSON_SOMEONE_ELSE = "00000000-0000-4000-8000-0000000000c4"

    it("succeeds despite a stale expectedUpdatedAt when the baseline for the changed field matches", async () => {
      // Row's updated_at has moved on (e.g. a sibling write), but the
      // reassign target field itself still matches what the client loaded.
      const booking = {
        ...BASE_BOOKING,
        updated_at: "2026-01-02T00:00:00.000Z",
        assigned_salesperson_id: SALESPERSON_CURRENT,
      }
      const updateMock = vi.fn((patch: Record<string, unknown>) => {
        const chain = {
          eq: vi.fn(() => chain),
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { ...booking, ...patch }, error: null })),
          })),
        }
        return chain
      })
      supabaseMocks.createSessionClient.mockResolvedValue(
        createSupabase({ role: "manager", booking, updateMock }),
      )

      const res = await PATCH(
        makeRequest({
          assignedSalespersonId: SALESPERSON_NEW,
          expectedUpdatedAt: BASE_BOOKING.updated_at,
          baseline: { assignedSalespersonId: SALESPERSON_CURRENT },
        }),
        { params: Promise.resolve({ id: BOOKING_ID }) },
      )

      expect(res.status).toBe(200)
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ assigned_salesperson_id: SALESPERSON_NEW }),
      )
    })

    it("returns 409 FIELD_CONFLICT listing assignedSalespersonId when another user reassigned it first", async () => {
      const booking = {
        ...BASE_BOOKING,
        updated_at: "2026-01-02T00:00:00.000Z",
        assigned_salesperson_id: SALESPERSON_SOMEONE_ELSE,
      }
      supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ booking }))

      const res = await PATCH(
        makeRequest({
          assignedSalespersonId: SALESPERSON_NEW,
          expectedUpdatedAt: BASE_BOOKING.updated_at,
          baseline: { assignedSalespersonId: SALESPERSON_ORIGINAL },
        }),
        { params: Promise.resolve({ id: BOOKING_ID }) },
      )
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.code).toBe("FIELD_CONFLICT")
      expect(body.fields).toEqual(["assignedSalespersonId"])
    })
  })

  describe("parsedFieldEdits.childAges", () => {
    it("writes child_ages alongside noOfChildren when they agree", async () => {
      const updateMock = vi.fn((patch: Record<string, unknown>) => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { ...BASE_BOOKING, ...patch }, error: null })),
          })),
        })),
      }))
      supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ updateMock }))

      const res = await PATCH(
        makeRequest({
          parsedFieldEdits: { noOfAdults: 2, noOfChildren: 2, childAges: [3, 9] },
        }),
        { params: Promise.resolve({ id: BOOKING_ID }) },
      )

      expect(res.status).toBe(200)
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ no_of_children: 2, child_ages: [3, 9] }),
      )
    })

    it("rejects a non-empty roster whose length doesn't match noOfChildren", async () => {
      supabaseMocks.createSessionClient.mockResolvedValue(createSupabase())

      const res = await PATCH(
        makeRequest({ parsedFieldEdits: { noOfChildren: 1, childAges: [3, 9] } }),
        { params: Promise.resolve({ id: BOOKING_ID }) },
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/child ages must match/i)
    })

    it("rejects a non-empty roster when noOfChildren isn't sent in the same request", async () => {
      supabaseMocks.createSessionClient.mockResolvedValue(createSupabase())

      const res = await PATCH(makeRequest({ parsedFieldEdits: { childAges: [3, 9] } }), {
        params: Promise.resolve({ id: BOOKING_ID }),
      })

      expect(res.status).toBe(400)
    })

    it("clears the roster with childAges: null and leaves noOfChildren free", async () => {
      const updateMock = vi.fn((patch: Record<string, unknown>) => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { ...BASE_BOOKING, ...patch }, error: null })),
          })),
        })),
      }))
      supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ updateMock }))

      const res = await PATCH(
        makeRequest({ parsedFieldEdits: { noOfChildren: 3, childAges: null } }),
        { params: Promise.resolve({ id: BOOKING_ID }) },
      )

      expect(res.status).toBe(200)
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ no_of_children: 3, child_ages: null }),
      )
    })

    it("audits the before/after childAges alongside the other parsed fields", async () => {
      const insertMock = vi.fn(async () => ({ error: null }))
      supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ insertMock }))

      await PATCH(
        makeRequest({ parsedFieldEdits: { noOfAdults: 4, noOfChildren: 1, childAges: [6] } }),
        { params: Promise.resolve({ id: BOOKING_ID }) },
      )

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "enquiry_field_updated",
          before_json: expect.objectContaining({ childAges: null }),
          after_json: expect.objectContaining({ childAges: [6] }),
        }),
      )
    })
  })
})
