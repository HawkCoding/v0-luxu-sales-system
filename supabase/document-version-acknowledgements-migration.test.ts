import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261105130000_document_version_acknowledgements.sql"),
  "utf8",
)

describe("document_version_acknowledgements migration", () => {
  it("is additive and idempotent", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.document_version_acknowledgements")
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
  })

  it("records the booking fingerprint at the moment of the decision", () => {
    expect(sql).toContain("fingerprint text NOT NULL")
    expect(sql).toContain("acknowledged_at timestamp with time zone NOT NULL DEFAULT now()")
  })

  it("goes with the copy it is about, and is insert-only for signed-in users", () => {
    expect(sql).toContain("document_version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE")
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.document_version_acknowledgements TO authenticated")
    expect(sql).not.toContain("biz_update")
    expect(sql).not.toContain("biz_delete")
  })
})
