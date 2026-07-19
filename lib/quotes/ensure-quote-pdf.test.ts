import { describe, expect, it, vi } from "vitest"

// The customer-visible attachment name is the one place the quote number used
// to leak even when the document body hid it, so it is asserted directly.
describe("buildAttachmentFilename", () => {
  it("names the attachment after the booking while the quote reference is hidden", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("LTT-2026-0001-Q1", "LTT-2026-0001")).toBe("quote-LTT-2026-0001.pdf")
  })

  it("falls back to the quote number when the booking number is unavailable", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("LTT-2026-0001-Q1", null)).toBe("quote-LTT-2026-0001-Q1.pdf")
    expect(buildAttachmentFilename("LTT-2026-0001-Q1", "")).toBe("quote-LTT-2026-0001-Q1.pdf")
  })

  it("sanitizes characters that are unsafe in a storage path or filename", async () => {
    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")

    expect(buildAttachmentFilename("Q1", "LTT/2026 0001")).toBe("quote-LTT_2026_0001.pdf")
  })

  it("uses the quote number once the reference is re-enabled", async () => {
    vi.resetModules()
    vi.doMock("@/lib/feature-flags", () => ({
      QUOTE_REFERENCE_ENABLED: true,
      QUOTE_VALIDITY_ENABLED: false,
      BACKUPS_ENABLED: false,
    }))

    const { buildAttachmentFilename } = await import("./ensure-quote-pdf")
    expect(buildAttachmentFilename("LTT-2026-0001-Q1", "LTT-2026-0001")).toBe("quote-LTT-2026-0001-Q1.pdf")

    vi.doUnmock("@/lib/feature-flags")
    vi.resetModules()
  })
})
