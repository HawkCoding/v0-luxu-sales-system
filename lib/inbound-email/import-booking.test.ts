import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { REVIEW_REASON } from "@/lib/inbound-email/review-reasons"

const importBookingMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  bookingSequence: 0,
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: importBookingMocks.createServiceClient,
}))

vi.mock("@/lib/job-numbering", () => ({
  allocateJobNumberForBooking: vi.fn(async () => {
    importBookingMocks.bookingSequence += 1
    return {
      bookingNumber: `LTT-2026-${String(importBookingMocks.bookingSequence).padStart(4, "0")}`,
    }
  }),
}))

import { createEmailBookingFromParsedDraft } from "./import-booking"

interface ExistingCustomer {
  id: string
  email: string
  first_name: string
  last_name: string
}

interface MockLocation {
  id: string
  name: string
}

interface MockTrainSupplier {
  id: string
  name: string
  kind: string
  active: boolean
  /** Only suppliers that may head a booking of their own are scanned for -- see
   *  resolveStandaloneSupplier. Both operators here qualify. */
  sells_standalone: boolean
}

interface MockRoute {
  id: string
  name: string
  supplier_id: string
  origin_location_id: string | null
  destination_location_id: string | null
  direction_mode: "one_way" | "round_trip"
  duration_days?: number | null
  active: boolean
}

const DEFAULT_LOCATIONS: MockLocation[] = [
  { id: "loc-pta", name: "Pretoria" },
  { id: "loc-cpt", name: "Cape Town" },
  { id: "loc-dur", name: "Durban" },
  { id: "loc-dar", name: "Dar es Salaam" },
]

const DEFAULT_TRAIN_SUPPLIERS: MockTrainSupplier[] = [
  { id: "sup-rovos", name: "Rovos Rail", kind: "train_operator", active: true, sells_standalone: true },
  { id: "sup-blue", name: "Blue Train", kind: "train_operator", active: true, sells_standalone: true },
]

const DEFAULT_ROUTES: MockRoute[] = [
  { id: "route-rovos-pta-cpt", name: "Cape Town Journey", supplier_id: "sup-rovos", origin_location_id: "loc-pta", destination_location_id: "loc-cpt", direction_mode: "round_trip", active: true },
  { id: "route-blue-pta-cpt", name: "Pretoria to Cape Town", supplier_id: "sup-blue", origin_location_id: "loc-pta", destination_location_id: "loc-cpt", direction_mode: "round_trip", active: true },
  { id: "route-rovos-cpt-dar", name: "Dar Es Salaam Journey", supplier_id: "sup-rovos", origin_location_id: "loc-cpt", destination_location_id: "loc-dar", direction_mode: "round_trip", active: true },
  { id: "route-rovos-pta-dur-oneway", name: "Durban Safari", supplier_id: "sup-rovos", origin_location_id: "loc-pta", destination_location_id: "loc-dur", direction_mode: "one_way", active: true },
]

interface MockState {
  existingCustomers: ExistingCustomer[]
  completedCustomerIds: Set<string>
  duplicateBookingId: string | null
  locations: MockLocation[]
  trainSuppliers: MockTrainSupplier[]
  routes: MockRoute[]
  customerInsertRows: Array<Record<string, unknown>>
  customerUpdateRows: Array<{ id: string; payload: Record<string, unknown> }>
  bookingInsertRows: Array<Record<string, unknown>>
  suiteInsertRows: Array<Record<string, unknown>>
  auditRows: Array<Record<string, unknown>>
  serviceInsertRows: Array<Record<string, unknown>>
}

function createState(overrides: Partial<MockState> = {}): MockState {
  return {
    existingCustomers: [],
    completedCustomerIds: new Set(),
    duplicateBookingId: null,
    locations: DEFAULT_LOCATIONS,
    trainSuppliers: DEFAULT_TRAIN_SUPPLIERS,
    routes: DEFAULT_ROUTES,
    customerInsertRows: [],
    customerUpdateRows: [],
    bookingInsertRows: [],
    suiteInsertRows: [],
    auditRows: [],
    serviceInsertRows: [],
    ...overrides,
  }
}

function createFilterableListQuery<T>(rows: T[]) {
  const filters: Record<string, unknown> = {}
  const matching = () =>
    rows.filter((row) =>
      Object.entries(filters).every(([key, value]) => {
        const cell = (row as Record<string, unknown>)[key]
        // `.is(col, null)` also matches an absent key, mirroring SQL IS NULL.
        if (value === null) return cell === null || cell === undefined
        return cell === value
      }),
    )
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value
      return query
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters[column] = value
      return query
    }),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: matching()[0] ?? null, error: null })),
    ...createThenable(() => ({ data: matching(), error: null })),
  }
  return query
}

function createThenable<T>(getValue: () => { data: T; error: null }) {
  return {
    then<TResult1 = { data: T; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(getValue()).then(onfulfilled, onrejected)
    },
  }
}

function createSupabase(state: MockState) {
  return {
    from: vi.fn((table: string) => {
      if (table === "countries") {
        return {
          select: vi.fn(async () => ({
            data: [{ id: "country-za", name: "South Africa", iso_alpha2: "ZA", iso_alpha3: "ZAF" }],
            error: null,
          })),
        }
      }

      if (table === "country_aliases") {
        return {
          select: vi.fn(async () => ({ data: [], error: null })),
        }
      }

      if (table === "customers") {
        return {
          select: vi.fn(() => {
            const filters: Record<string, string> = {}
            const query = {
              eq: vi.fn((column: string, value: string) => {
                filters[column] = value
                return query
              }),
              ilike: vi.fn((column: string, value: string) => {
                filters[column] = value.replaceAll("%", "")
                return query
              }),
              maybeSingle: vi.fn(async () => ({
                data:
                  typeof filters.email === "string"
                    ? (state.existingCustomers.find(
                        (customer) => customer.email.toLowerCase() === filters.email.toLowerCase(),
                      ) ?? null)
                    : null,
                error: null,
              })),
              then<TResult1 = { data: ExistingCustomer[]; error: null }, TResult2 = never>(
                onfulfilled?: ((value: { data: ExistingCustomer[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
              ): Promise<TResult1 | TResult2> {
                const data = state.existingCustomers.filter((customer) => {
                  const firstNameMatches =
                    !filters.first_name ||
                    customer.first_name.toLowerCase() === filters.first_name.toLowerCase()
                  const lastNameMatches =
                    !filters.last_name ||
                    customer.last_name.toLowerCase() === filters.last_name.toLowerCase()
                  return firstNameMatches && lastNameMatches
                })
                return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
              },
            }
            return query
          }),
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
                single: vi.fn(async () => ({
                  data: { id: `customer-new-${state.customerInsertRows.length}` },
                  error: null,
                })),
              })),
            }
          }),
        }
      }

      if (table === "bookings") {
        return {
          select: vi.fn(() => {
            const filters: Record<string, string> = {}
            let isRepeatQuery = false
            const query = {
              eq: vi.fn((column: string, value: string) => {
                filters[column] = value
                return query
              }),
              in: vi.fn(() => {
                isRepeatQuery = true
                return query
              }),
              gte: vi.fn(() => query),
              order: vi.fn(() => query),
              limit: vi.fn(() => query),
              maybeSingle: vi.fn(async () => ({
                data: state.duplicateBookingId ? { id: state.duplicateBookingId } : null,
                error: null,
              })),
              ...createThenable(() => ({
                data:
                  isRepeatQuery && state.completedCustomerIds.has(filters.customer_id)
                    ? [{ id: "completed-booking" }]
                    : [],
                error: null,
              })),
            }
            return query
          }),
          insert: vi.fn((row: Record<string, unknown>) => {
            state.bookingInsertRows.push(row)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: `booking-${state.bookingInsertRows.length}`, booking_number: row.booking_number },
                  error: null,
                })),
              })),
            }
          }),
        }
      }

      if (table === "locations") {
        return {
          select: vi.fn(() => ({
            ...createFilterableListQuery(state.locations),
            then: createThenable(() => ({ data: state.locations, error: null })).then,
          })),
        }
      }

      if (table === "suppliers") {
        return {
          select: vi.fn(() => createFilterableListQuery(state.trainSuppliers)),
        }
      }

      if (table === "routes") {
        return {
          select: vi.fn(() => createFilterableListQuery(state.routes)),
        }
      }

      if (table === "packages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "booking_suites") {
        return {
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            state.suiteInsertRows = rows
            return { error: null }
          }),
          // seedUnitsForServices (auto-build) reads back what was just captured -- these tests
          // never populate suiteInsertRows with a resolved suite_type_id, so there is nothing to
          // carry across; that carry-over itself is covered in lib/packages/seed-service-units.test.ts.
          select: vi.fn(() => createFilterableListQuery(state.suiteInsertRows)),
        }
      }

      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            state.auditRows.push(row)
            return { error: null }
          }),
        }
      }

      // Auto-build (lib/auto-build/build-from-enquiry.ts) and its draft-quote pricing
      // (lib/quotes/create-draft-quote.ts). These tests cover customer/route/duplicate matching,
      // so a graceful no-op here is enough -- auto-build's own behaviour is covered in
      // lib/auto-build/build-from-enquiry.test.ts, and the quote-pricing wiring in
      // lib/quotes/create-draft-quote.test.ts.
      if (table === "booking_services") {
        return {
          select: vi.fn(() => createFilterableListQuery(state.serviceInsertRows)),
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            state.serviceInsertRows.push(...rows)
            return { error: null }
          }),
        }
      }
      if (table === "booking_service_units" || table === "quote_line_items" || table === "rate_cards" || table === "vehicle_rental_route_details") {
        return {
          select: vi.fn(() => createFilterableListQuery([])),
          insert: vi.fn(async () => ({ error: null })),
          in: vi.fn(() => createFilterableListQuery([])),
        }
      }
      // app_settings backs the default age buckets and the default commission the auto-drafted
      // quote prices with -- empty here, so both fall back to their built-in defaults.
      if (table === "rate_types" || table === "app_settings") {
        return {
          select: vi.fn(() => createFilterableListQuery([])),
        }
      }
      if (table === "quotes") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "quote-1" }, error: null })),
            })),
          })),
        }
      }

      // Suite vocabulary + alias lookups (lib/suites). These tests cover customer/route/duplicate
      // matching, so the vocabulary is intentionally empty: with nothing to match against, suite
      // wording is preserved verbatim and resolves to null, which is the behaviour under test
      // elsewhere (lib/suites/resolve-suite-phrase.test.ts).
      if (
        table === "suite_types" ||
        table === "bedroom_types" ||
        table === "bedroom_layouts" ||
        table === "bathroom_types" ||
        table === "suite_vocab_aliases" ||
        table === "suite_type_bedroom_types" ||
        table === "suite_type_bedroom_layouts" ||
        table === "suite_type_bathroom_types"
      ) {
        return {
          select: vi.fn(() => createFilterableListQuery([])),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function parsedFixture(email: string): ReturnType<typeof parseEmailDraft> {
  return parseEmailDraft(`
Please indicate the purpose of your request
Quote
Title
Ms
Name
Jane
Surname
Doe
Contact Number
0723093611
Email
${email}
Country
South Africa
Blue Train Information
Direction
Pretoria to Cape Town
Departure Date
11 May 2026
No. of Adults
2
No of Suites
1
Suite Type 1
Deluxe Twin with shower
`)
}

async function importFixture(state: MockState, email: string) {
  importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))

  return createEmailBookingFromParsedDraft(parsedFixture(email), {
    emailAccountId: "account-1",
    mailboxEmail: "bookings@example.com",
    subject: "Blue Train enquiry",
    receivedAt: "2026-05-17T10:00:00.000Z",
    rawText: parsedFixture(email).rawText,
    missingFields: [],
    warnings: [],
  })
}

describe("createEmailBookingFromParsedDraft customer matching", () => {
  beforeEach(() => {
    importBookingMocks.createServiceClient.mockReset()
    importBookingMocks.bookingSequence = 0
  })

  it("links an existing email to the existing customer on import", async () => {
    const state = createState({
      existingCustomers: [
        { id: "customer-existing", email: "jane@example.com", first_name: "Jane", last_name: "Doe" },
      ],
    })

    await importFixture(state, "jane@example.com")

    expect(state.customerInsertRows).toHaveLength(0)
    expect(state.customerUpdateRows[0]?.id).toBe("customer-existing")
    expect(state.bookingInsertRows[0]).toEqual(
      expect.objectContaining({
        customer_id: "customer-existing",
        is_repeat_client_at_creation: false,
      }),
    )
  })

  // The discount the customer was promised on the form used to be parsed, carried onto the
  // payload, and then silently dropped at the insert -- with no screen able to put it back.
  it("stores the promotion code the enquiry form carried", async () => {
    const state = createState()

    importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))
    const draft = parsedFixture("promo@example.com")
    const withPromo = {
      ...draft,
      formFields: { ...draft.formFields, promotionCode: "KS2025" },
    }
    await createEmailBookingFromParsedDraft(withPromo, {
      emailAccountId: "account-1",
      mailboxEmail: "bookings@example.com",
      subject: "Blue Train enquiry",
      receivedAt: "2026-05-17T10:00:00.000Z",
      rawText: draft.rawText,
      missingFields: [],
      warnings: [],
    })

    expect(state.bookingInsertRows[0]).toEqual(
      expect.objectContaining({ promotion_code: "KS2025" }),
    )
  })

  it("creates a new customer for a new email", async () => {
    const state = createState()

    await importFixture(state, "new@example.com")

    expect(state.customerInsertRows).toEqual([
      expect.objectContaining({
        first_name: "Jane",
        last_name: "Doe",
        email: "new@example.com",
      }),
    ])
    expect(state.bookingInsertRows[0]).toEqual(
      expect.objectContaining({
        customer_id: "customer-new-1",
        is_repeat_client_at_creation: false,
      }),
    )
  })

  it("creates a new customer for the same name with a different email", async () => {
    const state = createState({
      existingCustomers: [
        { id: "customer-existing", email: "old@example.com", first_name: "Jane", last_name: "Doe" },
      ],
    })

    await importFixture(state, "new@example.com")

    expect(state.customerInsertRows).toEqual([
      expect.objectContaining({
        first_name: "Jane",
        last_name: "Doe",
        email: "new@example.com",
      }),
    ])
    expect(state.bookingInsertRows[0]?.customer_id).toBe("customer-new-1")
  })

  it("sets repeat-at-creation for prior voucher-sent customers and leaves it unset otherwise", async () => {
    const repeatState = createState({
      existingCustomers: [
        { id: "customer-repeat", email: "repeat@example.com", first_name: "Jane", last_name: "Doe" },
      ],
      completedCustomerIds: new Set(["customer-repeat"]),
    })
    const newState = createState({
      existingCustomers: [
        { id: "customer-newish", email: "newish@example.com", first_name: "Jane", last_name: "Doe" },
      ],
    })

    await importFixture(repeatState, "repeat@example.com")
    await importFixture(newState, "newish@example.com")

    expect(repeatState.bookingInsertRows[0]?.is_repeat_client_at_creation).toBe(true)
    expect(newState.bookingInsertRows[0]?.is_repeat_client_at_creation).toBe(false)
  })
})

describe("createEmailBookingFromParsedDraft duplicate detection", () => {
  beforeEach(() => {
    importBookingMocks.createServiceClient.mockReset()
    importBookingMocks.bookingSequence = 0
  })

  it("flags a possible duplicate and audits it when a recent booking exists for the same email", async () => {
    const state = createState({
      existingCustomers: [
        { id: "customer-existing", email: "jane@example.com", first_name: "Jane", last_name: "Doe" },
      ],
      duplicateBookingId: "booking-prior",
    })

    const result = await importFixture(state, "jane@example.com")

    expect(result.duplicateOfBookingId).toBe("booking-prior")
    expect(state.bookingInsertRows[0]).toEqual(
      expect.objectContaining({
        email_import_duplicate_of_booking_id: "booking-prior",
        // A possible duplicate forces review on its own, even when every field parsed cleanly --
        // otherwise a second enquiry from the same customer would auto-create a second booking
        // with nobody ever looking at it.
        email_import_needs_review: true,
      }),
    )
    expect(state.auditRows).toContainEqual(
      expect.objectContaining({
        action: "possible_duplicate_email_import",
        meta_json: { duplicate_of_booking_id: "booking-prior" },
      }),
    )
  })

  it("records the duplicate as a review reason so the banner can name it", async () => {
    const state = createState({
      existingCustomers: [
        { id: "customer-existing", email: "jane@example.com", first_name: "Jane", last_name: "Doe" },
      ],
      duplicateBookingId: "booking-prior",
    })

    const result = await importFixture(state, "jane@example.com")

    // The flag used to be raised by the duplicate alone while missing_fields stayed empty, which
    // left the review banner with nothing to show but a placeholder.
    expect(result.needsReview).toBe(true)
    expect(result.missingFields).toContain(REVIEW_REASON.possibleDuplicate)
    expect(state.bookingInsertRows[0].email_import_missing_fields).toContain(
      REVIEW_REASON.possibleDuplicate,
    )
  })

  it("does not flag a duplicate when no recent matching booking exists", async () => {
    const state = createState({
      existingCustomers: [
        { id: "customer-existing", email: "jane@example.com", first_name: "Jane", last_name: "Doe" },
      ],
    })

    const result = await importFixture(state, "jane@example.com")

    expect(result.duplicateOfBookingId).toBeNull()
    expect(state.bookingInsertRows[0]).toEqual(
      expect.objectContaining({ email_import_duplicate_of_booking_id: null }),
    )
    expect(
      state.auditRows.some((row) => row.action === "possible_duplicate_email_import"),
    ).toBe(false)
  })
})

describe("createEmailBookingFromParsedDraft resolution-failure review gate", () => {
  beforeEach(() => {
    importBookingMocks.createServiceClient.mockReset()
    importBookingMocks.bookingSequence = 0
  })

  it("flags review when the customer named a supplier that doesn't match any active supplier, even though every other field parsed cleanly", async () => {
    // The parser recognised "Blue Train" (so validateDraft's raw-text check passes and this
    // wouldn't have been caught pre-resolution), but no such supplier exists in this state --
    // auto-build would otherwise silently no-op on this booking with nobody the wiser.
    const state = createState({ trainSuppliers: [] })

    await importFixture(state, "jane@example.com")

    expect(state.bookingInsertRows[0]).toEqual(
      expect.objectContaining({
        email_import_needs_review: true,
        email_import_missing_fields: expect.arrayContaining([
          "Train operator not matched to an active supplier",
        ]),
      }),
    )
  })

  it("does not add a resolution-failure reason when the supplier resolves normally", async () => {
    const state = createState()

    await importFixture(state, "jane@example.com")

    // The fixture's suite type doesn't resolve against this state's (empty) suite vocabulary, so
    // needs_review is still true overall -- what this asserts is that the *supplier* resolution
    // gate specifically doesn't fire when the supplier resolved fine.
    expect(state.bookingInsertRows[0]?.email_import_missing_fields).not.toContain(
      "Train operator not matched to an active supplier",
    )
  })
})

describe("createEmailBookingFromParsedDraft passenger counts", () => {
  beforeEach(() => {
    importBookingMocks.createServiceClient.mockReset()
    importBookingMocks.bookingSequence = 0
  })

  it("stores 0 rather than inventing an adult and a suite the email never gave", async () => {
    // The importer used to write `payload.noOfAdults || 1` / `noOfSuites || 1`, so an email with
    // no pax detail was stored as 1 adult + 1 suite with zero booking_suites rows -- a booking
    // claiming a suite it does not have, in an importer whose own parser refuses to guess.
    const draft = parseEmailDraft(`
Name
Sarah
Surname
Jones
Email
sarah@example.com
Country
South Africa
Rovos Rail
Direction
Pretoria to Cape Town
Departure Date
11 May 2026
`)
    expect(draft.guests.adults).toBe(0)
    expect(draft.guests.suites).toBe(0)

    const state = createState()
    importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))
    await createEmailBookingFromParsedDraft(draft, {
      emailAccountId: "account-1",
      mailboxEmail: "bookings@example.com",
      subject: "Train enquiry",
      receivedAt: "2026-05-17T10:00:00.000Z",
      rawText: draft.rawText,
      missingFields: ["Adults", "Suites"],
      warnings: [],
    })

    const booking = state.bookingInsertRows[0]
    expect(booking?.no_of_adults).toBe(0)
    expect(booking?.no_of_suites).toBe(0)
    expect(booking?.no_of_adults_original).toBe(0)
    expect(booking?.email_import_needs_review).toBe(true)
    expect(state.suiteInsertRows).toHaveLength(0)
  })
})

describe("createEmailBookingFromParsedDraft route matching", () => {
  beforeEach(() => {
    importBookingMocks.createServiceClient.mockReset()
    importBookingMocks.bookingSequence = 0
  })

  function routeDraft(supplierHeader: string, direction: string) {
    return parseEmailDraft(`
Please indicate the purpose of your request
Quote
Title
Ms
Name
Jane
Surname
Doe
Contact Number
0723093611
Email
jane@example.com
Country
South Africa
${supplierHeader}
Direction
${direction}
Departure Date
11 May 2026
No. of Adults
2
No of Suites
1
Suite Type 1
Deluxe Twin with shower
`)
  }

  async function importRoute(state: MockState, supplierHeader: string, direction: string) {
    importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))
    const parsed = routeDraft(supplierHeader, direction)
    await createEmailBookingFromParsedDraft(parsed, {
      emailAccountId: "account-1",
      mailboxEmail: "bookings@example.com",
      subject: "Train enquiry",
      receivedAt: "2026-05-17T10:00:00.000Z",
      rawText: parsed.rawText,
      missingFields: [],
      warnings: [],
    })
    return state.bookingInsertRows[0]?.route_id ?? null
  }

  it("links the supplier-scoped route for a forward direction", async () => {
    const state = createState()
    expect(await importRoute(state, "Blue Train Information", "Pretoria to Cape Town")).toBe(
      "route-blue-pta-cpt",
    )
  })

  it("disambiguates a shared city pair by the resolved supplier", async () => {
    const state = createState()
    expect(await importRoute(state, "Rovos Rail Information", "Pretoria to Cape Town")).toBe(
      "route-rovos-pta-cpt",
    )
  })

  it("matches a reversed wording for a round-trip route", async () => {
    const state = createState()
    expect(await importRoute(state, "Rovos Rail Information", "Cape Town to Pretoria")).toBe(
      "route-rovos-pta-cpt",
    )
  })

  it("matches a multi-word location pair regardless of order", async () => {
    const state = createState()
    expect(await importRoute(state, "Rovos Rail Information", "Dar es Salaam to Cape Town")).toBe(
      "route-rovos-cpt-dar",
    )
  })

  it("respects direction for a one-way route", async () => {
    const forwardState = createState()
    expect(await importRoute(forwardState, "Rovos Rail Information", "Pretoria to Durban")).toBe(
      "route-rovos-pta-dur-oneway",
    )

    const reverseState = createState()
    expect(await importRoute(reverseState, "Rovos Rail Information", "Durban to Pretoria")).toBeNull()
  })

  it("attaches no route when the supplier is unknown, and says why", async () => {
    // An unresolved operator used to widen the search to every operator's routes and hand the
    // booking whichever one sorted first -- an "Orient Express" enquiry came back carrying The
    // Blue Train's Pretoria <-> Cape Town, flagged only for Supplier. Picking between operators
    // is a guess, so nothing is attached and the gap is named on the booking.
    const state = createState({ trainSuppliers: [] })
    expect(await importRoute(state, "Rovos Rail Information", "Pretoria to Cape Town")).toBeNull()

    const booking = state.bookingInsertRows[0]
    expect(booking?.email_import_needs_review).toBe(true)
    expect(booking?.email_import_missing_fields).toContain(
      "Route not resolved - no train operator matched",
    )
  })

  it("prefers a round_trip route over a one_way sharing the same endpoints", async () => {
    // The real Rovos collision: Pretoria -> Victoria Falls is both the round-trip flagship and a
    // one-way special, which used to resolve to nothing at all.
    const state = createState({
      routes: [
        ...DEFAULT_ROUTES,
        {
          id: "route-rovos-pta-cpt-oneway",
          name: "African Collage Tour",
          supplier_id: "sup-rovos",
          origin_location_id: "loc-pta",
          destination_location_id: "loc-cpt",
          direction_mode: "one_way",
          active: true,
        },
      ],
    })
    expect(await importRoute(state, "Rovos Rail Information", "Pretoria to Cape Town")).toBe(
      "route-rovos-pta-cpt",
    )
  })
})

describe("createEmailBookingFromParsedDraft auto-build wiring", () => {
  beforeEach(() => {
    importBookingMocks.createServiceClient.mockReset()
    importBookingMocks.bookingSequence = 0
  })

  it("auto-builds a booking_services row from the resolved train supplier and route", async () => {
    const state = createState()
    importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))
    const parsed = parseEmailDraft(`
Please indicate the purpose of your request
Quote
Title
Ms
Name
Jane
Surname
Doe
Contact Number
0723093611
Email
jane@example.com
Country
South Africa
Blue Train Information
Direction
Pretoria to Cape Town
Departure Date
11 May 2026
No. of Adults
2
No of Suites
1
Suite Type 1
Deluxe Twin with shower
`)

    await createEmailBookingFromParsedDraft(parsed, {
      emailAccountId: "account-1",
      mailboxEmail: "bookings@example.com",
      subject: "Train enquiry",
      receivedAt: "2026-05-17T10:00:00.000Z",
      rawText: parsed.rawText,
      missingFields: [],
      warnings: [],
    })

    expect(state.serviceInsertRows).toHaveLength(1)
    expect(state.serviceInsertRows[0]).toMatchObject({
      supplier_id: "sup-blue",
      route_id: "route-blue-pta-cpt",
      route_reversed: false,
      selected: true,
      origin: "auto",
    })
    expect(state.auditRows.some((row) => row.action === "booking_auto_built")).toBe(true)
  })

  it("carries children/infants/ages, terms acceptance and a reversed direction onto the booking and rail leg", async () => {
    const state = createState()
    importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))
    const parsed = parseEmailDraft(`Please indicate the purpose of your request
  	Quote
Contact Information
Title
  	Mr
Name
  	Gert
Surname
  	Nell
Contact Number
  	0724370842
Email
  	gert_nell@yahoo.com
Country
  	South Africa
Province
  	Western Cape
Blue Train Information
Direction
  	Cape Town to Pretoria
Departure Date
  	06 August 2026
No. of Adults
  	2
No of Infants
  	1
Infant 1: Age
  	5
No of Children
  	1
Child 1: Age
  	6
No of Suites
  	1
Suite Type 1
  	Deluxe Twin with shower


    I do not require a package

Additional Pre and Post Train Travel Services
Acceptance


    I have read and accept the Terms and Conditions*
`)

    await createEmailBookingFromParsedDraft(parsed, {
      emailAccountId: "account-1",
      mailboxEmail: "bookings@example.com",
      subject: "Train enquiry",
      receivedAt: "2026-08-05T10:00:00.000Z",
      rawText: parsed.rawText,
      missingFields: [],
      warnings: [],
    })

    expect(state.bookingInsertRows[0]).toMatchObject({
      no_of_children: 2,
      child_ages: [5, 6],
      terms_accepted: true,
      route_id: "route-blue-pta-cpt",
    })
    expect(state.serviceInsertRows).toHaveLength(1)
    expect(state.serviceInsertRows[0]).toMatchObject({
      supplier_id: "sup-blue",
      route_id: "route-blue-pta-cpt",
      route_reversed: true,
    })
  })

  it("builds nothing when no train supplier resolves, and never fails the import", async () => {
    const state = createState({ trainSuppliers: [] })
    importBookingMocks.createServiceClient.mockReturnValue(createSupabase(state))
    const parsed = parseEmailDraft(`
Please indicate the purpose of your request
Quote
Title
Ms
Name
Jane
Surname
Doe
Contact Number
0723093611
Email
jane@example.com
Country
South Africa
Departure Date
11 May 2026
No. of Adults
2
`)

    const result = await createEmailBookingFromParsedDraft(parsed, {
      emailAccountId: "account-1",
      mailboxEmail: "bookings@example.com",
      subject: "Enquiry",
      receivedAt: "2026-05-17T10:00:00.000Z",
      rawText: parsed.rawText,
      missingFields: [],
      warnings: [],
    })

    expect(result.id).toBeTruthy()
    expect(state.serviceInsertRows).toHaveLength(0)
  })
})
