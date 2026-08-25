import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { findMojibake } from "../lib/mojibake"

const overlaySql = readFileSync(join(process.cwd(), "supabase", "seed-prod-config.sql"), "utf8")

describe("production config overlay (seed-prod-config.sql)", () => {
  it("is applied after seed.sql in the local seed order", () => {
    const configToml = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8")
    const seedPathsLine = configToml.split("\n").find((line) => line.includes("sql_paths"))
    expect(seedPathsLine).toBeDefined()
    expect(seedPathsLine).toContain("./seed.sql")
    expect(seedPathsLine).toContain("./seed-prod-config.sql")
    expect(seedPathsLine!.indexOf("./seed.sql")).toBeLessThan(seedPathsLine!.indexOf("./seed-prod-config.sql"))
  })

  it("upserts the core config tables", () => {
    expect(overlaySql).toContain("insert into public.suppliers")
    expect(overlaySql).toContain("insert into public.app_settings")
    expect(overlaySql).toContain("insert into public.routes")
    expect(overlaySql).toContain("insert into public.templates")
    expect(overlaySql).toContain("insert into public.payment_methods")
    expect(overlaySql).toContain("update public.voucher_template")
  })

  it("wraps every write in a transaction and restores triggers", () => {
    expect(overlaySql.trimStart()).not.toMatch(/^$/)
    expect(overlaySql).toContain("begin;")
    expect(overlaySql.trimEnd()).toMatch(/commit;\s*$/)
    // Never leave triggers disabled — every disable must have a matching enable.
    const disableCount = (overlaySql.match(/disable trigger user/g) ?? []).length
    const enableCount = (overlaySql.match(/enable trigger user/g) ?? []).length
    expect(disableCount).toBeGreaterThan(0)
    expect(disableCount).toBe(enableCount)
    // session_replication_role must always be flipped back to default.
    const replicaCount = (overlaySql.match(/session_replication_role = replica/g) ?? []).length
    const defaultCount = (overlaySql.match(/session_replication_role = default/g) ?? []).length
    expect(replicaCount).toBe(defaultCount)
  })

  it("nulls suite_vocab_aliases.created_by (production auth.users id doesn't exist locally)", () => {
    expect(overlaySql).toContain("created_by nulled")
  })

  it("contains no double-encoded (mojibake) text", () => {
    const matches = findMojibake(overlaySql)
    expect(matches).toEqual([])
  })
})
