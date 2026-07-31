import type { SupabaseClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveSalespersonSender } from "@/lib/email/resolve-sender"
import type { Database } from "@/lib/supabase/types"

const credentialResult = { data: null as unknown, error: null as unknown }

const createServiceClient = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => credentialResult,
      }),
    }),
  }),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => createServiceClient(),
}))

function sessionClientWithProfileEmail(email: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: email ? { email } : null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>
}

describe("resolveSalespersonSender", () => {
  beforeEach(() => {
    credentialResult.data = null
    credentialResult.error = null
  })

  it("returns no-salesperson when the booking is unassigned", async () => {
    const result = await resolveSalespersonSender(sessionClientWithProfileEmail(null), null)

    expect(result).toEqual({
      fromAddress: null,
      salespersonCredentialId: null,
      reason: "no-salesperson",
    })
  })

  it("prefers the salesperson's SMTP credential", async () => {
    credentialResult.data = { id: "cred-1", email_address: "sales@sa-rail.co.za" }

    const result = await resolveSalespersonSender(sessionClientWithProfileEmail("other@x.com"), "user-1")

    expect(result).toEqual({
      fromAddress: "sales@sa-rail.co.za",
      salespersonCredentialId: "cred-1",
      reason: "credential",
    })
  })

  it("falls back to the profile email when no credential exists", async () => {
    const result = await resolveSalespersonSender(
      sessionClientWithProfileEmail("person@example.com"),
      "user-1",
    )

    expect(result).toEqual({
      fromAddress: "person@example.com",
      salespersonCredentialId: null,
      reason: "profile-email",
    })
  })

  it("reports lookup-failed instead of silently degrading on a query error", async () => {
    credentialResult.error = { message: "permission denied" }
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await resolveSalespersonSender(sessionClientWithProfileEmail("p@x.com"), "user-1")

    expect(result).toEqual({
      fromAddress: null,
      salespersonCredentialId: null,
      reason: "lookup-failed",
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
