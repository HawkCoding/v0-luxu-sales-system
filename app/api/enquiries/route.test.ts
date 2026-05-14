import { describe, expect, it, vi } from "vitest"
import {
  normalizeSuiteSelections,
  resolveEnquiryCustomer,
  resolveSuiteSelectionIds,
} from "./route"

const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222"
const SUPPLIER_ID = "44444444-4444-4444-8444-444444444444"
const SUITE_ID = "55555555-5555-4555-8555-555555555555"

interface MockState {
  completedBookingCustomerIds: Set<string>
  customersByEmail: Map<string, { id: string; first_name?: string; last_name?: string }>
  customerInsertRows: Array<Record<string, unknown>>
  customerUpdateRows: Array<{ id: string; payload: Record<string, unknown> }>
  suiteTypesQueried: boolean
}

function createMockState(overrides: Partial<MockState> = {}): MockState {
  return {
    completedBookingCustomerIds: new Set([CUSTOMER_ID]),
    customersByEmail: new Map([
      ["jane@example.com", { id: CUSTOMER_ID, first_name: "Jane", last_name: "Doe" }],
    ]),
    customerInsertRows: [],
    customerUpdateRows: [],
    suiteTypesQueried: false,
    ...overrides,
  }
}

function createSupabase(state: MockState) {
  return {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, value: string) => ({
              maybeSingle: vi.fn(async () => ({
                data: state.customersByEmail.get(value.toLowerCase()) ?? null,
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (_column: string, id: string) => {
              state.customerUpdateRows.push({ id, payload })
              return { error: null }
            }),
          })),
          insert: vi.fn((row: Record<string, unknown>) => {
            state.customerInsertRows.push(row)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "customer-new" }, error: null })),
              })),
            }
          }),
        }
      }

      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, customerId: string) => ({
              in: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: state.completedBookingCustomerIds.has(customerId) ? [{ id: "completed-booking" }] : [],
                  error: null,
                })),
              })),
            })),
          })),
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

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function enquiryCustomerInput(overrides: Partial<Parameters<typeof resolveEnquiryCustomer>[1]> = {}) {
  return {
    normalizedEmail: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
    phone: "+27 82 000 0000",
    country: "South Africa",
    title: "Ms",
    nowIso: "2026-05-14T10:00:00.000Z",
    ...overrides,
  }
}

describe("POST /api/enquiries suite selections", () => {
  it("saves structured suite selections with suite_type_id", async () => {
    const state = createMockState()
    const supabase = createSupabase(state)

    const selections = normalizeSuiteSelections({
      suiteSelections: [
        { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
        { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
      ],
    })
    const resolved = await resolveSuiteSelectionIds(supabase as never, SUPPLIER_ID, selections)

    expect(state.suiteTypesQueried).toBe(false)
    expect(resolved).toEqual([
      { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
      { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
    ])
  })

  it("resolves legacy suiteTypes by supplier when possible", async () => {
    const state = createMockState()
    const supabase = createSupabase(state)

    const selections = normalizeSuiteSelections({
      suiteTypes: ["Deluxe Double Suite"],
    })
    const resolved = await resolveSuiteSelectionIds(supabase as never, SUPPLIER_ID, selections)

    expect(state.suiteTypesQueried).toBe(true)
    expect(resolved).toEqual([
      { suiteTypeId: SUITE_ID, suiteTypeName: "Deluxe Double Suite" },
    ])
  })
})

describe("POST /api/enquiries customer CRM matching", () => {
  it("links an existing customer by email", async () => {
    const state = createMockState({ completedBookingCustomerIds: new Set() })
    const supabase = createSupabase(state)

    const result = await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput({
      normalizedEmail: "jane@example.com",
    }))

    expect(result.customerId).toBe(CUSTOMER_ID)
    expect(state.customerInsertRows).toHaveLength(0)
    expect(state.customerUpdateRows[0]?.id).toBe(CUSTOMER_ID)
  })

  it("creates a customer for a new email", async () => {
    const state = createMockState({ customersByEmail: new Map() })
    const supabase = createSupabase(state)

    const result = await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput({
      normalizedEmail: "new@example.com",
    }))

    expect(result.customerId).toBe("customer-new")
    expect(state.customerInsertRows).toEqual([
      expect.objectContaining({
        first_name: "Jane",
        last_name: "Doe",
        email: "new@example.com",
      }),
    ])
  })

  it("creates a new customer for the same name with a different email", async () => {
    const state = createMockState({
      customersByEmail: new Map([
        ["jane.old@example.com", { id: CUSTOMER_ID, first_name: "Jane", last_name: "Doe" }],
      ]),
    })
    const supabase = createSupabase(state)

    const result = await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput({
      normalizedEmail: "jane.new@example.com",
    }))

    expect(result.customerId).toBe("customer-new")
    expect(state.customerInsertRows).toEqual([
      expect.objectContaining({
        first_name: "Jane",
        last_name: "Doe",
        email: "jane.new@example.com",
      }),
    ])
  })

  it("marks an existing customer as repeat when they already have a completed trip", async () => {
    const state = createMockState({ completedBookingCustomerIds: new Set([CUSTOMER_ID]) })
    const supabase = createSupabase(state)

    const result = await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput())

    expect(result.customerIsRepeatClient).toBe(true)
    expect(state.customerUpdateRows[0]).toEqual({
      id: CUSTOMER_ID,
      payload: expect.objectContaining({ is_repeat_client: true }),
    })
  })

  it("preserves CRM notes and preferences during existing-customer updates", async () => {
    const state = createMockState()
    const supabase = createSupabase(state)

    await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput())

    expect(state.customerUpdateRows[0]?.payload).toEqual(
      expect.not.objectContaining({
        notes: expect.anything(),
        preferences: expect.anything(),
        communication_preferences: expect.anything(),
      }),
    )
  })
})
