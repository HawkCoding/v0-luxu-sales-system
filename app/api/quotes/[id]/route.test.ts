import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

import { PATCH } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-00000000dddd"

interface PrevLine {
  description: string
  supplier_description: string | null
  qty: number
  unit_price: number
  total: number
  sort_order: number
  pricing_snapshot: unknown
}

function buildAuth(previousLineItems: PrevLine[]) {
  const rpc = vi.fn(async () => ({ error: null }))
  const auditInsert = vi.fn(async () => ({ error: null }))
  const quoteUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

  const supabase = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: QUOTE_ID,
                  subtotal: 0,
                  total: 0,
                  updated_at: "2026-07-14T00:00:00.000Z",
                  override_reason: null,
                },
                error: null,
              })),
            })),
          })),
          update: quoteUpdate,
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: previousLineItems, error: null })),
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
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
    },
  })

  return { rpc, auditInsert, quoteUpdate }
}

function patchReq(body: unknown) {
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

const routeParams = { params: Promise.resolve({ id: QUOTE_ID }) }

function prevLine(overrides: Partial<PrevLine> = {}): PrevLine {
  return {
    description: "The Blue Train",
    supplier_description: null,
    qty: 1,
    unit_price: 0,
    total: 0,
    sort_order: 0,
    pricing_snapshot: null,
    ...overrides,
  }
}

describe("PATCH /api/quotes/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("deletes a line from an all-snapshot-less quote without an override reason", async () => {
    const { rpc, quoteUpdate } = buildAuth([
      prevLine({ description: "The Blue Train", unit_price: 0, sort_order: 0 }),
      prevLine({ description: "Package Total", unit_price: 24800, total: 24800, sort_order: 1 }),
    ])

    // payload keeps only the Package Total line (deleting "The Blue Train")
    const res = await PATCH(
      patchReq({ lineItems: [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }] }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("replace_quote_line_items", expect.anything())
    expect(quoteUpdate).not.toHaveBeenCalled()
  })

  it("rejects a price change on a snapshot-less line without a reason", async () => {
    buildAuth([prevLine({ description: "The Blue Train", unit_price: 0 })])

    const res = await PATCH(
      patchReq({ lineItems: [{ description: "The Blue Train", qty: 1, unitPrice: 5000, total: 5000 }] }),
      routeParams,
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Manual pricing changes require an override reason")
  })

  it("accepts a price change when an override reason is supplied and records it", async () => {
    const { quoteUpdate, auditInsert } = buildAuth([prevLine({ description: "The Blue Train", unit_price: 0 })])

    const res = await PATCH(
      patchReq({
        lineItems: [{ description: "The Blue Train", qty: 1, unitPrice: 5000, total: 5000 }],
        overrideReason: "Agreed rate with supplier",
      }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(quoteUpdate).toHaveBeenCalledWith({ override_reason: "Agreed rate with supplier" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ override_reason: "Agreed rate with supplier" }),
    )
  })

  it("rejects a newly added snapshot-less line without a reason", async () => {
    buildAuth([prevLine({ description: "The Blue Train", unit_price: 0 })])

    const res = await PATCH(
      patchReq({
        lineItems: [
          { description: "The Blue Train", qty: 1, unitPrice: 0, total: 0 },
          { description: "Ad-hoc extra", qty: 1, unitPrice: 1500, total: 1500 },
        ],
      }),
      routeParams,
    )

    expect(res.status).toBe(400)
  })
})
