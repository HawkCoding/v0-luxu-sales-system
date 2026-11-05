import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261105110000_document_versions.sql"),
  "utf8",
)

describe("document_versions migration", () => {
  it("is purely additive and idempotent", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.document_versions")
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS document_version_id")
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
  })

  it("keeps one row per distinct content and per version number", () => {
    expect(sql).toContain("UNIQUE (booking_id, doc_type, version_no)")
    expect(sql).toContain("ON public.document_versions (booking_id, doc_type, sha256)")
  })

  it("keeps the copy when the record it was issued from goes away", () => {
    for (const column of ["quote_id", "invoice_id", "voucher_id"]) {
      expect(sql).toMatch(new RegExp(`${column} uuid REFERENCES public\\.\\w+\\(id\\) ON DELETE SET NULL`))
    }
  })

  it("makes the table and its bucket insert-only for signed-in users", () => {
    // Read and insert policies exist for the table...
    expect(sql).toContain("policyname = 'biz_select'")
    expect(sql).toContain("policyname = 'biz_insert'")
    // ...and nothing grants or allows rewriting or removing an issued copy.
    expect(sql).not.toContain("biz_update")
    expect(sql).not.toContain("biz_delete")
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.document_versions TO authenticated")
    expect(sql).not.toMatch(/FOR\s+(UPDATE|DELETE)\s+TO authenticated/i)
    expect(sql).not.toMatch(/ON storage\.objects FOR (UPDATE|DELETE)/i)
  })

  it("stores PDFs in a private bucket", () => {
    expect(sql).toContain("'document-versions', 'document-versions', false")
    expect(sql).toContain("ARRAY['application/pdf']")
  })
})
