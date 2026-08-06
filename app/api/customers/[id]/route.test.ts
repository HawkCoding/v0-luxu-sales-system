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
    phone: "0110000000",
    fax: null,
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
    default_rate_type_id: null,
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

  it("returns 403 (not 409) when the caller lacks a role permitted to edit customers", async () => {
    const { supabase } = seedSupabase({ role: "readonly" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(patchRequest(validPatchBody()), routeParams())

    expect(response.status).toBe(403)
  })
})
