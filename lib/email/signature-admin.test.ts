import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { upsertEmailSignature } from "./signature-admin"

function makeSupabase(error: { message: string } | null = null) {
  const upsert = vi.fn(async () => ({ error }))
  const from = vi.fn(() => ({ upsert }))
  return { client: { from } as unknown as SupabaseClient<Database>, from, upsert }
}

describe("upsertEmailSignature", () => {
  it("writes the provided signature fields", async () => {
    const { client, upsert } = makeSupabase()

    const result = await upsertEmailSignature(client, "p-1", { full_name: "Carmen", tel: " 021 " })

    expect(result).toEqual({ error: null })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "p-1", full_name: "Carmen", tel: "021" }),
    )
  })

  it("clears every field to null when all signature fields are sent blank", async () => {
    const { client, upsert } = makeSupabase()

    await upsertEmailSignature(client, "p-1", {
      full_name: "",
      job_title: "",
      tel: "",
      cell: "",
      fax: "",
      email: "",
      website: "",
    })

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: "p-1",
        full_name: null,
        job_title: null,
        tel: null,
        cell: null,
        fax: null,
        email: null,
        website: null,
      }),
    )
  })

  it("only writes the keys that were sent, leaving the rest of the row alone", async () => {
    const { client, upsert } = makeSupabase()

    await upsertEmailSignature(client, "p-1", { job_title: "" })

    const row = (upsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(row).toMatchObject({ profile_id: "p-1", job_title: null })
    expect(row).not.toHaveProperty("full_name")
    expect(row).not.toHaveProperty("website")
  })

  it("is a no-op when no signature field is present", async () => {
    const { client, from } = makeSupabase()

    // A credential-only payload carries unrelated keys — they must not trigger a write.
    const fields = { smtp_host: "smtp.example.com" } as unknown as Parameters<typeof upsertEmailSignature>[2]
    const result = await upsertEmailSignature(client, "p-1", fields)

    expect(result).toEqual({ error: null })
    expect(from).not.toHaveBeenCalled()
  })

  it("surfaces the database error message", async () => {
    const { client } = makeSupabase({ message: "denied" })

    const result = await upsertEmailSignature(client, "p-1", { full_name: "" })
    expect(result).toEqual({ error: "denied" })
  })
})
