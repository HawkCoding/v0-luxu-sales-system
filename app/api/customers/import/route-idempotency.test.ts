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
  precheckCustomerIdBatches: string[][]
  auditPayload: Record<string, unknown> | null
  lastBookingNumber: number
}

function createMockSupabase(
  state: MockState,
  /** email -> id for customers that already exist in the database. */
  existingCustomerEmails: Map<string, string> = new Map([["existing@example.com", "cust-existing"]]),
  /** source_row_ids already imported for those customers. */
  importedSourceRowIds: string[] = ["row-1"],
) {
  return {
    // Mirrors next_booking_number_block: returns the LAST number of the
    // reserved range, so the caller derives [last - count + 1 .. last].
    rpc: vi.fn(async (functionName: string, args: { p_count?: number }) => {
      if (functionName !== "next_booking_number_block") {
        return { data: null, error: { message: `Unexpected RPC: ${functionName}` } }
      }
      state.lastBookingNumber += args.p_count ?? 0
      return { data: state.lastBookingNumber, error: null }
    }),
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
              data: emails
                .filter((email) => existingCustomerEmails.has(email))
                .map((email) => ({ id: existingCustomerEmails.get(email), email })),
              error: null,
            }),
          }),
          insert: (rows: Array<Record<string, unknown>>) => {
            state.customerInsertRows = rows
            return {
              select: async () => ({
                data: rows.map((row, index) => ({
                  id: row.email === "new@example.com" ? "cust-new" : `cust-inserted-${index}`,
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

      if (table === "suppliers") {
        return {
          select: () => ({
            in: async () => ({
              data: [{ id: SUPPLIER_ID, name: "Blue Train", kind: "train_operator" }],
              error: null,
            }),
          }),
        }
      }

      if (table === "bookings") {
        return {
          select: () => ({
            eq: (_column: string, _value: string) => ({
              in: (_inColumn: string, customerIds: string[]) => {
                state.precheckCustomerIdBatches.push(customerIds)
                return {
                  contains: async () => ({
                    data: importedSourceRowIds.map((sourceRowId) => ({
                      extracted_json: {
                        historical_import: {
                          imported_via: "supplier_csv",
                          source_row_id: sourceRowId,
                        },
                      },
                    })),
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
      precheckCustomerIdBatches: [],
      auditPayload: null,
      lastBookingNumber: 0,
    }

    const supabase = createMockSupabase(state)
    createSessionClientMock.mockResolvedValue(supabase)

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
    // Only the pre-existing customer is looked up — one inserted moments ago in
    // this same request cannot already carry a historical import.
    expect(state.precheckCustomerIdBatches).toEqual([["cust-existing"]])
    expect(state.bookingInsertRows).toHaveLength(1)
    expect(state.bookingInsertRows[0]?.booking_number).toMatch(/^LTT-\d{4}-0001$/)
    // One allocation call for the whole file, not one per row.
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(state.bookingInsertRows[0]?.hotel_supplier_id).toBe(SUPPLIER_ID)

    const insertedBookingMeta = (state.bookingInsertRows[0].extracted_json as {
      historical_import?: { source_row_id?: string }
    }).historical_import

    expect(insertedBookingMeta?.source_row_id).toBe("row-2")
  })

  // F05-3: the duplicate-source-row lookup used to issue a single .in() with
  // every customer id, which overran the PostgREST request URI at ~200 rows and
  // 500'd *after* the customers had been inserted.
  it("batches the historical-import lookup for large imports", async () => {
    const rowCount = 250
    const existingCustomerEmails = new Map(
      Array.from({ length: rowCount }, (_, index) => [`person${index}@example.com`, `cust-${index}`] as const),
    )

    const state: MockState = {
      customerInsertRows: [],
      bookingInsertRows: [],
      precheckCustomerIdBatches: [],
      auditPayload: null,
      lastBookingNumber: 0,
    }

    createSessionClientMock.mockResolvedValue(
      createMockSupabase(state, new Map(existingCustomerEmails), []),
    )

    const request = new Request("http://localhost/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: SUPPLIER_ID,
        routeId: null,
        rows: Array.from({ length: rowCount }, (_, index) => ({
          source_row_id: `row-${index}`,
          first_name: `Person${index}`,
          last_name: "Smith",
          email: `person${index}@example.com`,
        })),
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ matchedCustomers: rowCount, importedBookings: rowCount })
    expect(state.precheckCustomerIdBatches.length).toBeGreaterThan(1)
    for (const batch of state.precheckCustomerIdBatches) {
      expect(batch.length).toBeLessThanOrEqual(100)
    }
    expect(state.precheckCustomerIdBatches.flat()).toHaveLength(rowCount)
  })

  it("skips the historical-import lookup entirely when every customer is new", async () => {
    const state: MockState = {
      customerInsertRows: [],
      bookingInsertRows: [],
      precheckCustomerIdBatches: [],
      auditPayload: null,
      lastBookingNumber: 0,
    }

    createSessionClientMock.mockResolvedValue(createMockSupabase(state, new Map(), []))

    const request = new Request("http://localhost/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: SUPPLIER_ID,
        routeId: null,
        rows: [{ source_row_id: "row-1", first_name: "New", last_name: "Customer", email: "new@example.com" }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(state.precheckCustomerIdBatches).toEqual([])
    expect(state.bookingInsertRows).toHaveLength(1)
  })
})
