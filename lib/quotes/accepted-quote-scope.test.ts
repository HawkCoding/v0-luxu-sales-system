import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  findMissingQuotedLegs,
  legIdsFromLineItems,
  resolveAcceptedQuoteScope,
  scopeLegIdsFilter,
  type AcceptedQuoteScope,
} from "@/lib/quotes/accepted-quote-scope"

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"

/** Spread into scope fixtures whose subject under test is leg filtering, not the comp callouts. */
const NO_COMPLIMENTARY = {
  complimentaryLegIds: new Set<string>(),
  firstNightComplimentaryLegIds: new Set<string>(),
  complimentaryTransportRequestIds: new Set<string>(),
}

interface QuoteRow {
  id: string
  quote_number: string | null
  status: string
  created_at: string
}

interface MockTables {
  quotes?: QuoteRow[]
  lineItemsByQuoteId?: Record<string, { pricing_snapshot: unknown }[]>
  services?: { id: string }[]
}

/**
 * Chainable supabase mock. The quotes query filters on status and orders by created_at
 * descending, so the mock applies both — picking the newest accepted quote is the behaviour
 * under test, not an incidental detail of the stub.
 */
function buildSupabase(tables: MockTables = {}) {
  function chain(rows: unknown[]) {
    const state = { rows: [...rows] }
    const self: Record<string, unknown> = {}
    self.select = () => self
    self.eq = (column: string, value: unknown) => {
      state.rows = state.rows.filter((row) => (row as Record<string, unknown>)[column] === value)
      return self
    }
    self.order = (column: string, opts?: { ascending?: boolean }) => {
      const direction = opts?.ascending === false ? -1 : 1
      state.rows.sort((a, b) => {
        const left = String((a as Record<string, unknown>)[column] ?? "")
        const right = String((b as Record<string, unknown>)[column] ?? "")
        return left.localeCompare(right) * direction
      })
      return self
    }
    self.limit = (count: number) => {
      state.rows = state.rows.slice(0, count)
      return self
    }
    self.maybeSingle = async () => ({ data: state.rows[0] ?? null, error: null })
    self.single = async () => ({ data: state.rows[0] ?? null, error: null })
    self.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: state.rows, error: null }).then(resolve)
    return self
  }

  return {
    from: (table: string) => {
      if (table === "quotes") {
        return chain((tables.quotes ?? []).map((row) => ({ ...row, booking_id: BOOKING_ID })))
      }
      if (table === "quote_line_items") {
        // eq("quote_id", …) has already narrowed nothing here, so flatten every quote's items
        // and let the generic eq filter above match on the injected quote_id field.
        const rows = Object.entries(tables.lineItemsByQuoteId ?? {}).flatMap(([quoteId, items]) =>
          items.map((item) => ({ ...item, quote_id: quoteId })),
        )
        return chain(rows)
      }
      if (table === "booking_services") {
        return chain((tables.services ?? []).map((row) => ({ ...row, booking_id: BOOKING_ID, selected: true })))
      }
      return chain([])
    },
  } as unknown as SupabaseClient<Database>
}

function snapshot(legId: string | null, extra: Record<string, unknown> = {}) {
  return { pricing_snapshot: legId === null ? null : { legId, ...extra } }
}

describe("legIdsFromLineItems", () => {
  it("collects leg ids and skips lines with no snapshot or no legId", () => {
    const legIds = legIdsFromLineItems([
      snapshot("leg-train"),
      snapshot(null),
      { pricing_snapshot: { legId: null } },
      snapshot("leg-hotel"),
      snapshot("leg-train"),
    ])

    expect([...legIds].sort()).toEqual(["leg-hotel", "leg-train"])
  })

  it("returns an empty set for null input", () => {
    expect(legIdsFromLineItems(null).size).toBe(0)
  })
})

describe("scopeLegIdsFilter", () => {
  it("returns undefined for an empty scope so callers stay unfiltered", () => {
    const scope: AcceptedQuoteScope = {
      quoteId: "q1",
      quoteNumber: null,
      legIds: new Set(),
      legLabels: new Map(),
      ...NO_COMPLIMENTARY,
      hasAcceptedQuote: true,
    }
    expect(scopeLegIdsFilter(scope)).toBeUndefined()
  })

  it("passes the set through when legs were priced", () => {
    const scope: AcceptedQuoteScope = {
      quoteId: "q1",
      quoteNumber: null,
      legIds: new Set(["leg-train"]),
      legLabels: new Map(),
      ...NO_COMPLIMENTARY,
      hasAcceptedQuote: true,
    }
    expect(scopeLegIdsFilter(scope)).toEqual(new Set(["leg-train"]))
  })
})

describe("resolveAcceptedQuoteScope", () => {
  it("picks the newest accepted quote, ignoring a newer sent revision", async () => {
    const scope = await resolveAcceptedQuoteScope(
      buildSupabase({
        quotes: [
          { id: "q-old", quote_number: "Q1", status: "accepted", created_at: "2026-01-01T00:00:00Z" },
          { id: "q-accepted", quote_number: "Q2", status: "accepted", created_at: "2026-03-01T00:00:00Z" },
          { id: "q-draft", quote_number: "Q3", status: "sent", created_at: "2026-06-01T00:00:00Z" },
        ],
        lineItemsByQuoteId: {
          "q-old": [snapshot("leg-stale")],
          "q-accepted": [snapshot("leg-train", { legLabel: "Rovos Rail" })],
          "q-draft": [snapshot("leg-transfer")],
        },
      }),
      BOOKING_ID,
    )

    expect(scope.quoteId).toBe("q-accepted")
    expect(scope.hasAcceptedQuote).toBe(true)
    expect([...scope.legIds]).toEqual(["leg-train"])
    expect(scope.legLabels.get("leg-train")).toBe("Rovos Rail")
  })

  it("returns an empty scope when nothing is accepted", async () => {
    const scope = await resolveAcceptedQuoteScope(
      buildSupabase({
        quotes: [{ id: "q-sent", quote_number: "Q1", status: "sent", created_at: "2026-01-01T00:00:00Z" }],
        lineItemsByQuoteId: { "q-sent": [snapshot("leg-train")] },
      }),
      BOOKING_ID,
    )

    expect(scope.hasAcceptedQuote).toBe(false)
    expect(scope.quoteId).toBeNull()
    expect(scope.legIds.size).toBe(0)
  })

  it("falls back to the supplier name when a priced leg has no label", async () => {
    const scope = await resolveAcceptedQuoteScope(
      buildSupabase({
        quotes: [{ id: "q1", quote_number: "Q1", status: "accepted", created_at: "2026-01-01T00:00:00Z" }],
        lineItemsByQuoteId: {
          q1: [snapshot("leg-train", { legLabel: null, supplierName: "Rovos Rail" })],
        },
      }),
      BOOKING_ID,
    )

    expect(scope.legLabels.get("leg-train")).toBe("Rovos Rail")
  })
})

describe("findMissingQuotedLegs", () => {
  function scopeOf(legIds: string[], labels: Record<string, string> = {}): AcceptedQuoteScope {
    return {
      quoteId: "q1",
      quoteNumber: "Q1",
      legIds: new Set(legIds),
      legLabels: new Map(Object.entries(labels)),
      ...NO_COMPLIMENTARY,
      hasAcceptedQuote: true,
    }
  }

  it("names quoted legs that no longer exist in the builder", async () => {
    const missing = await findMissingQuotedLegs(
      buildSupabase({ services: [{ id: "leg-train" }] }),
      BOOKING_ID,
      scopeOf(["leg-train", "leg-hotel"], { "leg-train": "Rovos Rail", "leg-hotel": "Irene Country Lodge" }),
    )

    expect(missing).toEqual(["Irene Country Lodge"])
  })

  it("matches a live service on its own id", async () => {
    const missing = await findMissingQuotedLegs(
      buildSupabase({ services: [{ id: "leg-train" }] }),
      BOOKING_ID,
      scopeOf(["leg-train"]),
    )

    expect(missing).toEqual([])
  })

  it("returns nothing for a quote that priced no legs, so manual quotes never trip the gate", async () => {
    const missing = await findMissingQuotedLegs(buildSupabase({}), BOOKING_ID, scopeOf([]))
    expect(missing).toEqual([])
  })
})
