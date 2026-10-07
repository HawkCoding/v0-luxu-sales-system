import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

const syncMocks = vi.hoisted(() => ({
  syncBookingPaymentState: vi.fn(),
}))

vi.mock("@/lib/invoices/sync-booking-payment-state", () => ({
  syncBookingPaymentState: syncMocks.syncBookingPaymentState,
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

interface BookingJoin {
  primary_supplier_id: string | null
  stage: string
  cancelled_at: string | null
}

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"

function buildAuth(
  previousLineItems: PrevLine[],
  status = "draft",
  overrideReason: string | null = null,
  agentCommission = 0,
  booking: BookingJoin = { primary_supplier_id: null, stage: "deposit_paid", cancelled_at: null },
  quoteTotals: { subtotal: number; total: number } = { subtotal: 0, total: 0 },
) {
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
                  booking_id: BOOKING_ID,
                  subtotal: quoteTotals.subtotal,
                  total: quoteTotals.total,
                  status,
                  updated_at: QUOTE_UPDATED_AT,
                  override_reason: overrideReason,
                  agent_commission: agentCommission,
                  booking,
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

  return { rpc, auditInsert, quoteUpdate, supabase }
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
    syncMocks.syncBookingPaymentState.mockReset()
    syncMocks.syncBookingPaymentState.mockResolvedValue({
      totalPaid: 6200,
      depositPaid: true,
      invoiceBalance: 22600,
      overpaidAmount: 0,
    })
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
    expect(body.error).toContain("Line 1 (The Blue Train)")
    expect(body.error).toContain("can't be negative")
    expect(body.details).toBeDefined()
  })

  // The bug this reproduces: a negative Commission line (from a legacy negative "Rounding")
  // used to fail here with a bare "Invalid request payload (lineItems)" that named neither the
  // line nor the reason -- see app/api/jobs/[id]/services/apply/route.ts for where it's now
  // caught earlier, and app/api/quotes/[id]/commission-bonus/route.ts for why it can't recur.
  it("names the Commission line when its price is negative", async () => {
    buildAuth([prevLine()])

    const res = await PATCH(
      patchReq({
        lineItems: [
          { description: "The Blue Train", qty: 1, unitPrice: 5000, total: 5000 },
          { description: "Commission", qty: 1, unitPrice: -46320, total: -46320 },
        ],
      }),
      routeParams,
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("Line 2 (Commission)")
    expect(body.error).toContain("can't be negative")
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

  // A line-item edit must not silently wipe out an existing Agent Commission — it's a
  // total-level adjustment, unrelated to which lines make up the subtotal.
  it("keeps an existing agent commission netted off the total after a line-item edit", async () => {
    const { rpc } = buildAuth(
      [prevLine({ description: "Package Total", unit_price: 24800, total: 24800 })],
      "draft",
      null,
      5000,
    )

    const res = await PATCH(
      patchReq({ lineItems: [{ description: "Package Total", qty: 1, unitPrice: 24800, total: 24800 }] }),
      routeParams,
    )
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.subtotal).toBe(24800)
    expect(payload.total).toBe(19800)
    expect(rpc).toHaveBeenCalledWith("replace_quote_line_items", expect.objectContaining({ p_total: 19800 }))
  })

  // Option B (Carmen, 2026-10-07): an accepted quote can be amended in place — an extra hotel
  // night after the invoice went out — without rewinding the booking, voiding invoices or emailing.
  describe("amend (accepted quote, in place)", () => {
    const engine = { source: "pricing_engine" }
    const acceptedLine = prevLine({
      description: "Package Total",
      unit_price: 24800,
      total: 24800,
      pricing_snapshot: engine,
    })
    const amendedLines = [
      { description: "Package Total", qty: 1, unitPrice: 24800, total: 24800, pricingSnapshot: engine },
      { description: "Extra night - Cape Grace", qty: 2, unitPrice: 2000, total: 1, pricingSnapshot: engine },
    ]

    function tablesTouched(supabase: { from: { mock: { calls: unknown[][] } } }): string[] {
      return supabase.from.mock.calls.map((call) => String(call[0]))
    }

    it("saves the new lines onto the same accepted quote, recomputes totals, syncs the balance and audits it", async () => {
      const { rpc, auditInsert, quoteUpdate, supabase } = buildAuth(
        [acceptedLine],
        "accepted",
        null,
        3000,
        undefined,
        { subtotal: 24800, total: 21800 },
      )

      const res = await PATCH(
        patchReq({ lineItems: amendedLines, amend: true, amendNote: "  Client asked for an extra night  " }),
        routeParams,
      )
      const payload = await res.json()

      expect(res.status).toBe(200)
      // Line total is recomputed (2 × 2000), the client's bogus `total: 1` is discarded, and the
      // existing agent commission is still netted off.
      expect(payload.subtotal).toBe(28800)
      expect(payload.total).toBe(25800)
      expect(payload.amended).toBe(true)
      expect(payload.invoiceBalance).toBe(22600)
      expect(rpc).toHaveBeenCalledWith(
        "replace_quote_line_items",
        expect.objectContaining({ p_quote_id: QUOTE_ID, p_subtotal: 28800, p_total: 25800 }),
      )

      expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledTimes(1)
      expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledWith(supabase, BOOKING_ID, {
        actorName: "Jane",
        actorUserId: "u1",
      })

      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "quote_amended",
          actor: "Jane",
          actor_user_id: "u1",
          entity_type: "Quote",
          entity_id: QUOTE_ID,
          before_json: expect.objectContaining({ total: 21800, lineCount: 1 }),
          after_json: expect.objectContaining({ total: 25800, lineCount: 2 }),
          meta_json: expect.objectContaining({
            amendNote: "Client asked for an extra night",
            bookingStage: "deposit_paid",
            emailsSent: false,
          }),
        }),
      )

      // The quote stays accepted (no status write), and nothing outside the quote is touched here:
      // no invoice voided, no booking stage moved, no correspondence/email row written.
      expect(quoteUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: expect.anything() }))
      const touched = tablesTouched(supabase)
      expect(touched).not.toContain("invoices")
      expect(touched).not.toContain("bookings")
      expect(touched).not.toContain("correspondences")
      expect(touched).not.toContain("email_outbox")
    })

    it("records a null note when none is given", async () => {
      const { auditInsert } = buildAuth([acceptedLine], "accepted")

      const res = await PATCH(patchReq({ lineItems: amendedLines, amend: true }), routeParams)

      expect(res.status).toBe(200)
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "quote_amended",
          meta_json: expect.objectContaining({ amendNote: null }),
        }),
      )
    })

    it("still saves but warns when the balance sync throws", async () => {
      buildAuth([acceptedLine], "accepted")
      syncMocks.syncBookingPaymentState.mockRejectedValueOnce(new Error("boom"))

      const res = await PATCH(patchReq({ lineItems: amendedLines, amend: true }), routeParams)
      const payload = await res.json()

      expect(res.status).toBe(200)
      expect(payload.amended).toBe(true)
      expect(payload.warning).toContain("balance could not be refreshed")
    })

    it("keeps the 409 for a plain PATCH (no amend flag) on an accepted quote", async () => {
      const { rpc } = buildAuth([acceptedLine], "accepted")

      const res = await PATCH(patchReq({ lineItems: amendedLines }), routeParams)

      expect(res.status).toBe(409)
      expect(rpc).not.toHaveBeenCalled()
      expect(syncMocks.syncBookingPaymentState).not.toHaveBeenCalled()
    })

    it.each(["draft", "sent", "superseded", "cancelled"])("refuses to amend a %s quote", async (status) => {
      const { rpc, auditInsert } = buildAuth([acceptedLine], status)

      const res = await PATCH(patchReq({ lineItems: amendedLines, amend: true }), routeParams)

      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe("Only an accepted quote can be amended.")
      expect(rpc).not.toHaveBeenCalled()
      expect(auditInsert).not.toHaveBeenCalled()
      expect(syncMocks.syncBookingPaymentState).not.toHaveBeenCalled()
    })

    it.each([
      [{ primary_supplier_id: null, stage: "lost", cancelled_at: null }, "cancelled"],
      [{ primary_supplier_id: null, stage: "deposit_paid", cancelled_at: "2026-10-01T00:00:00Z" }, "cancelled"],
      [{ primary_supplier_id: null, stage: "closed", cancelled_at: null }, "closed"],
    ])("refuses to amend when the booking is off the ladder (%o)", async (booking, word) => {
      const { rpc } = buildAuth([acceptedLine], "accepted", null, 0, booking)

      const res = await PATCH(patchReq({ lineItems: amendedLines, amend: true }), routeParams)

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain(word)
      expect(rpc).not.toHaveBeenCalled()
    })

    it("409s an amend on a cancelled booking and writes nothing", async () => {
      const { rpc, auditInsert } = buildAuth([acceptedLine], "accepted", null, 0, {
        primary_supplier_id: null,
        stage: "lost",
        cancelled_at: "2026-10-01T00:00:00Z",
      })

      const res = await PATCH(patchReq({ lineItems: amendedLines, amend: true }), routeParams)

      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe("This booking is cancelled, so its quote can't be amended.")
      expect(rpc).not.toHaveBeenCalled()
      expect(auditInsert).not.toHaveBeenCalled()
      expect(syncMocks.syncBookingPaymentState).not.toHaveBeenCalled()
    })

    it("409s an amend on a closed booking and writes nothing", async () => {
      const { rpc, auditInsert } = buildAuth([acceptedLine], "accepted", null, 0, {
        primary_supplier_id: null,
        stage: "closed",
        cancelled_at: null,
      })

      const res = await PATCH(patchReq({ lineItems: amendedLines, amend: true }), routeParams)

      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe("This booking is closed, so its quote can't be amended.")
      expect(rpc).not.toHaveBeenCalled()
      expect(auditInsert).not.toHaveBeenCalled()
      expect(syncMocks.syncBookingPaymentState).not.toHaveBeenCalled()
    })

    it("still enforces the version token on an amend", async () => {
      const { rpc } = buildAuth([acceptedLine], "accepted")

      const res = await PATCH(
        patchReq({ lineItems: amendedLines, amend: true, expectedUpdatedAt: "2026-07-13T00:00:00.000Z" }),
        routeParams,
      )

      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("STALE_VERSION")
      expect(rpc).not.toHaveBeenCalled()
    })

    it("refuses an amendment that adds an unpriced line", async () => {
      const { rpc } = buildAuth([acceptedLine], "accepted")

      const res = await PATCH(
        patchReq({
          lineItems: [
            amendedLines[0],
            { description: "Extra tour", qty: 1, unitPrice: 0, total: 0, pricingSnapshot: engine },
          ],
          amend: true,
        }),
        routeParams,
      )

      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("needs a price")
      expect(rpc).not.toHaveBeenCalled()
    })

    it("tolerates an unchanged R0 line the accepted quote already carried", async () => {
      const { rpc } = buildAuth(
        [acceptedLine, prevLine({ description: "The Blue Train", unit_price: 0, sort_order: 1 })],
        "accepted",
      )

      const res = await PATCH(
        patchReq({
          lineItems: [...amendedLines, { description: "The Blue Train", qty: 1, unitPrice: 0, total: 0 }],
          amend: true,
        }),
        routeParams,
      )

      expect(res.status).toBe(200)
      expect(rpc).toHaveBeenCalled()
    })

    describe("validation", () => {
      it("rejects amend: false — the flag is an explicit opt-in, not a toggle", async () => {
        buildAuth([acceptedLine], "accepted")
        const res = await PATCH(patchReq({ lineItems: amendedLines, amend: false }), routeParams)
        expect(res.status).toBe(400)
      })

      it("rejects an amendNote sent without amend: true", async () => {
        const { rpc } = buildAuth([acceptedLine], "draft")
        const res = await PATCH(patchReq({ lineItems: amendedLines, amendNote: "why" }), routeParams)
        expect(res.status).toBe(400)
        expect(rpc).not.toHaveBeenCalled()
      })

      it("rejects an amendNote over 500 characters", async () => {
        buildAuth([acceptedLine], "accepted")
        const res = await PATCH(
          patchReq({ lineItems: amendedLines, amend: true, amendNote: "x".repeat(501) }),
          routeParams,
        )
        expect(res.status).toBe(400)
      })
    })
  })
})
