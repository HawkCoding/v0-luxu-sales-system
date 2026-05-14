import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

import { PATCH } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-00000000dddd"

function patchJson(body: unknown) {
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

function buildAuth() {
  const rpc = vi.fn(async () => ({ error: null }))
  const auditInsert = vi.fn(async () => ({ error: null }))
  const quoteUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }))

  const supabase = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn((columns: string) => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => {
                if (columns === "updated_at") {
                  return { data: { updated_at: "2026-05-13T12:05:00.000Z" }, error: null }
                }
                return {
                  data: {
                    id: QUOTE_ID,
                    subtotal: 1000,
                    vat: 150,
                    total: 1150,
                    updated_at: "2026-05-13T12:00:00.000Z",
                    override_reason: null,
                  },
                  error: null,
                }
              }),
            })),
          })),
          update: quoteUpdate,
        }
      }

      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    description: "Old line",
                    supplier_description: null,
                    qty: 1,
                    unit_price: 1000,
                    total: 1000,
                    sort_order: 0,
                    pricing_snapshot: null,
                  },
                ],
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "audit_logs") {
        return { insert: auditInsert }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "user-1", email: "u@example.com" },
      profile: {
        clearanceLevel: "consultant",
        actorName: "Jane Doe",
        name: "Jane",
        surname: "Doe",
        email: "u@example.com",
      },
    },
  })

  return { rpc, auditInsert, quoteUpdate }
}

describe("PATCH /api/quotes/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const response = await PATCH(patchJson({}), { params: Promise.resolve({ id: QUOTE_ID }) })

    expect(response.status).toBe(401)
  })

  it("rejects manual quote line changes without an override reason", async () => {
    buildAuth()

    const response = await PATCH(
      patchJson({
        lineItems: [{ description: "Manual price", qty: 1, unitPrice: 1200, total: 1200 }],
      }),
      { params: Promise.resolve({ id: QUOTE_ID }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/override reason/i)
  })

  it("writes a pricing override audit log for manual line changes with a reason", async () => {
    const { auditInsert, quoteUpdate } = buildAuth()

    const response = await PATCH(
      patchJson({
        overrideReason: "Supplier confirmed a special seasonal fare",
        lineItems: [{ description: "Manual price", qty: 1, unitPrice: 1200, total: 1200 }],
      }),
      { params: Promise.resolve({ id: QUOTE_ID }) },
    )

    expect(response.status).toBe(200)
    expect(quoteUpdate).toHaveBeenCalledWith({
      override_reason: "Supplier confirmed a special seasonal fare",
    })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pricing_override",
        actor: "Jane Doe",
        entity_type: "Quote",
        entity_id: QUOTE_ID,
        override_reason: "Supplier confirmed a special seasonal fare",
        overridden_by: "user-1",
      }),
    )
  })

  it("allows pricing-engine line replacements without an override reason", async () => {
    const { auditInsert } = buildAuth()

    const response = await PATCH(
      patchJson({
        lineItems: [
          {
            description: "Blue Train - Deluxe Suite - Adult",
            qty: 2,
            unitPrice: 1100,
            total: 2200,
            pricingSnapshot: {
              source: "pricing_engine",
              pricingMode: "rate_card",
              packageId: "pkg-1",
              packageName: "Blue Train",
              legId: "leg-1",
              legLabel: "Blue Train",
              supplierId: "supplier-1",
              supplierName: "Blue Train",
              supplierKind: "train_operator",
              routeId: "route-1",
              routeName: "Cape Town to Pretoria",
              suiteTypeId: "suite-1",
              suiteTypeName: "Deluxe Suite",
              rateCardId: "rate-1",
              travelDate: "2026-06-01",
              passengerKind: "adult",
              baseUnitPrice: 1000,
              markupPct: 10,
              singleSupplementPct: null,
              serviceType: null,
            },
          },
        ],
      }),
      { params: Promise.resolve({ id: QUOTE_ID }) },
    )

    expect(response.status).toBe(200)
    expect(auditInsert).not.toHaveBeenCalled()
  })
})
