import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const CUSTOMER_A = "690b9670-420c-4777-8334-3a5f380ecf97"
const CUSTOMER_B = "790b9670-420c-4777-8334-3a5f380ecf98"
const CUSTOMER_C = "890b9670-420c-4777-8334-3a5f380ecf99"
const ACCOUNT_PRIMARY = "00000000-0000-4000-8000-000000000010"
const ACCOUNT_MIRROR = "00000000-0000-4000-8000-000000000020"

function makeDeleteCaptureChain(captured: Array<[string, unknown]>) {
  const chain = {
    eq: vi.fn((col: string, val: unknown) => {
      captured.push([col, val])
      return chain
    }),
  }
  return { delete: vi.fn(() => chain) }
}

function createPatchSupabase(
  existing: {
    id: string
    customer_id: string
    linked_customer_id: string | null
    is_mirror: boolean
  },
  counterpartDeleteCapture: Array<[string, unknown]>,
) {
  const existingRow = {
    id: existing.id,
    customer_id: existing.customer_id,
    linked_customer_id: existing.linked_customer_id,
    relationship: "Partner",
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    is_mirror: existing.is_mirror,
    created_at: "2026-03-30T10:00:00.000Z",
  }

  const updatedRow = {
    ...existingRow,
    linked_customer_id: CUSTOMER_C,
  }

  const deleteBuilder = makeDeleteCaptureChain(counterpartDeleteCapture)

  // loadExisting: select().eq().eq().maybeSingle(); upsertMirrorFor: select().eq().eq().eq().maybeSingle()
  const linkedAccountsTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: existingRow,
            error: null,
          })),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: null,
            })),
          })),
        })),
      })),
    })),
    delete: deleteBuilder.delete,
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: updatedRow,
              error: null,
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => Promise.resolve({ error: null })),
  }

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

      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: CUSTOMER_C },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === "customer_linked_accounts") {
        return linkedAccountsTable
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe("PATCH /api/customers/[id]/linked-accounts/[accountId]", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("deletes counterpart mirror (is_mirror true) when primary row linked customer changes", async () => {
    const counterpartDelete: Array<[string, unknown]> = []
    const supabase = createPatchSupabase(
      {
        id: ACCOUNT_PRIMARY,
        customer_id: CUSTOMER_A,
        linked_customer_id: CUSTOMER_B,
        is_mirror: false,
      },
      counterpartDelete,
    )
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await PATCH(
      new Request(
        `http://localhost/api/customers/${CUSTOMER_A}/linked-accounts/${ACCOUNT_PRIMARY}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedCustomerId: CUSTOMER_C }),
        },
      ),
      { params: Promise.resolve({ id: CUSTOMER_A, accountId: ACCOUNT_PRIMARY }) },
    )

    expect(response.status).toBe(200)
    expect(counterpartDelete).toEqual([
      ["customer_id", CUSTOMER_B],
      ["linked_customer_id", CUSTOMER_A],
      ["is_mirror", true],
    ])
  })

  it("deletes counterpart primary (is_mirror false) when mirror row linked customer changes", async () => {
    const counterpartDelete: Array<[string, unknown]> = []
    const supabase = createPatchSupabase(
      {
        id: ACCOUNT_MIRROR,
        customer_id: CUSTOMER_B,
        linked_customer_id: CUSTOMER_A,
        is_mirror: true,
      },
      counterpartDelete,
    )
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await PATCH(
      new Request(
        `http://localhost/api/customers/${CUSTOMER_B}/linked-accounts/${ACCOUNT_MIRROR}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedCustomerId: CUSTOMER_C }),
        },
      ),
      { params: Promise.resolve({ id: CUSTOMER_B, accountId: ACCOUNT_MIRROR }) },
    )

    expect(response.status).toBe(200)
    expect(counterpartDelete).toEqual([
      ["customer_id", CUSTOMER_A],
      ["linked_customer_id", CUSTOMER_B],
      ["is_mirror", false],
    ])
  })
})
