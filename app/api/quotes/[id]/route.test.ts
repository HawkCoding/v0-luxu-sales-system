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

function buildAuth(previousLineItems: PrevLine[], status = "draft", overrideReason: string | null = null) {
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
                  status,
                  updated_at: QUOTE_UPDATED_AT,
                  override_reason: overrideReason,
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

const QUOTE_UPDATED_AT = "2026-07-14T00:00:00.000Z"

/**
 * Stamps the current row version unless the caller is deliberately testing the version contract
 * itself — the route now refuses a save that carries neither `expectedUpdatedAt` nor `force`.
 */
function patchReq(body: Record<string, unknown>) {
  const hasVersionField = "expectedUpdatedAt" in body || "force" in body
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(hasVersionField ? body : { ...body, expectedUpdatedAt: QUOTE_UPDATED_AT }),
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

  it("refuses to edit an accepted quote, since documents now render from what it priced", async () => {
    const { rpc } = buildAuth([prevLine()], "accepted")

    const res = await PATCH(
      patchReq({ lineItems: [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }] }),
      routeParams,
    )

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("Revise")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("refuses to edit a superseded quote", async () => {
    const { rpc } = buildAuth([prevLine()], "superseded")

    const res = await PATCH(
      patchReq({ lineItems: [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }] }),
      routeParams,
    )

    expect(res.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("still allows editing a sent quote, which nothing renders from yet", async () => {
    const { rpc } = buildAuth([prevLine({ description: "Package Total", unit_price: 24800, total: 24800 })], "sent")

    const res = await PATCH(
      patchReq({ lineItems: [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }] }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
  })

  it("saves a qty: 0 line — a fully complimentary night is a finished line, not an unpriced one", async () => {
    // qty/unitPrice match the stored line exactly, so this is an unchanged carry-over and needs
    // no override reason — the point under test is purely that qty: 0 clears the Zod schema.
    const { rpc } = buildAuth([
      prevLine({ description: "Standard Room", qty: 0, unit_price: 3000, total: 0 }),
    ])

    const res = await PATCH(
      patchReq({
        lineItems: [{ description: "Standard Room", qty: 0, unitPrice: 3000, total: 0 }],
      }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
  })

  it("returns which field failed on a malformed payload instead of a bare 400", async () => {
    buildAuth([prevLine()])

    const res = await PATCH(
      patchReq({ lineItems: [{ description: "The Blue Train", qty: -1, unitPrice: 5000, total: 5000 }] }),
      routeParams,
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Invalid request payload")
    expect(body.details).toBeDefined()
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

  // QA 11, F11-9. override_reason used to be write-only: once a manual line stamped it, nothing
  // ever nulled it back out, so the "PRICING OVERRIDE" banner on the quotes tab stuck around even
  // after the quote was re-priced entirely from rate cards.
  describe("override_reason clearing", () => {
    it("clears a stale override_reason once every line is priced by the rate-card engine", async () => {
      const { quoteUpdate } = buildAuth(
        [prevLine({ description: "The Blue Train", unit_price: 5000, total: 5000 })],
        "draft",
        "Old manual line, since removed",
      )

      // The old manual line is gone; what's saved now is an ordinary pricing-engine line — the
      // "re-priced entirely from rate cards" case QA 11 hit.
      const res = await PATCH(
        patchReq({
          lineItems: [
            {
              description: "Package Total",
              qty: 1,
              unitPrice: 24800,
              total: 24800,
              pricingSnapshot: { source: "pricing_engine" },
            },
          ],
        }),
        routeParams,
      )

      expect(res.status).toBe(200)
      expect(quoteUpdate).toHaveBeenCalledWith({ override_reason: null })
    })

    it("does not write when there is nothing to clear", async () => {
      const { quoteUpdate } = buildAuth(
        [prevLine({ description: "Package Total", unit_price: 24800, total: 24800 })],
        "draft",
        null,
      )

      const res = await PATCH(
        patchReq({ lineItems: [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }] }),
        routeParams,
      )

      expect(res.status).toBe(200)
      expect(quoteUpdate).not.toHaveBeenCalled()
    })

    it("keeps a still-current override_reason untouched when nothing about the manual line changed", async () => {
      const { quoteUpdate } = buildAuth(
        [prevLine({ description: "The Blue Train", unit_price: 5000, total: 5000 })],
        "draft",
        "Agreed rate with supplier",
      )

      // Same line, same price, but overrideReason is required whenever the request body carries a
      // manual (non-pricing-engine) line — resubmitting the reason should not cause a redundant write.
      const res = await PATCH(
        patchReq({
          lineItems: [{ description: "The Blue Train", qty: 1, unitPrice: 5000, total: 5000 }],
          overrideReason: "Agreed rate with supplier",
        }),
        routeParams,
      )

      expect(res.status).toBe(200)
      expect(quoteUpdate).not.toHaveBeenCalled()
    })
  })

  // QA 11, F11-6. This PATCH replaces the whole line-item set, so a save built from a stale copy
  // silently deletes whatever another consultant added rather than failing to merge it. The
  // version token is mandatory, and the deliberate overwrite has to say so.
  describe("optimistic locking", () => {
    const oneLine = [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }]

    it("refuses a save that carries neither a version token nor an explicit force", async () => {
      const { rpc } = buildAuth([prevLine({ description: "Package Total", unit_price: 24800, total: 24800 })])

      const res = await PATCH(patchReq({ lineItems: oneLine, force: false }), routeParams)

      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("expectedUpdatedAt is required")
      expect(rpc).not.toHaveBeenCalled()
    })

    it("409s a save built from a version someone else has already superseded", async () => {
      const { rpc } = buildAuth([prevLine({ description: "Package Total", unit_price: 24800, total: 24800 })])

      const res = await PATCH(
        patchReq({ lineItems: oneLine, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" }),
        routeParams,
      )

      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("STALE_VERSION")
      expect(rpc).not.toHaveBeenCalled()
    })

    it("lets an explicit force through without a version token — the 'save anyway' path", async () => {
      const { rpc } = buildAuth([prevLine({ description: "Package Total", unit_price: 24800, total: 24800 })])

      const res = await PATCH(patchReq({ lineItems: oneLine, force: true }), routeParams)

      expect(res.status).toBe(200)
      expect(rpc).toHaveBeenCalledWith("replace_quote_line_items", expect.anything())
    })
  })
})
