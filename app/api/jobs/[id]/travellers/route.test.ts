import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { GET, PUT } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000d001"
const TRAVELLER_ID = "00000000-0000-4000-8000-00000000d002"
const CUSTOMER_ID = "00000000-0000-4000-8000-00000000d003"
const GROUP_1 = "00000000-0000-4000-8000-00000000e001"
const GROUP_2 = "00000000-0000-4000-8000-00000000e002"

function buildAuthValue(supabase = buildSupabase()) {
  return {
    supabase,
    user: { id: "u1", email: "u@example.com" },
    profile: {
      clearanceLevel: "consultant",
      actorName: "Jane",
      name: "Jane",
      surname: "D",
      email: "u@example.com",
    },
  }
}

function buildSupabase(
  opts: {
    bookingExists?: boolean
    customerId?: string | null
    customer?: {
      id: string
      date_of_birth: string | null
      id_passport: string | null
      club_memberships?: unknown
    } | null
    /** booking_pax_groups rows for this booking. */
    paxGroups?: Array<{ id: string; position: number; label: string | null }>
    /** booking_services rows (with units) the GET's group list reads names and counts from. */
    serviceRows?: Array<Record<string, unknown>>
    /** The stored travellers' placements, read back for guests re-sent without paxGroupId. */
    storedPlacements?: Record<string, string | null>
  } = {},
) {
  const insertCalls: unknown[] = []
  const deleteCalls: string[] = []
  const customerUpdates: unknown[] = []

  const travellerRow = {
    id: TRAVELLER_ID,
    booking_id: BOOKING_ID,
    prefix: "Mr",
    first_name: "John",
    last_name: "Smith",
    id_passport: "A1234567",
    date_of_birth: "1980-01-01",
    residence: "South Africa",
    is_child: false,
    sort_order: 0,
    club_memberships: [{ club: "Rovos Rail", number: "RR-1" }],
  }

  const customerId = opts.customerId === undefined ? CUSTOMER_ID : opts.customerId
  const customerRow =
    opts.customer === undefined ? { id: CUSTOMER_ID, date_of_birth: null, id_passport: null } : opts.customer

  return {
    insertCalls,
    deleteCalls,
    customerUpdates,
    from: vi.fn((table: string) => {
      if (table === "booking_pax_groups") {
        const groups = opts.paxGroups ?? []
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: groups, error: null })),
              in: vi.fn(async (_col: string, ids: string[]) => ({
                data: groups.filter((group) => ids.includes(group.id)).map((group) => ({ id: group.id })),
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "booking_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: opts.serviceRows ?? [], error: null })),
            })),
          })),
        }
      }
      if (table === "travellers") {
        return {
          select: vi.fn((columns: string) => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () =>
                columns === "id, pax_group_id"
                  ? {
                      data: Object.entries(opts.storedPlacements ?? {}).map(([id, groupId]) => ({
                        id,
                        pax_group_id: groupId,
                      })),
                      error: null,
                    }
                  : { data: [travellerRow], error: null },
              ),
            })),
          })),
          delete: vi.fn(() => ({
            // The route selects the cleared rows back so an empty payload can report the wipe.
            eq: vi.fn((_col: string, value: string) => ({
              select: vi.fn(async () => {
                deleteCalls.push(value)
                return { data: [{ id: TRAVELLER_ID }], error: null }
              }),
            })),
          })),
          insert: vi.fn(async (rows: unknown) => {
            insertCalls.push(rows)
            return { error: null }
          }),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  opts.bookingExists === false
                    ? null
                    : {
                        id: BOOKING_ID,
                        customer_id: customerId,
                        // The core leg the pax groups hang off; null keeps the train rule.
                        primary_supplier_id: null,
                        // Read back by the roster/pax comparison attached to every response.
                        no_of_adults: 2,
                        no_of_children: 0,
                        child_ages: [],
                        trip_start_date: "2026-09-12",
                        departure_date: "2026-09-12",
                      },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
        }
      }
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: customerRow, error: null })),
            })),
          })),
          update: vi.fn((values: unknown) => ({
            eq: vi.fn(async () => {
              customerUpdates.push(values)
              return { error: null }
            }),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

const params = Promise.resolve({ id: BOOKING_ID })

describe("GET /api/jobs/[id]/travellers", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(403)
  })

  it("returns travellers when authorised", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travellers).toEqual([
      {
        id: TRAVELLER_ID,
        prefix: "Mr",
        firstName: "John",
        lastName: "Smith",
        idPassport: "A1234567",
        dateOfBirth: "1980-01-01",
        residence: "South Africa",
        roomWith: "",
        roomType: "",
        isChild: false,
        sortOrder: 0,
        clubMemberships: [{ club: "Rovos Rail", number: "RR-1" }],
        paxGroupId: null,
      },
    ])
    expect(body.paxGroups).toEqual([])
  })

  it("lists the booking's suites with their automatic names and headcounts", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(
        buildSupabase({
          paxGroups: [
            { id: GROUP_2, position: 2, label: null },
            { id: GROUP_1, position: 1, label: "Honeymoon suite" },
          ],
          serviceRows: [
            {
              id: "svc-hotel",
              supplier_id: "sup-hotel",
              sort_order: 0,
              suppliers: { kind: "hotel_property" },
              // A hotel room naming group 2 must not be mistaken for its suite.
              units: [
                {
                  pax_group_ids: [GROUP_2],
                  suite_type_id: "st-room",
                  bedroom_type_id: null,
                  adult_count: 9,
                  child_count: 9,
                  infant_count: 9,
                  suite_types: { name: "Ocean View Room" },
                  bedroom_types: null,
                },
              ],
            },
            {
              id: "svc-train",
              supplier_id: "sup-train",
              sort_order: 1,
              suppliers: [{ kind: "train_operator" }],
              units: [
                {
                  pax_group_ids: [GROUP_1],
                  suite_type_id: "st-deluxe",
                  bedroom_type_id: "bt-double",
                  adult_count: 2,
                  child_count: 0,
                  infant_count: 0,
                  suite_types: { name: "Deluxe Suite" },
                  bedroom_types: { name: "Double" },
                },
                {
                  pax_group_ids: [GROUP_2],
                  suite_type_id: "st-deluxe",
                  bedroom_type_id: "bt-twin",
                  adult_count: 0,
                  child_count: 2,
                  infant_count: 1,
                  suite_types: [{ name: "Deluxe Suite" }],
                  bedroom_types: [{ name: "Twin" }],
                },
              ],
            },
          ],
        }),
      ),
    })
    const res = await GET(new Request("http://localhost"), { params })
    const body = await res.json()
    expect(body.paxGroups).toEqual([
      {
        id: GROUP_1,
        position: 1,
        label: "Honeymoon suite",
        autoLabel: "Double Deluxe Suite 1",
        adults: 2,
        children: 0,
        infants: 0,
      },
      { id: GROUP_2, position: 2, label: null, autoLabel: "Twin Deluxe Suite 2", adults: 0, children: 2, infants: 1 },
    ])
  })
})

describe("PUT /api/jobs/[id]/travellers pax groups", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  async function put(supabase: ReturnType<typeof buildSupabase>, travellers: Record<string, unknown>[]) {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    return PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ travellers }),
        headers: { "Content-Type": "application/json" },
      }),
      { params },
    )
  }

  const guest = { firstName: "Jane", lastName: "Doe", idPassport: "B7654321" }

  it("stores the guest's suite", async () => {
    const supabase = buildSupabase({ paxGroups: [{ id: GROUP_1, position: 1, label: null }] })
    const res = await put(supabase, [{ ...guest, paxGroupId: GROUP_1 }, { ...guest, firstName: "Sam", paxGroupId: null }])
    expect(res.status).toBe(200)
    expect(supabase.insertCalls[0]).toEqual([
      expect.objectContaining({ pax_group_id: GROUP_1 }),
      expect.objectContaining({ pax_group_id: null }),
    ])
  })

  it("refuses a suite that isn't one of the booking's, before touching the roster", async () => {
    const supabase = buildSupabase({ paxGroups: [{ id: GROUP_1, position: 1, label: null }] })
    const res = await put(supabase, [{ ...guest, paxGroupId: GROUP_2 }])
    expect(res.status).toBe(400)
    expect(supabase.deleteCalls).toEqual([])
    expect(supabase.insertCalls).toHaveLength(0)
  })

  it("keeps a re-sent guest's suite when the client doesn't send paxGroupId at all", async () => {
    const supabase = buildSupabase({ storedPlacements: { [TRAVELLER_ID]: GROUP_1 } })
    const res = await put(supabase, [{ ...guest, id: TRAVELLER_ID }, { ...guest, firstName: "New" }])
    expect(res.status).toBe(200)
    expect(supabase.insertCalls[0]).toEqual([
      expect.objectContaining({ first_name: "Jane", pax_group_id: GROUP_1 }),
      expect.objectContaining({ first_name: "New", pax_group_id: null }),
    ])
  })

  it("rejects a malformed suite id", async () => {
    const supabase = buildSupabase()
    const res = await put(supabase, [{ ...guest, paxGroupId: "suite-2" }])
    expect(res.status).toBe(400)
  })
})

describe("PUT /api/jobs/[id]/travellers", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid JSON", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", { method: "PUT", body: "not json" })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 400 when a guest is missing a name", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [{ firstName: "", lastName: "Smith", idPassport: "A1234567", isChild: false }] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 400 when a guest is missing an ID/passport number", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [{ firstName: "John", lastName: "Smith", idPassport: "", isChild: false }] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 404 when the booking does not exist", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(buildSupabase({ bookingExists: false })),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(404)
  })

  it("replaces travellers and writes an audit log", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        travellers: [
          {
            prefix: "Mrs",
            firstName: "Jane",
            lastName: "Doe",
            idPassport: "B7654321",
            dateOfBirth: "1990-05-05",
            residence: "United Kingdom",
            isChild: false,
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.deleteCalls).toEqual([BOOKING_ID])
    expect(supabase.insertCalls).toEqual([
      [
        expect.objectContaining({
          booking_id: BOOKING_ID,
          prefix: "Mrs",
          first_name: "Jane",
          last_name: "Doe",
          id_passport: "B7654321",
          date_of_birth: "1990-05-05",
          residence: "United Kingdom",
          is_child: false,
          sort_order: 0,
        }),
      ],
    ])
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ action: "travellers_updated", entityId: BOOKING_ID }),
    )
  })

  it("warns when an empty payload wipes an existing roster (F10-6)", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [] }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.removedCount).toBe(1)
    expect(body.warning).toMatch(/dates of birth were deleted/)
    expect(supabase.insertCalls).toHaveLength(0)
  })

  it("carries the roster/pax comparison on the response (F10-3)", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        travellers: [{ firstName: "John", lastName: "Smith", idPassport: "A1234567", isChild: false }],
      }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await PUT(req, { params })
    const body = await res.json()
    // The mocked reload returns one adult against a 2-adult booking.
    expect(body.paxComparison.matches).toBe(false)
    expect(body.paxComparison.roster.total).toBe(1)
    expect(body.paxComparison.booking.total).toBe(2)
  })

  async function putPrimary(supabase: ReturnType<typeof buildSupabase>, traveller: Record<string, unknown>) {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [traveller] }),
      headers: { "Content-Type": "application/json" },
    })
    return PUT(req, { params })
  }

  it("copies the primary guest's ID and date of birth onto the customer record", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      isPrimary: true,
    })
    expect(res.status).toBe(200)
    expect(supabase.customerUpdates).toEqual([{ id_passport: "B7654321", date_of_birth: "1990-05-05" }])
  })

  it("normalises a day-first date of birth before syncing it to the customer", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "05/05/1990",
      isPrimary: true,
    })
    expect(res.status).toBe(200)
    expect(supabase.customerUpdates).toEqual([{ id_passport: "B7654321", date_of_birth: "1990-05-05" }])
  })

  it("stores the normalised date of birth on the traveller row too", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "14 Feb 1990",
      isPrimary: true,
    })
    expect(res.status).toBe(200)
    expect(supabase.insertCalls[0]).toEqual([expect.objectContaining({ date_of_birth: "1990-02-14" })])
  })

  it("skips an unreadable date of birth so the customers DATE column is never given junk", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "sometime in 1990",
      isPrimary: true,
    })
    expect(res.status).toBe(200)
    expect(supabase.customerUpdates).toEqual([{ id_passport: "B7654321" }])
    // ...but the traveller row keeps what the salesperson typed.
    expect(supabase.insertCalls[0]).toEqual([
      expect.objectContaining({ date_of_birth: "sometime in 1990" }),
    ])
  })

  it("does not touch the customer when nothing differs", async () => {
    const supabase = buildSupabase({
      customer: { id: CUSTOMER_ID, date_of_birth: "1990-05-05", id_passport: "B7654321" },
    })
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      isPrimary: true,
    })
    expect(res.status).toBe(200)
    expect(supabase.customerUpdates).toEqual([])
  })

  it("stores each guest's club member numbers, trimmed", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      clubMemberships: [{ club: " Blue Train ", number: " BT-9 " }],
    })
    expect(res.status).toBe(200)
    expect(supabase.insertCalls[0]).toEqual([
      expect.objectContaining({ club_memberships: [{ club: "Blue Train", number: "BT-9" }] }),
    ])
  })

  it("defaults a guest without club numbers to an empty list", async () => {
    const supabase = buildSupabase()
    await putPrimary(supabase, { firstName: "Jane", lastName: "Doe", idPassport: "B7654321" })
    expect(supabase.insertCalls[0]).toEqual([expect.objectContaining({ club_memberships: [] })])
  })

  it("returns 400 for a club entry missing its number", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      clubMemberships: [{ club: "Rovos Rail", number: "" }],
    })
    expect(res.status).toBe(400)
    expect(supabase.insertCalls).toHaveLength(0)
  })

  it("merges the primary guest's club numbers onto the customer without dropping existing ones", async () => {
    const supabase = buildSupabase({
      customer: {
        id: CUSTOMER_ID,
        date_of_birth: "1990-05-05",
        id_passport: "B7654321",
        club_memberships: [
          { club: "Rovos Rail", number: "OLD" },
          { club: "SAA Voyager", number: "998877" },
        ],
      },
    })
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      isPrimary: true,
      clubMemberships: [
        { club: "rovos rail", number: "NEW" },
        { club: "Blue Train", number: "BT-1" },
      ],
    })
    expect(res.status).toBe(200)
    expect(supabase.customerUpdates).toEqual([
      {
        club_memberships: [
          { club: "Rovos Rail", number: "NEW" },
          { club: "SAA Voyager", number: "998877" },
          { club: "Blue Train", number: "BT-1" },
        ],
      },
    ])
  })

  it("never clears the customer's club numbers when the primary guest has none", async () => {
    const supabase = buildSupabase({
      customer: {
        id: CUSTOMER_ID,
        date_of_birth: "1990-05-05",
        id_passport: "B7654321",
        club_memberships: [{ club: "Rovos Rail", number: "RR-1" }],
      },
    })
    await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      isPrimary: true,
      clubMemberships: [],
    })
    expect(supabase.customerUpdates).toEqual([])
  })

  it("does not copy a non-primary guest's club numbers to the customer", async () => {
    const supabase = buildSupabase()
    await putPrimary(supabase, {
      firstName: "Sam",
      lastName: "Doe",
      idPassport: "C1",
      isPrimary: false,
      clubMemberships: [{ club: "Rovos Rail", number: "RR-2" }],
    })
    expect(supabase.customerUpdates).toEqual([])
  })

  it("does not sync a non-primary guest", async () => {
    const supabase = buildSupabase()
    const res = await putPrimary(supabase, {
      firstName: "Jane",
      lastName: "Doe",
      idPassport: "B7654321",
      dateOfBirth: "1990-05-05",
      isPrimary: false,
    })
    expect(res.status).toBe(200)
    expect(supabase.customerUpdates).toEqual([])
  })
})
