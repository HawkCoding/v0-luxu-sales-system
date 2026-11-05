import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261105120000_document_version_fingerprint.sql"),
  "utf8",
)

describe("document_versions fingerprint migration", () => {
  it("adds one nullable column and nothing destructive", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS content_fingerprint text")
    expect(sql).not.toMatch(/NOT NULL/i)
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE\s/i)
  })
})
