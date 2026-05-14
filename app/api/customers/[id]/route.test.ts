import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000010"
const UPDATED_AT = "2026-05-01T10:00:00.000Z"

interface MockOptions {
  user?: { id: string } | null
  role?: string | null
  existingUpdatedAt?: string
}

function createPatchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/customers/${CUSTOMER_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: CUSTOMER_ID }) }
}

function createSupabaseMock({
  user = { id: USER_ID },
  role = "manager",
  existingUpdatedAt = UPDATED_AT,
}: MockOptions = {}) {
  const updatePayloads: unknown[] = []

  const updateBuilder = {
    eq: vi.fn(() => updateBuilder),
    select: vi.fn(() => ({
      single: vi.fn(async () => {
        const payload = updatePayloads[0] as {
          notes?: string | null
          email?: string
          phone?: string | null
          province?: string | null
          date_of_birth?: string | null
          vip_status?: boolean
          preferences?: string | null
          communication_preferences?: string | null
          is_repeat_client?: boolean
          updated_at?: string
        }

        return {
          data: {
            id: CUSTOMER_ID,
            notes: payload.notes ?? null,
            email: payload.email ?? "jane@example.com",
            phone: payload.phone ?? null,
            province: payload.province ?? null,
            date_of_birth: payload.date_of_birth ?? null,
            vip_status: payload.vip_status ?? false,
            preferences: payload.preferences ?? null,
            communication_preferences: payload.communication_preferences ?? null,
            first_travel_date: null,
            last_travel_date: null,
            is_repeat_client: payload.is_repeat_client ?? false,
            updated_at: payload.updated_at ?? "2026-05-01T10:01:00.000Z",
          },
          error: null,
        }
      }),
    })),
  }

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
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
              single: vi.fn(async () => ({
                data: { updated_at: existingUpdatedAt },
                error: null,
              })),
              maybeSingle: vi.fn(async () => ({
                data: { updated_at: existingUpdatedAt },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            updatePayloads.push(payload)
            return updateBuilder
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, updatePayloads }
}

describe("PATCH /api/customers/[id]", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("sets CRM fields and normalizes email", async () => {
    const { supabase, updatePayloads } = createSupabaseMock()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      createPatchRequest({
        notes: " Prefers quiet suite ",
        email: " JANE@EXAMPLE.COM ",
        phone: " 123 ",
        province: " Western Cape ",
        date_of_birth: "1980-01-02",
        vip_status: true,
        preferences: " Window table ",
        communication_preferences: " Email mornings ",
        is_repeat_client: true,
        expectedUpdatedAt: UPDATED_AT,
      }),
      createParams(),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        notes: "Prefers quiet suite",
        email: "jane@example.com",
        phone: "123",
        province: "Western Cape",
        date_of_birth: "1980-01-02",
        vip_status: true,
        preferences: "Window table",
        communication_preferences: "Email mornings",
        is_repeat_client: true,
      }),
    )
    expect(payload).toMatchObject({
      email: "jane@example.com",
      province: "Western Cape",
      vipStatus: true,
      preferences: "Window table",
      communicationPreferences: "Email mornings",
      isRepeatClient: true,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    const { supabase, updatePayloads } = createSupabaseMock({ user: null })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(createPatchRequest({}), createParams())

    expect(response.status).toBe(401)
    expect(updatePayloads).toHaveLength(0)
  })

  it("returns 403 for insufficient role", async () => {
    const { supabase, updatePayloads } = createSupabaseMock({ role: "readonly" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      createPatchRequest({
        notes: "",
        email: "jane@example.com",
        phone: null,
      }),
      createParams(),
    )

    expect(response.status).toBe(403)
    expect(updatePayloads).toHaveLength(0)
  })

  it("returns a stale version response when expectedUpdatedAt mismatches", async () => {
    const { supabase, updatePayloads } = createSupabaseMock({
      existingUpdatedAt: "2026-05-01T10:05:00.000Z",
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      createPatchRequest({
        notes: "",
        email: "jane@example.com",
        phone: null,
        expectedUpdatedAt: UPDATED_AT,
      }),
      createParams(),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(updatePayloads).toHaveLength(0)
    expect(payload).toMatchObject({ error: expect.stringContaining("customer") })
  })
})
