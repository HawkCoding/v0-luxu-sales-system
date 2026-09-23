import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { canUserViewReporting } from "./access"

function clientReturning(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockReturnThis()
  const select = vi.fn().mockReturnThis()
  const single = vi.fn().mockResolvedValue(result)
  const from = vi.fn(() => ({ select, eq, single }))
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    select,
    eq,
  }
}

describe("canUserViewReporting", () => {
  it("allows an active user with the grant", async () => {
    const { client, from, select, eq } = clientReturning({
      data: { clearance_level: "consultant", is_active: true, can_view_reporting: true },
      error: null,
    })

    await expect(canUserViewReporting(client, "u1")).resolves.toBe(true)
    expect(from).toHaveBeenCalledWith("profiles")
    expect(select).toHaveBeenCalledWith("clearance_level, is_active, can_view_reporting")
    expect(eq).toHaveBeenCalledWith("user_id", "u1")
  })

  it.each(["admin", "manager", "consultant"])("denies %s without the grant", async (role) => {
    const { client } = clientReturning({
      data: { clearance_level: role, is_active: true, can_view_reporting: false },
      error: null,
    })
    await expect(canUserViewReporting(client, "u1")).resolves.toBe(false)
  })

  it("denies an inactive account even with the grant", async () => {
    const { client } = clientReturning({
      data: { clearance_level: "admin", is_active: false, can_view_reporting: true },
      error: null,
    })
    await expect(canUserViewReporting(client, "u1")).resolves.toBe(false)
  })

  it("denies a retired clearance level even with the grant", async () => {
    const { client } = clientReturning({
      data: { clearance_level: "readonly", is_active: true, can_view_reporting: true },
      error: null,
    })
    await expect(canUserViewReporting(client, "u1")).resolves.toBe(false)
  })

  it("denies when the profile is missing", async () => {
    const { client } = clientReturning({ data: null, error: null })
    await expect(canUserViewReporting(client, "u1")).resolves.toBe(false)
  })

  it("denies when the profile query errors", async () => {
    const { client } = clientReturning({ data: null, error: { message: "boom" } })
    await expect(canUserViewReporting(client, "u1")).resolves.toBe(false)
  })
})
