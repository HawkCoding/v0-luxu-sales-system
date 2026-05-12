import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: supabaseMocks.createServiceClient,
  createSessionClient: supabaseMocks.createSessionClient,
}))

vi.mock("../packages/[slug]/helpers", () => ({
  loadPackageDetail: vi.fn(),
}))

import { POST } from "./route"

const BOOKING_ID = "11111111-1111-4111-8111-111111111111"
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222"
const QUOTE_ID = "33333333-3333-4333-8333-333333333333"
const SUPPLIER_ID = "44444444-4444-4444-8444-444444444444"
const SUITE_ID = "55555555-5555-4555-8555-555555555555"

interface MockState {
  bookingSuites: unknown[]
  suiteTypesQueried: boolean
}

function makeSelectSingle<T>(data: T) {
  return {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data, error: null })),
    })),
  }
}

function createSupabase(state: MockState) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1", email: "consultant@example.com" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "countries") {
        return { select: vi.fn(async () => ({ data: [], error: null })) }
      }

      if (table === "country_aliases") {
        return { select: vi.fn(async () => ({ data: [], error: null })) }
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: CUSTOMER_ID }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === "routes") {
        return {
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }

      if (table === "packages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "suppliers") {
        const query = {
          eq: vi.fn((column: string) => {
            if (column === "active") return Promise.resolve({ data: [], error: null })
            return query
          }),
        }

        return { select: vi.fn(() => query) }
      }

      if (table === "bookings") {
        return {
          insert: vi.fn(() =>
            makeSelectSingle({
              id: BOOKING_ID,
              booking_number: "BT-2026-0001",
            }),
          ),
        }
      }

      if (table === "suite_types") {
        state.suiteTypesQueried = true
        const query = {
          eq: vi.fn((column: string) => {
            if (column === "active") {
              return Promise.resolve({
                data: [{ id: SUITE_ID, name: "Deluxe Double Suite" }],
                error: null,
              })
            }

            return query
          }),
        }

        return { select: vi.fn(() => query) }
      }

      if (table === "booking_suites") {
        return {
          insert: vi.fn(async (rows: unknown[]) => {
            state.bookingSuites.push(...rows)
            return { error: null }
          }),
        }
      }

      if (table === "quotes") {
        return {
          insert: vi.fn(() => makeSelectSingle({ id: QUOTE_ID })),
        }
      }

      if (table === "audit_logs") {
        return { insert: vi.fn(async () => ({ error: null })) }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

async function postEnquiry(body: Record<string, unknown>, state: MockState) {
  const supabase = createSupabase(state)
  supabaseMocks.createServiceClient.mockReturnValue(supabase)
  supabaseMocks.createSessionClient.mockResolvedValue(supabase)

  return POST(
    new Request("http://localhost/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jane",
        surname: "Doe",
        email: "jane@example.com",
        country: "South Africa",
        departureDate: "2026-05-11",
        noOfAdults: 2,
        noOfSuites: 1,
        termsAccepted: true,
        ...body,
      }),
    }),
  )
}

describe("POST /api/enquiries suite selections", () => {
  beforeEach(() => {
    supabaseMocks.createServiceClient.mockReset()
    supabaseMocks.createSessionClient.mockReset()
  })

  it("saves structured suite selections with suite_type_id", async () => {
    const state: MockState = { bookingSuites: [], suiteTypesQueried: false }
    const response = await postEnquiry(
      {
        supplierId: SUPPLIER_ID,
        suiteSelections: [
          { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
          { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
        ],
      },
      state,
    )

    expect(response.status).toBe(200)
    expect(state.suiteTypesQueried).toBe(false)
    expect(state.bookingSuites).toEqual([
      {
        booking_id: BOOKING_ID,
        suite_number: 1,
        suite_type_id: SUITE_ID,
        suite_type_name: "Deluxe Double Suite",
      },
      {
        booking_id: BOOKING_ID,
        suite_number: 2,
        suite_type_id: SUITE_ID,
        suite_type_name: "Deluxe Double Suite",
      },
    ])
  })

  it("resolves legacy suiteTypes by supplier when possible", async () => {
    const state: MockState = { bookingSuites: [], suiteTypesQueried: false }
    const response = await postEnquiry(
      {
        supplierId: SUPPLIER_ID,
        suiteTypes: ["Deluxe Double Suite"],
      },
      state,
    )

    expect(response.status).toBe(200)
    expect(state.suiteTypesQueried).toBe(true)
    expect(state.bookingSuites).toEqual([
      {
        booking_id: BOOKING_ID,
        suite_number: 1,
        suite_type_id: SUITE_ID,
        suite_type_name: "Deluxe Double Suite",
      },
    ])
  })
})
