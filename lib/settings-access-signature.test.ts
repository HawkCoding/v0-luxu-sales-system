import { describe, expect, it, vi } from "vitest"

const rows = vi.hoisted(() => ({ value: [] as Array<{ key: string; value: string }> }))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows.value, error: null }),
      }),
    }),
  }),
}))

import { getEmailSignatureSettings, SIGNATURE_LINE_HIDDEN } from "./settings-access"

describe("getEmailSignatureSettings", () => {
  it("uses the built-in default when a line has no row", async () => {
    rows.value = []
    const settings = await getEmailSignatureSettings()
    expect(settings.signature_divisions_line).toBe("DIVISIONS OF LUXUS TRAVEL & TOURS")
  })

  it("still uses the built-in default for a stored blank", async () => {
    rows.value = [{ key: "signature_divisions_line", value: "<p></p>" }]
    const settings = await getEmailSignatureSettings()
    expect(settings.signature_divisions_line).toBe("DIVISIONS OF LUXUS TRAVEL & TOURS")
  })

  it("keeps a deliberately cleared line cleared", async () => {
    rows.value = [{ key: "signature_divisions_line", value: SIGNATURE_LINE_HIDDEN }]
    const settings = await getEmailSignatureSettings()
    expect(settings.signature_divisions_line).toBe("")
    expect(settings.signature_confidentiality).toContain("CONFIDENTIALITY CAUTION")
  })
})
