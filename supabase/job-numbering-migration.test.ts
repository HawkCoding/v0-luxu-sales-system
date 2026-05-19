import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migrationSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260516130000_booking_number_sequences.sql"),
  "utf8",
)

describe("phase 8 job-numbering migration", () => {
  it("adds product-year sequences and atomic allocator", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.booking_number_sequences")
    expect(migrationSql).toContain("CONSTRAINT booking_number_sequences_pkey PRIMARY KEY (product_code, year)")
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.next_booking_number")
    expect(migrationSql).toContain("ON CONFLICT (product_code, year)")
    expect(migrationSql).toContain("last_number = public.booking_number_sequences.last_number + 1")
  })

  it("removes the legacy forward path without rewriting booking history", () => {
    expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.allocate_job_number")
    expect(migrationSql).toContain("DROP TABLE IF EXISTS public.job_number_counters")
    expect(migrationSql).toContain("ALTER TABLE public.bookings ALTER COLUMN booking_number DROP DEFAULT")
    expect(migrationSql).toContain("DROP SEQUENCE IF EXISTS public.booking_number_seq")
    expect(migrationSql).not.toContain("WHERE b.booking_number LIKE 'LUX-%'")
    expect(migrationSql).not.toContain("UPDATE public.bookings")
    expect(migrationSql).not.toContain("UPDATE public.quotes")
  })
})
