import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PackageDetail } from "@/lib/types"

const helperMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadBookingServicesPackageDetail: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: helperMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/quotes/adapters/from-booking-services", () => ({
  loadBookingServicesPackageDetail: helperMocks.loadBookingServicesPackageDetail,
}))

import { POST } from "./route"

const JOB_ID = "11111111-1111-4111-8111-111111111111"
const QUOTE_ID = "22222222-2222-4222-8222-222222222222"
const TRAIN_SERVICE_ID = "44444444-4444-4444-8444-444444444444"
const TRAIN_ROUTE_ID = "77777777-7777-4777-8777-777777777777"
const TRAIN_SUITE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const RATE_TYPE_DEFAULT_ID = "00000000-0000-4000-8000-000000000099"

function buildDetail(): PackageDetail {
  return {
    id: JOB_ID,
    name: "Booking BT-2026-0001",
    slug: "",
    description: null,
    durationNights: null,
    singleSupplementPct: 50,
    fixedPricePerPerson: null,
    currency: "ZAR",
    active: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    legs: [
      {
        id: TRAIN_SERVICE_ID,
        packageId: JOB_ID,
        supplierId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        supplierName: "Blue Train",
        supplierDescription: null,
        supplierKind: "train_operator",
        pricingMode: "rate_card",
        baseRateTypeId: null,
        quoteRateTypeId: null,
        inheritedRateTypeName: null,
        dateAnchor: null,
        label: "Blue Train",
        sortOrder: 0,
        routes: [
          {
            id: TRAIN_ROUTE_ID,
            supplierId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "Cape Town to Pretoria",
            originLocationId: null,
            destinationLocationId: null,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [
          {
            id: "rc-1",
            routeId: TRAIN_ROUTE_ID,
            suiteTypeId: TRAIN_SUITE_ID,
            rateTypeId: RATE_TYPE_DEFAULT_ID,
            pricePerPerson: 1000,
            childPrice: null,
            infantPrice: null,
            currency: "ZAR",
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        suiteTypes: [
          {
            id: TRAIN_SUITE_ID,
            supplierId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "Deluxe Suite",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
  }
}

function createSupabaseMock(bookingExists = true) {
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                bookingExists
                  ? { data: { id: JOB_ID, booking_number: "BT-2026-0001" }, error: null }
                  : { data: null, error: null },
              ),
              // buildPackageQuoteLineItems re-loads the booking itself via .single() for
              // traveller counts (no_of_adults/no_of_children/child_ages/departure_date).
              single: vi.fn(async () => ({
                data: {
                  id: JOB_ID,
                  no_of_adults: 2,
                  no_of_children: 0,
                  no_of_suites: 1,
                  child_ages: [],
                  departure_date: "2026-06-01",
                },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "booking_transport_requests") {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })) })) }
      }
      if (
        table === "suite_type_bedroom_types" ||
        table === "suite_type_bedroom_layouts" ||
        table === "suite_type_bathroom_types"
      ) {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "bedroom_types" || table === "bedroom_layouts" || table === "bathroom_types") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "app_settings" || table === "suppliers" || table === "routes") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "rate_types") {
        return {
          select: vi.fn(() => ({
            is: vi.fn(async () => ({
              data: [{ id: RATE_TYPE_DEFAULT_ID, code: "RAC", name: "Rack Rate", is_default: true }],
              error: null,
            })),
          })),
        }
      }
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { commission_bonus: 0 }, error: null })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

async function postApply(body: unknown) {
  return POST(
    new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: JOB_ID }) },
  )
}

describe("POST /api/jobs/[id]/services/apply", () => {
  beforeEach(() => {
    helperMocks.requireRole.mockReset()
    helperMocks.loadBookingServicesPackageDetail.mockReset()
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: createSupabaseMock(),
        user: { id: "abababab-abab-4aba-8aba-abababababab", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane Doe", name: "Jane", surname: "Doe", email: "u@example.com" },
      },
    })
    helperMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: buildDetail(),
      services: [{ id: TRAIN_SERVICE_ID }],
      units: [],
    })
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const response = await postApply({})
    expect(response.status).toBe(401)
  })

  it("returns 404 when the booking does not exist", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: createSupabaseMock(false),
        user: { id: "abababab-abab-4aba-8aba-abababababab" },
        profile: { clearanceLevel: "consultant", actorName: "Consultant" },
      },
    })
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [],
    })
    expect(response.status).toBe(404)
  })

  it("prices a booking_services selection via the adapter + shared pricing engine", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        {
          legId: TRAIN_SERVICE_ID,
          selected: true,
          units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 0, infantCount: 0 }],
        },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual(
      expect.objectContaining({
        description: "Blue Train - Cape Town to Pretoria — Deluxe Suite - Adult",
        qty: 2,
        unitPrice: 1000,
        total: 2000,
      }),
    )
    expect(helperMocks.loadBookingServicesPackageDetail).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      "BT-2026-0001",
    )
  })

  it("returns 400 with the engine's message when a required suite type is missing", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [{ legId: TRAIN_SERVICE_ID, selected: true }],
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/No suite type selected/)
  })
})
