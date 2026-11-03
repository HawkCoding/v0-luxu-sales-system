import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PaxGroupMeta } from "@/lib/types"
import { collectRateTypeIds, loadRateShortLabels } from "./load-rate-short-labels"

const GROUPS: PaxGroupMeta[] = [
  { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
  { id: "g2", position: 2, label: "Twin Deluxe Suite 2" },
]

const LINES = [
  {
    pricing_snapshot: {
      legId: "leg-train",
      rateTypeId: "rate-sa",
      paxGroups: GROUPS,
      unitRefs: [
        { index: 0, adults: 2, children: 0, infants: 0, paxGroupIds: ["g1"] },
        { index: 1, adults: 1, children: 0, infants: 0, paxGroupIds: ["g2"], rateTypeId: "rate-tw" },
      ],
    },
  },
  { pricing_snapshot: { legId: "leg-train", rateTypeId: "rate-tw", paxGroups: GROUPS } },
  { pricing_snapshot: { legId: "leg-hotel", rateTypeId: null, unitRefs: [{ index: 0, adults: 2, children: 0, infants: 0 }] } },
  { pricing_snapshot: null },
]

type QueryResult = { data: { id: string; short_label: string | null }[] | null; error: { message: string } | null }

/** A client covering only `from("rate_types").select(...).in("id", ids)`. */
function stubClient(result: QueryResult | (() => Promise<QueryResult>)) {
  const inFn = vi.fn((_column: string, _ids: string[]) =>
    typeof result === "function" ? result() : Promise.resolve(result),
  )
  const select = vi.fn((_columns: string) => ({ in: inFn }))
  const from = vi.fn((_table: string) => ({ select }))
  return { client: { from } as unknown as SupabaseClient<Database>, from, select, inFn }
}

describe("collectRateTypeIds", () => {
  it("collects each rate type once from snapshots and unit refs", () => {
    expect(collectRateTypeIds(LINES).sort()).toEqual(["rate-sa", "rate-tw"])
  })
})

describe("loadRateShortLabels", () => {
  it("reads every short label in one select, trimming and nulling blanks", async () => {
    const { client, from, select, inFn } = stubClient({
      data: [
        { id: "rate-sa", short_label: " SA " },
        { id: "rate-tw", short_label: "   " },
      ],
      error: null,
    })
    const labels = await loadRateShortLabels(client, LINES)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith("rate_types")
    expect(select).toHaveBeenCalledWith("id, short_label")
    expect(inFn).toHaveBeenCalledTimes(1)
    expect(inFn.mock.calls[0][0]).toBe("id")
    expect([...inFn.mock.calls[0][1]].sort()).toEqual(["rate-sa", "rate-tw"])
    expect(labels).toEqual(
      new Map([
        ["rate-sa", "SA"],
        ["rate-tw", null],
      ]),
    )
  })

  it("keeps a null label as null", async () => {
    const { client } = stubClient({ data: [{ id: "rate-sa", short_label: null }], error: null })
    expect(await loadRateShortLabels(client, LINES)).toEqual(new Map([["rate-sa", null]]))
  })

  it("returns an empty map when the read fails", async () => {
    const { client } = stubClient({ data: null, error: { message: "permission denied" } })
    expect(await loadRateShortLabels(client, LINES)).toEqual(new Map())
  })

  it("returns an empty map when the client throws", async () => {
    const { client } = stubClient(() => Promise.reject(new Error("network down")))
    expect(await loadRateShortLabels(client, LINES)).toEqual(new Map())
  })

  it("skips the query when no line priced at a rate type", async () => {
    const { client, from } = stubClient({ data: [], error: null })
    const lines = [{ pricing_snapshot: { legId: "leg-train", paxGroups: GROUPS } }]
    expect(await loadRateShortLabels(client, lines)).toEqual(new Map())
    expect(from).not.toHaveBeenCalled()
  })

  it("skips the query on a booking without pax groups, where no label prints", async () => {
    const { client, from } = stubClient({ data: [], error: null })
    const lines = [{ pricing_snapshot: { legId: "leg-train", rateTypeId: "rate-sa" } }]
    expect(await loadRateShortLabels(client, lines)).toEqual(new Map())
    expect(await loadRateShortLabels(client, [])).toEqual(new Map())
    expect(from).not.toHaveBeenCalled()
  })
})
