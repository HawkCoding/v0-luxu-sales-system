import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migrationSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260516130000_booking_number_sequences.sql"),
  "utf8",
)

const lttMigrationSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260716150000_ltt_booking_numbers.sql"),
  "utf8",
)

const blockMigrationSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260812130000_booking_number_block_allocation.sql"),
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

describe("LTT booking-number migration", () => {
  it("restricts the allocator to a single identity-only prefix", () => {
    expect(lttMigrationSql).toContain("CHECK (product_code IN ('LTT'))")
    expect(lttMigrationSql).toContain("IF p_product_code <> 'LTT' THEN")
    expect(lttMigrationSql).toContain("DELETE FROM public.booking_number_sequences WHERE product_code <> 'LTT'")
  })

  it("keeps the concurrency-safe atomic increment", () => {
    expect(lttMigrationSql).toContain("CREATE OR REPLACE FUNCTION public.next_booking_number")
    expect(lttMigrationSql).toContain("ON CONFLICT (product_code, year)")
    expect(lttMigrationSql).toContain("last_number = public.booking_number_sequences.last_number + 1")
  })

  it("re-derives the high-water mark without rewriting booking history", () => {
    expect(lttMigrationSql).toContain("'^LTT-[0-9]{4}-[0-9]{4}$'")
    expect(lttMigrationSql).not.toContain("UPDATE public.bookings")
    expect(lttMigrationSql).not.toContain("UPDATE public.quotes")
  })
})

describe("booking-number block allocation migration", () => {
  it("reserves a range with the same atomic upsert as the per-row allocator", () => {
    expect(blockMigrationSql).toContain("CREATE OR REPLACE FUNCTION public.next_booking_number_block")
    expect(blockMigrationSql).toContain("ON CONFLICT (product_code, year)")
    expect(blockMigrationSql).toContain("last_number = public.booking_number_sequences.last_number + p_count")
  })

  it("keeps the single-booking allocator in place", () => {
    expect(blockMigrationSql).not.toContain("DROP FUNCTION IF EXISTS public.next_booking_number(")
  })

  it("bounds the block size and rejects other product codes", () => {
    expect(blockMigrationSql).toContain("IF p_count < 1 OR p_count > 1000 THEN")
    expect(blockMigrationSql).toContain("IF p_product_code <> 'LTT' THEN")
  })
})
