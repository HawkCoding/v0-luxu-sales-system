import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const CUSTOMER_ID = "customer-1"
const OTHER_CUSTOMER_ID = "customer-2"
const INITIAL_UPDATED_AT = "2026-08-01T00:00:00.000Z"

function baseCustomerRow(overrides: MockRow = {}): MockRow {
  return {
    id: CUSTOMER_ID,
    notes: "original notes",
    email: "jane@example.com",
    first_name: "Jane",
    last_name: "Doe",
    title: null,
    phone: "0110000000",
    fax: null,
    country: null,
    province: null,
    company_name: null,
    address_line1: null,
    address_line2: null,
    city: null,
    postal_code: null,
    vat_number: null,
    date_of_birth: null,
    id_passport: null,
    vip_status: false,
    preferences: null,
    communication_preferences: null,
    first_travel_date: null,
    last_travel_date: null,
    updated_at: INITIAL_UPDATED_AT,
    ...overrides,
  }
}

function seedSupabase(options: { customers?: MockRow[]; role?: string | null } = {}) {
  const { customers = [baseCustomerRow()], role = "consultant" } = options
  const mock = createSupabaseMock({
    customers,
    profiles: role ? [{ user_id: USER_ID, clearance_level: role }] : [],
    bookings: [],
  })

  const supabase = {
    ...mock.supabase,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
  }

  return { supabase, store: mock.store }
}

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/customers/${CUSTOMER_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function routeParams() {
  return { params: Promise.resolve({ id: CUSTOMER_ID }) }
}

/** Minimal valid patch body: unchanged notes/email/phone plus one override. */
function validPatchBody(overrides: Record<string, unknown> = {}) {
  return {
    notes: "original notes",
    email: "jane@example.com",
    first_name: "Jane",
    last_name: "Doe",
    phone: "0110000000",
    vip_status: false,
    ...overrides,
  }
}

describe("PATCH /api/customers/[id]", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 409 DUPLICATE_EMAIL (not STALE_VERSION) when the new email belongs to another customer", async () => {
    const { supabase } = seedSupabase({
      customers: [
        baseCustomerRow(),
        baseCustomerRow({ id: OTHER_CUSTOMER_ID, email: "taken@example.com" }),
      ],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest(validPatchBody({ email: "taken@example.com" })),
      routeParams(),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe("DUPLICATE_EMAIL")
    expect(payload.existingCustomer.id).toBe(OTHER_CUSTOMER_ID)
  })

  it("succeeds despite a stale expectedUpdatedAt when the baseline doesn't overlap the drifted field", async () => {
    // Row's updated_at moved on (e.g. a traveller save touched the customer),
    // but the field the caller is editing (phone) matches their baseline.
    const { supabase, store } = seedSupabase({
      customers: [baseCustomerRow({ updated_at: "2026-08-01T01:00:00.000Z", notes: "sibling write changed this" })],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest(
        validPatchBody({
          phone: "0229999999",
          expectedUpdatedAt: INITIAL_UPDATED_AT,
          baseline: { phone: "0110000000" },
        }),
      ),
      routeParams(),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.phone).toBe("0229999999")
    expect(store.rows("customers")[0].phone).toBe("0229999999")
  })

  it("returns 409 FIELD_CONFLICT listing the field when another user changed the same field", async () => {
    const { supabase } = seedSupabase({
      customers: [baseCustomerRow({ updated_at: "2026-08-01T01:00:00.000Z", phone: "0221111111" })],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest(
        validPatchBody({
          phone: "0229999999",
          expectedUpdatedAt: INITIAL_UPDATED_AT,
          baseline: { phone: "0110000000" },
        }),
      ),
      routeParams(),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe("FIELD_CONFLICT")
    expect(payload.fields).toEqual(["phone"])
  })

  it("without a baseline, falls back to the row-version check exactly as before", async () => {
    const { supabase } = seedSupabase({
      customers: [baseCustomerRow({ updated_at: "2026-08-01T01:00:00.000Z" })],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest(validPatchBody({ phone: "0229999999", expectedUpdatedAt: INITIAL_UPDATED_AT })),
      routeParams(),
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe("STALE_VERSION")
  })

  // F05-2: these five used to be written unconditionally from optional Zod
  // values, so a patch that omitted them collapsed them to null / false.
  it("leaves fields the caller did not send untouched", async () => {
    const { supabase, store } = seedSupabase({
      customers: [
        baseCustomerRow({
          country: "South Africa",
          province: "Western Cape",
          date_of_birth: "1980-05-04",
          vip_status: true,
          preferences: "Lower berth",
          communication_preferences: "Email only",
          id_passport: "QA7654321",
        }),
      ],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest({
        notes: "just a note",
        email: "jane@example.com",
        first_name: "Jane",
        last_name: "Doe",
        phone: "0110000000",
      }),
      routeParams(),
    )

    expect(response.status).toBe(200)

    const row = store.rows("customers")[0]
    expect(row.notes).toBe("just a note")
    expect(row.country).toBe("South Africa")
    expect(row.province).toBe("Western Cape")
    expect(row.date_of_birth).toBe("1980-05-04")
    expect(row.vip_status).toBe(true)
    expect(row.preferences).toBe("Lower berth")
    expect(row.communication_preferences).toBe("Email only")
    expect(row.id_passport).toBe("QA7654321")
  })

  it("still clears a field when the caller explicitly sends null", async () => {
    const { supabase, store } = seedSupabase({
      customers: [baseCustomerRow({ province: "Western Cape", vip_status: true })],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest(validPatchBody({ province: null, vip_status: false })),
      routeParams(),
    )

    expect(response.status).toBe(200)
    expect(store.rows("customers")[0].province).toBeNull()
    expect(store.rows("customers")[0].vip_status).toBe(false)
  })

  // F05-1: country was absent from the patch schema, so it was silently
  // discarded and a customer with a null country could never be repaired.
  it("persists a country change", async () => {
    const { supabase, store } = seedSupabase({
      customers: [baseCustomerRow({ country: "South Africa" })],
    })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchRequest(validPatchBody({ country: "Germany" })), routeParams())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.country).toBe("Germany")
    expect(store.rows("customers")[0].country).toBe("Germany")
  })

  // F05-4
  it("rejects a phone number that is not dialable", async () => {
    const { supabase, store } = seedSupabase()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      patchRequest(validPatchBody({ phone: "((((not a phone))))###" })),
      routeParams(),
    )

    expect(response.status).toBe(400)
    expect(store.rows("customers")[0].phone).toBe("0110000000")
  })

  it("returns 403 (not 409) when the caller lacks a role permitted to edit customers", async () => {
    const { supabase } = seedSupabase({ role: "readonly" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchRequest(validPatchBody()), routeParams())

    expect(response.status).toBe(403)
  })
})
