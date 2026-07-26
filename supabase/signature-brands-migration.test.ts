import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migrationSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260727100000_signature_brands.sql"),
  "utf8",
)

describe("signature brands migration", () => {
  it("creates the signature_brands table with the badges array check", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.signature_brands")
    expect(migrationSql).toContain("CHECK (jsonb_typeof(badges) = 'array')")
    expect(migrationSql).toContain("CREATE INDEX IF NOT EXISTS signature_brands_sort_order_idx")
  })

  it("enforces RLS with a DROP POLICY before each CREATE POLICY", () => {
    const dropIndex = migrationSql.indexOf('DROP POLICY IF EXISTS "signature_brands_admin_manager_all"')
    const createIndex = migrationSql.indexOf('CREATE POLICY "signature_brands_admin_manager_all"')
    expect(dropIndex).toBeGreaterThan(-1)
    expect(createIndex).toBeGreaterThan(dropIndex)

    const dropSelect = migrationSql.indexOf('DROP POLICY IF EXISTS "signature_brands_select_all"')
    const createSelect = migrationSql.indexOf('CREATE POLICY "signature_brands_select_all"')
    expect(dropSelect).toBeGreaterThan(-1)
    expect(createSelect).toBeGreaterThan(dropSelect)
  })

  it("caps brand rows with a BEFORE INSERT trigger, not a CHECK", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.signature_brands_enforce_cap")
    expect(migrationSql).toContain("RAISE EXCEPTION 'Maximum of 10 signature brands allowed'")
    expect(migrationSql).toContain("BEFORE INSERT ON public.signature_brands")
  })

  it("seeds all three known divisions", () => {
    expect(migrationSql).toContain("'sa-rail', 'SA Rail'")
    expect(migrationSql).toContain("'luxus-travel', 'Luxus Travel & Tours'")
    expect(migrationSql).toContain("'arnelia-house', 'Arnelia House'")
  })

  it("carries the existing banner into the SA Rail row before retiring the app_settings key", () => {
    expect(migrationSql).toContain(
      "NULLIF((SELECT value FROM public.app_settings WHERE key = 'signature_banner_url'), '')",
    )
    expect(migrationSql).toContain("DELETE FROM public.app_settings WHERE key = 'signature_banner_url'")
  })

  it("adds the new office address global default", () => {
    expect(migrationSql).toContain("'signature_office_address', ''")
  })

  it("never touches the email_signatures table's schema", () => {
    expect(migrationSql).not.toMatch(/ALTER TABLE.*email_signatures/i)
    expect(migrationSql).not.toMatch(/CREATE TABLE.*email_signatures/i)
  })
})
