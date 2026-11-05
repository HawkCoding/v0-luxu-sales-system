import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261105100000_transport_requests_keep_supplier_fields.sql"),
  "utf8",
)

describe("transport requests keep supplier fields migration", () => {
  it("captures the three supplier columns by id before the delete and restores them after the insert", () => {
    const capture = sql.indexOf("jsonb_agg(")
    const del = sql.indexOf("DELETE FROM public.booking_transport_requests")
    const insert = sql.indexOf("INSERT INTO public.booking_transport_requests")
    const restore = sql.indexOf("UPDATE public.booking_transport_requests t")

    expect(capture).toBeGreaterThan(-1)
    expect(capture).toBeLessThan(del)
    expect(del).toBeLessThan(insert)
    expect(insert).toBeLessThan(restore)

    for (const column of ["supplier_reference", "supplier_contact_name", "voucher_footnote"]) {
      expect(sql).toContain(`'${column}', t.${column}`)
      expect(sql).toContain(`${column} = saved.${column}`)
    }
  })

  it("only restores onto the same booking's rows and stays idempotent", () => {
    expect(sql).toContain("WHERE t.id = saved.id")
    expect(sql).toContain("AND t.booking_id = p_booking_id")
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.replace_booking_transport_requests")
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
  })

  it("keeps the columns the previous version of the function wrote", () => {
    expect(sql).toContain("pax_group_ids")
    expect(sql).toContain("price_override_infant")
    expect(sql).toContain("booking_vehicle_rental_details")
  })
})
