import { describe, expect, it, vi } from "vitest"
import { mergeEnquiryFormFields, readYesNoFlag, resolveEnquiryCustomer } from "./route"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import {
  legacySuiteNamesToUnits,
  resolveEnquirySuiteUnits,
} from "@/lib/suites/enquiry-suite-units"

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
    province: null,
    title: "Ms",
    nowIso: "2026-05-14T10:00:00.000Z",
    ...overrides,
  }
}

const BEDROOM_TWIN_ID = "66666666-6666-4666-8666-666666666666"
const BEDROOM_DOUBLE_ID = "77777777-7777-4777-8777-777777777777"
const BATHROOM_SHOWER_ID = "88888888-8888-4888-8888-888888888888"
const OTHER_SUPPLIER_SUITE_ID = "99999999-9999-4999-8999-999999999999"

function suiteVocabMock() {
  return createSupabaseMock({
    suite_types: [
      { id: SUITE_ID, supplier_id: SUPPLIER_ID, name: "Deluxe", active: true },
      { id: OTHER_SUPPLIER_SUITE_ID, supplier_id: "other-supplier", name: "Royal Suite", active: true },
    ],
    bedroom_types: [
      { id: BEDROOM_TWIN_ID, supplier_id: SUPPLIER_ID, name: "Twin", archived_at: null },
      { id: BEDROOM_DOUBLE_ID, supplier_id: SUPPLIER_ID, name: "Double", archived_at: null },
    ],
    bedroom_layouts: [],
    bathroom_types: [
      { id: BATHROOM_SHOWER_ID, supplier_id: SUPPLIER_ID, name: "Shower", archived_at: null },
    ],
    suite_type_bedroom_types: [
      { suite_type_id: SUITE_ID, bedroom_type_id: BEDROOM_TWIN_ID },
      { suite_type_id: SUITE_ID, bedroom_type_id: BEDROOM_DOUBLE_ID },
    ],
    suite_type_bedroom_layouts: [],
    suite_type_bathroom_types: [
      { suite_type_id: SUITE_ID, bathroom_type_id: BATHROOM_SHOWER_ID },
    ],
    suite_vocab_aliases: [],
  })
}

describe("POST /api/enquiries suite units", () => {
  it("keeps client-supplied ids that belong to the supplier", async () => {
    const { supabase } = suiteVocabMock()

    const { units } = await resolveEnquirySuiteUnits(supabase as never, SUPPLIER_ID, [
      {
        suiteNumber: 1,
        rawPhrase: "Deluxe Twin with shower",
        suiteTypeId: SUITE_ID,
        bedroomTypeId: BEDROOM_TWIN_ID,
        bathroomTypeId: BATHROOM_SHOWER_ID,
      },
    ])

    expect(units[0]).toMatchObject({
      suiteTypeId: SUITE_ID,
      suiteTypeName: "Deluxe",
      bedroomTypeId: BEDROOM_TWIN_ID,
      bathroomTypeId: BATHROOM_SHOWER_ID,
    })
  })

  it("nulls an id that belongs to a different supplier instead of rejecting the enquiry", async () => {
    const { supabase } = suiteVocabMock()

    const { units } = await resolveEnquirySuiteUnits(supabase as never, SUPPLIER_ID, [
      { suiteNumber: 1, rawPhrase: "", suiteTypeId: OTHER_SUPPLIER_SUITE_ID },
    ])

    // Losing one bad reference beats losing the whole enquiry.
    expect(units[0].suiteTypeId).toBeNull()
  })

  it("drops a config value the chosen suite type does not offer", async () => {
    const { supabase } = suiteVocabMock()

    const { units } = await resolveEnquirySuiteUnits(supabase as never, SUPPLIER_ID, [
      {
        suiteNumber: 1,
        rawPhrase: "",
        suiteTypeId: SUITE_ID,
        // This supplier has no bedroom layouts at all, so any layout id is invalid.
        bedroomLayoutId: "11111111-1111-4111-8111-111111111111",
      },
    ])

    expect(units[0].suiteTypeId).toBe(SUITE_ID)
    expect(units[0].bedroomLayoutId).toBeNull()
  })

  it("re-resolves server-side when the client sent wording but no ids", async () => {
    const { supabase } = suiteVocabMock()

    const { units } = await resolveEnquirySuiteUnits(supabase as never, SUPPLIER_ID, [
      { suiteNumber: 1, rawPhrase: "Deluxe Twin with shower", suiteTypeId: null },
    ])

    expect(units[0]).toMatchObject({
      suiteTypeId: SUITE_ID,
      bedroomTypeId: BEDROOM_TWIN_ID,
      bathroomTypeId: BATHROOM_SHOWER_ID,
    })
  })

  it("leaves everything null when wording matches nothing, rather than picking a placeholder", async () => {
    const { supabase } = suiteVocabMock()

    const { units } = await resolveEnquirySuiteUnits(supabase as never, SUPPLIER_ID, [
      { suiteNumber: 1, rawPhrase: "Harmonic Mountain Suite" },
    ])

    expect(units[0].suiteTypeId).toBeNull()
    expect(units[0].rawPhrase).toBe("Harmonic Mountain Suite")
  })

  it("converts the public web form's name-only shape into units", async () => {
    const { supabase } = suiteVocabMock()

    const { units } = await resolveEnquirySuiteUnits(
      supabase as never,
      SUPPLIER_ID,
      legacySuiteNamesToUnits(["Deluxe"]),
    )

    expect(units).toHaveLength(1)
    expect(units[0].suiteTypeId).toBe(SUITE_ID)
  })

  it("keeps wording but resolves nothing when no supplier is known", async () => {
    const { supabase } = suiteVocabMock()

    const { units, vocabulary } = await resolveEnquirySuiteUnits(supabase as never, null, [
      { suiteNumber: 1, rawPhrase: "Deluxe Twin with shower", suiteTypeId: SUITE_ID },
    ])

    expect(vocabulary).toBeNull()
    expect(units[0].suiteTypeId).toBeNull()
    expect(units[0].rawPhrase).toBe("Deluxe Twin with shower")
  })
})

describe("mergeEnquiryFormFields", () => {
  const parsedSnapshot = {
    direction: "Pretoria to Cape Town",
    supplier: "Rovos Rail",
    departureDateRaw: "2027-09-02",
    packageOption: "",
  }

  // The bug: the consultant corrects the route on the review screen, it matches no `routes` row,
  // and the Enquiry tab's formFields fallback then renders the ORIGINAL parsed wording instead.
  it("replaces the parsed direction with the consultant's correction", () => {
    const merged = mergeEnquiryFormFields(parsedSnapshot, { direction: "Pretoria to Victoria Falls" })

    expect(merged.direction).toBe("Pretoria to Victoria Falls")
  })

  it("keeps the parsed direction when the caller submits none", () => {
    expect(mergeEnquiryFormFields(parsedSnapshot, {}).direction).toBe("Pretoria to Cape Town")
    expect(mergeEnquiryFormFields(parsedSnapshot, { direction: "" }).direction).toBe(
      "Pretoria to Cape Town",
    )
  })

  // A paste import sends `supplierId`, never free-text `supplier`; blanking the parsed wording
  // would lose what the customer actually named when the id fails to resolve.
  it("leaves the parsed supplier wording alone unless free text was submitted", () => {
    expect(mergeEnquiryFormFields(parsedSnapshot, {}).supplier).toBe("Rovos Rail")
    expect(mergeEnquiryFormFields(parsedSnapshot, { supplier: "Blue Train" }).supplier).toBe(
      "Blue Train",
    )
  })

  it("preserves snapshot keys it does not own and tolerates a missing snapshot", () => {
    expect(mergeEnquiryFormFields(parsedSnapshot, {}).departureDateRaw).toBe("2027-09-02")
    expect(mergeEnquiryFormFields(null, { direction: "Alpha to Beta" })).toMatchObject({
      direction: "Alpha to Beta",
      province: null,
      packageOption: null,
    })
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

  it("returns repeat status for an existing customer with a completed trip", async () => {
    const state = createMockState({ completedBookingCustomerIds: new Set([CUSTOMER_ID]) })
    const supabase = createSupabase(state)

    const result = await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput())

    expect(result.customerIsRepeatClient).toBe(true)
    expect(state.customerUpdateRows[0]).toEqual({
      id: CUSTOMER_ID,
      payload: expect.not.objectContaining({ is_repeat_client: expect.anything() }),
    })
  })

  // F05-1 related risk: an enquiry that carries no country used to write
  // country: null over an existing customer, after which `customer_complete`
  // blocks every forward stage move and the field cannot be repaired.
  it("does not null out contact details the enquiry did not carry", async () => {
    const state = createMockState()
    const supabase = createSupabase(state)

    await resolveEnquiryCustomer(
      supabase as never,
      enquiryCustomerInput({ country: null, province: null, phone: null, title: null }),
    )

    expect(state.customerUpdateRows[0]?.payload).toEqual(
      expect.not.objectContaining({
        country: expect.anything(),
        province: expect.anything(),
        phone: expect.anything(),
        title: expect.anything(),
      }),
    )
  })

  it("still writes the contact details an enquiry does carry", async () => {
    const state = createMockState()
    const supabase = createSupabase(state)

    await resolveEnquiryCustomer(supabase as never, enquiryCustomerInput({ country: "Germany" }))

    expect(state.customerUpdateRows[0]?.payload).toMatchObject({
      country: "Germany",
      phone: "+27 82 000 0000",
      title: "Ms",
    })
  })

  // Customer detail -> New Enquiry opens the review screen with this customer prefilled and lets
  // the consultant correct it. The preset branch used to return before writing, so every
  // correction made there was silently thrown away.
  it("writes the corrections an enquiry carries onto a preset linked customer", async () => {
    const state = createMockState({
      customersByEmail: new Map([[CUSTOMER_ID, { id: CUSTOMER_ID }]]),
    })
    const supabase = createSupabase(state)

    const result = await resolveEnquiryCustomer(
      supabase as never,
      enquiryCustomerInput({
        existingCustomerId: CUSTOMER_ID,
        normalizedEmail: undefined,
        phone: "+49 30 111 2222",
        country: "Germany",
      }),
    )

    expect(result.customerId).toBe(CUSTOMER_ID)
    expect(state.customerInsertRows).toHaveLength(0)
    expect(state.customerUpdateRows[0]).toMatchObject({
      id: CUSTOMER_ID,
      payload: expect.objectContaining({ phone: "+49 30 111 2222", country: "Germany" }),
    })
  })

  it("does not null out a preset linked customer's details the enquiry did not carry", async () => {
    const state = createMockState({
      customersByEmail: new Map([[CUSTOMER_ID, { id: CUSTOMER_ID }]]),
    })
    const supabase = createSupabase(state)

    await resolveEnquiryCustomer(
      supabase as never,
      enquiryCustomerInput({
        existingCustomerId: CUSTOMER_ID,
        normalizedEmail: undefined,
        country: null,
        province: null,
        phone: null,
        title: null,
      }),
    )

    expect(state.customerUpdateRows[0]?.payload).toEqual(
      expect.not.objectContaining({
        country: expect.anything(),
        province: expect.anything(),
        phone: expect.anything(),
        title: expect.anything(),
      }),
    )
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

describe("readYesNoFlag", () => {
  // The schema accepts a string here, and additional_services used to be read with a bare `!!`:
  // a website posting the form's own wording stored every "No" as an affirmative.
  it("reads a declined string answer as false", () => {
    expect(readYesNoFlag("No")).toBe(false)
    expect(readYesNoFlag("no")).toBe(false)
    expect(readYesNoFlag("false")).toBe(false)
  })

  it("reads an affirmative string answer as true, whatever its casing", () => {
    expect(readYesNoFlag("yes")).toBe(true)
    expect(readYesNoFlag("Yes")).toBe(true)
    expect(readYesNoFlag(" YES ")).toBe(true)
    expect(readYesNoFlag("true")).toBe(true)
  })

  it("passes a real boolean through and treats nothing as false", () => {
    expect(readYesNoFlag(true)).toBe(true)
    expect(readYesNoFlag(false)).toBe(false)
    expect(readYesNoFlag(null)).toBe(false)
    expect(readYesNoFlag(undefined)).toBe(false)
    expect(readYesNoFlag("")).toBe(false)
  })
})
