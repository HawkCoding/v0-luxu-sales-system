import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONTENT_SLOT_END, CONTENT_SLOT_START, extractContentSlot } from "./content-slot"

const settingsMocks = vi.hoisted(() => ({
  getEmailFooterTagline: vi.fn(),
}))

const brandingMocks = vi.hoisted(() => ({
  getEmailLogoUrl: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getEmailFooterTagline: settingsMocks.getEmailFooterTagline,
}))

vi.mock("@/lib/email/branding", () => ({
  getEmailLogoUrl: brandingMocks.getEmailLogoUrl,
}))

import { composeEmail, composeFromTemplate } from "./compose-email"

describe("composeFromTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsMocks.getEmailFooterTagline.mockResolvedValue("Test tagline")
    brandingMocks.getEmailLogoUrl.mockResolvedValue("https://cdn.example.com/logo.png")
  })

  it("renders the branded logo in the email header", async () => {
    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(composed.bodyHtml).toContain("https://cdn.example.com/logo.png")
  })

  it("falls back to a text wordmark when no logo URL is available", async () => {
    brandingMocks.getEmailLogoUrl.mockResolvedValue(null)

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(composed.bodyHtml).not.toContain("<img")
    expect(composed.bodyHtml).toContain("Luxus Travel")
  })

  it("renders a full branded email with slot markers around the content", async () => {
    const composed = await composeFromTemplate(
      {
        subject: "Your Quote — {{jobNumber}}",
        bodyHtml: "<p>Dear {{customerName}}</p>",
      },
      { tokens: { jobNumber: "BT-1", customerName: "Jane" } },
    )

    expect(composed.subject).toBe("Your Quote — BT-1")
    expect(composed.bodyContentHtml).toBe("<p>Dear Jane</p>")
    expect(composed.bodyHtml).toContain(CONTENT_SLOT_START)
    expect(composed.bodyHtml).toContain(CONTENT_SLOT_END)
    expect(extractContentSlot(composed.bodyHtml)).toBe("<p>Dear Jane</p>")
    expect(composed.bodyHtml).toContain("Test tagline")
    expect(composed.warnings).toEqual([])
  })

  it("propagates warnings for unreplaced tokens", async () => {
    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>{{missing}}</p>" },
      { tokens: {} },
    )

    expect(composed.warnings).toEqual(["Unreplaced token: {{missing}}"])
    expect(extractContentSlot(composed.bodyHtml)).toBe("<p>{{missing}}</p>")
  })
})

describe("composeEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsMocks.getEmailFooterTagline.mockResolvedValue("Test tagline")
    brandingMocks.getEmailLogoUrl.mockResolvedValue("https://cdn.example.com/logo.png")
  })

  function makeSupabase(row: { key: string; subject: string; body_html: string } | null) {
    return {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      })),
    }
  }

  it("composes from the DB template row when present", async () => {
    const supabase = makeSupabase({
      key: "follow_up",
      subject: "Custom subject {{jobNumber}}",
      body_html: "<p>Custom body {{customerName}}</p>",
    })

    const composed = await composeEmail(supabase as never, "follow_up", {
      tokens: { jobNumber: "BT-9", customerName: "Jane" },
    })

    expect(composed).not.toBeNull()
    expect(composed?.subject).toBe("Custom subject BT-9")
    expect(composed?.bodyContentHtml).toBe("<p>Custom body Jane</p>")
  })

  it("falls back to the code default for a missing system template", async () => {
    const supabase = makeSupabase(null)

    const composed = await composeEmail(supabase as never, "follow_up", {
      tokens: { jobNumber: "BT-9", customerName: "Jane", lastSentDate: "2026-07-01" },
    })

    expect(composed).not.toBeNull()
    expect(composed?.subject).toBe("Following up on your enquiry — BT-9")
    expect(composed?.warnings).toEqual([])
  })

  it("returns null for an unknown custom key", async () => {
    const supabase = makeSupabase(null)
    const composed = await composeEmail(supabase as never, "not_a_template", { tokens: {} })
    expect(composed).toBeNull()
  })
})
