import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const seedSql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8")

const devUsers = [
  { id: "00000000-0000-0000-0000-0000000000a1", email: "carmen@luxustravel.co.za", role: "admin" },
  { id: "00000000-0000-0000-0000-0000000000a2", email: "leonie@luxustravel.co.za", role: "consultant" },
  { id: "00000000-0000-0000-0000-0000000000a3", email: "dirk@luxustravel.co.za", role: "manager" },
  { id: "00000000-0000-0000-0000-0000000000a4", email: "monade@luxustravel.co.za", role: "consultant" },
  { id: "00000000-0000-0000-0000-0000000000a5", email: "douwlien@luxustravel.co.za", role: "readonly" },
]

describe("local Supabase seed", () => {
  it("keeps the standard dev login users available after reset", () => {
    for (const user of devUsers) {
      expect(seedSql).toContain(user.id)
      expect(seedSql).toContain(user.email)
      expect(seedSql).toContain(`'${user.role}'`)
    }

    expect(seedSql).toContain("extensions.crypt('password123'")
    expect(seedSql).toContain("insert into auth.users")
    expect(seedSql).toContain("insert into auth.identities")
    expect(seedSql).toContain("insert into public.profiles")
  })

  it("uses idempotent auth and profile upserts for repeated local seeding", () => {
    expect(seedSql).toContain("on conflict (id) do update")
    expect(seedSql).toContain("on conflict (user_id) do update")
    expect(seedSql).toContain("is_active = excluded.is_active")
  })

  it("uses product-year job numbers and seeds product counters", () => {
    expect(seedSql).not.toContain("LUX-")
    expect(seedSql).not.toContain("nextval")
    expect(seedSql).not.toContain("::regclass")
    expect(seedSql).not.toContain("job_number_counters")
    expect(seedSql).toContain("'Blue Train', 'blue-train', 'train_operator'")
    expect(seedSql).toContain("'RR-2025-0001'")
    expect(seedSql).toContain("insert into public.booking_number_sequences")
    expect(seedSql).toContain("max(parsed.sequence_number)")
    expect(seedSql).toContain("booking_number ~ '^(BT|RR|REV)-[0-9]{4}-[0-9]{4}$'")
  })
})
