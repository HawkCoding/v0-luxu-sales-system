import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const SUPPLIER_ID = "00000000-0000-0000-0000-000000000111"

interface MockState {
  customerInsertRows: Array<Record<string, unknown>>
  bookingInsertRows: Array<Record<string, unknown>>
  precheckCustomerIds: string[]
  auditPayload: Record<string, unknown> | null
}

function createMockSupabase(state: MockState) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID, email: "manager@example.com" } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  clearance_level: "manager",
                  name: "Test",
                  surname: "Manager",
                  email: "manager@example.com",
                },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === "customers") {
        return {
          select: () => ({
            in: async (_column: string, emails: string[]) => ({
              data: emails.includes("existing@example.com")
                ? [{ id: "cust-existing", email: "existing@example.com" }]
                : [],
              error: null,
            }),
          }),
          insert: (rows: Array<Record<string, unknown>>) => {
            state.customerInsertRows = rows
            return {
              select: async () => ({
                data: rows.map((row) => ({
                  id: row.email === "new@example.com" ? "cust-new" : "cust-unknown",
                  email: String(row.email),
                })),
                error: null,
              }),
            }
          },
        }
      }

      if (table === "countries") {
        return {
          select: async () => ({
            data: [
              { id: "country-za", name: "South Africa", iso_alpha2: "ZA", iso_alpha3: "ZAF" },
            ],
            error: null,
          }),
        }
      }

      if (table === "country_aliases") {
        return {
          select: async () => ({
            data: [],
            error: null,
          }),
        }
      }

      if (table === "bookings") {
        return {
          select: () => ({
            eq: (_column: string, _value: string) => ({
              in: (_inColumn: string, customerIds: string[]) => {
                state.precheckCustomerIds = customerIds
                return {
                  contains: async () => ({
                    data: [
                      {
                        extracted_json: {
                          historical_import: {
                            imported_via: "supplier_csv",
                            source_row_id: "row-1",
                          },
                        },
                      },
                    ],
                    error: null,
                  }),
                }
              },
            }),
          }),
          insert: (rows: Array<Record<string, unknown>>) => {
            state.bookingInsertRows = rows
            return {
              select: async () => ({
                data: rows.map((_, index) => ({ id: `booking-${index + 1}` })),
                error: null,
              }),
            }
          },
        }
      }

      if (table === "audit_logs") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            state.auditPayload = payload
            return { error: null }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe("POST /api/customers/import idempotency", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("does not insert duplicate historical bookings when a chunk is retried", async () => {
    const state: MockState = {
      customerInsertRows: [],
      bookingInsertRows: [],
      precheckCustomerIds: [],
      auditPayload: null,
    }

    createSessionClientMock.mockResolvedValue(createMockSupabase(state))

    const request = new Request("http://localhost/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: SUPPLIER_ID,
        routeId: null,
        rows: [
          {
            source_row_id: "row-1",
            first_name: "Existing",
            last_name: "Customer",
            email: "existing@example.com",
          },
          {
            source_row_id: "row-2",
            first_name: "New",
            last_name: "Customer",
            email: "new@example.com",
          },
        ],
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      createdCustomers: 1,
      matchedCustomers: 1,
      importedBookings: 1,
    })
    expect(state.precheckCustomerIds.sort()).toEqual(["cust-existing", "cust-new"])
    expect(state.bookingInsertRows).toHaveLength(1)
    expect(state.bookingInsertRows[0]?.hotel_supplier_id).toBe(SUPPLIER_ID)

    const insertedBookingMeta = (state.bookingInsertRows[0].extracted_json as {
      historical_import?: { source_row_id?: string }
    }).historical_import

    expect(insertedBookingMeta?.source_row_id).toBe("row-2")
  })
})
