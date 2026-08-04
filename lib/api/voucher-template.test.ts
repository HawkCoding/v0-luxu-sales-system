import { describe, expect, it, vi } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { getOrCreateVoucherTemplateId } from "./voucher-template"

describe("getOrCreateVoucherTemplateId", () => {
  it("returns the existing row's id without inserting", async () => {
    const { supabase, store } = createSupabaseMock({
      voucher_template: [{ id: "template-1" }],
    })

    const id = await getOrCreateVoucherTemplateId(supabase as never)

    expect(id).toBe("template-1")
    expect(store.rows("voucher_template")).toHaveLength(1)
  })

  it("creates a default row when none exists", async () => {
    const { supabase, store } = createSupabaseMock({ voucher_template: [] })

    const id = await getOrCreateVoucherTemplateId(supabase as never)

    expect(id).toBeTruthy()
    expect(store.rows("voucher_template")).toEqual([expect.objectContaining({ id })])
  })

  it("returns null and logs when the insert fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
          })),
        })),
      })),
    }

    const id = await getOrCreateVoucherTemplateId(supabase as never)

    expect(id).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith("voucher-template:create-singleton", { message: "insert failed" })
    errorSpy.mockRestore()
  })
})
