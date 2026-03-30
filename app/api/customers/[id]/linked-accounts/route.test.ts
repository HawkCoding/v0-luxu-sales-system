import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const CUSTOMER_ID = "690b9670-420c-4777-8334-3a5f380ecf97"

function createSupabase() {
  const insertSingleMock = vi.fn(async () => ({
    data: {
      id: "00000000-0000-4000-8000-000000000010",
      customer_id: CUSTOMER_ID,
      linked_customer_id: null,
      relationship: "Partner",
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      is_mirror: false,
      created_at: "2026-03-30T10:00:00.000Z",
    },
    error: null,
  }))

  const linkedAccountsInsertMock = vi.fn(() => ({
    select: vi.fn(() => ({
      single: insertSingleMock,
    })),
  }))

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { clearance_level: "manager" },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === "customer_linked_accounts") {
        return {
          insert: linkedAccountsInsertMock,
        }
      }

      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: null,
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
    linkedAccountsInsertMock,
  }
}

describe("POST /api/customers/[id]/linked-accounts", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("accepts nullable optional fields and creates linked account", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      new Request(`http://localhost/api/customers/${CUSTOMER_ID}/linked-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationship: "Partner",
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          linkedCustomerId: null,
        }),
      }),
      { params: Promise.resolve({ id: CUSTOMER_ID }) },
    )

    expect(response.status).toBe(201)
    expect(supabase.linkedAccountsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: CUSTOMER_ID,
        relationship: "Partner",
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        linked_customer_id: null,
        is_mirror: false,
      }),
    )
  })

  it("still returns 400 for invalid email", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      new Request(`http://localhost/api/customers/${CUSTOMER_ID}/linked-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationship: "Partner",
          email: "not-an-email",
        }),
      }),
      { params: Promise.resolve({ id: CUSTOMER_ID }) },
    )

    expect(response.status).toBe(400)
  })
})
