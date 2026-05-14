import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migrationSql = readFileSync(
  new URL("./migrations/20260514120000_phase8_job_numbering.sql", import.meta.url),
  "utf8",
)

describe("phase 8 job-numbering migration", () => {
  it("adds product-year counters and atomic allocator", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.job_number_counters")
    expect(migrationSql).toContain("CONSTRAINT job_number_counters_pkey PRIMARY KEY (product_prefix, number_year)")
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.allocate_job_number")
    expect(migrationSql).toContain("ON CONFLICT (product_prefix, number_year)")
    expect(migrationSql).toContain("next_number = public.job_number_counters.next_number + 1")
  })

  it("removes the legacy default and backfills LUX references", () => {
    expect(migrationSql).toContain("ALTER TABLE public.bookings ALTER COLUMN booking_number DROP DEFAULT")
    expect(migrationSql).toContain("DROP SEQUENCE IF EXISTS public.booking_number_seq")
    expect(migrationSql).toContain("WHERE b.booking_number LIKE 'LUX-%'")
    expect(migrationSql).toContain("UPDATE public.quotes")
    expect(migrationSql).toContain("UPDATE public.invoices")
    expect(migrationSql).toContain("UPDATE public.documents")
    expect(migrationSql).toContain("UPDATE public.correspondences")
  })
})
