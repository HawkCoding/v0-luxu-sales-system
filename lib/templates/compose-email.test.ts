import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  CONTENT_CLASS_NAME,
  CONTENT_SLOT_END,
  CONTENT_SLOT_START,
  extractContentSlot,
  replaceContentSlot,
} from "./content-slot"

const settingsMocks = vi.hoisted(() => ({
  getEmailBrandingSettings: vi.fn(),
  getDocumentBrandForEmail: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getEmailBrandingSettings: settingsMocks.getEmailBrandingSettings,
  getDocumentBrandForEmail: settingsMocks.getDocumentBrandForEmail,
}))

const signatureMocks = vi.hoisted(() => ({
  resolveEmailSignature: vi.fn(),
}))

vi.mock("@/lib/email/signature", () => ({
  resolveEmailSignature: signatureMocks.resolveEmailSignature,
}))

const DEFAULT_BRANDING = {
  footerTagline: "Test tagline",
  email_font_family: "Arial, sans-serif",
  email_font_size: "16px",
} as const

import { composeEmail, composeFromTemplate } from "./compose-email"

describe("composeFromTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsMocks.getEmailBrandingSettings.mockResolvedValue({ ...DEFAULT_BRANDING })
    settingsMocks.getDocumentBrandForEmail.mockResolvedValue({
      brand: {
        heading: "SA RAIL",
        subheading: "THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
        logoUrl: null,
      },
      position: "bottom",
    })
    signatureMocks.resolveEmailSignature.mockResolvedValue(null)
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
    expect(composed.bodyHtml).toContain("SA RAIL")
    expect(composed.bodyHtml).toContain("THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI")
    // legacy footer assertion replaced by brand-block heading above ("A division of Luxus Travel &amp; Tours")
    expect(composed.warnings).toEqual([])
  })

  it("places the brand block after the content when position is bottom", async () => {
    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(composed.bodyHtml.indexOf("SA RAIL")).toBeGreaterThan(
      composed.bodyHtml.indexOf(CONTENT_SLOT_START),
    )
  })

  it("places the brand block before the content when position is top", async () => {
    settingsMocks.getDocumentBrandForEmail.mockResolvedValue({
      brand: {
        heading: "SA RAIL",
        subheading: "THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
        logoUrl: null,
      },
      position: "top",
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    const brandIndex = composed.bodyHtml.indexOf("SA RAIL")
    expect(brandIndex).toBeGreaterThanOrEqual(0)
    expect(brandIndex).toBeLessThan(composed.bodyHtml.indexOf(CONTENT_SLOT_START))
  })

  it("omits the brand block entirely when position is hidden", async () => {
    settingsMocks.getDocumentBrandForEmail.mockResolvedValue({
      brand: {
        heading: "SA RAIL",
        subheading: "THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
        logoUrl: null,
      },
      position: "hidden",
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(composed.bodyHtml).not.toContain("SA RAIL")
  })

  it("no longer renders a separate logo/wordmark header above the brand block", async () => {
    settingsMocks.getDocumentBrandForEmail.mockResolvedValue({
      brand: {
        heading: "SA RAIL",
        subheading: "THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
        logoUrl: null,
      },
      position: "hidden",
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(composed.bodyHtml).not.toContain("Luxus Travel")
  })

  it("applies the configured font to the content, not just the body", async () => {
    settingsMocks.getEmailBrandingSettings.mockResolvedValue({
      ...DEFAULT_BRANDING,
      email_font_family: "Georgia, serif",
      email_font_size: "18px",
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    // The head rule is what survives Outlook's font reset on block elements.
    expect(composed.bodyHtml).toContain(`.${CONTENT_CLASS_NAME} p`)
    expect(composed.bodyHtml).toContain("font-family: Georgia, serif")
    expect(composed.bodyHtml).toContain("font-size: 18px")
  })

  it("keeps the font rule when edited content is spliced back into the slot", async () => {
    settingsMocks.getEmailBrandingSettings.mockResolvedValue({
      ...DEFAULT_BRANDING,
      email_font_family: "Georgia, serif",
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Original</p>" },
      { tokens: {} },
    )
    const edited = replaceContentSlot(composed.bodyHtml, "<p>Edited by salesperson</p>")

    expect(edited).toContain("<p>Edited by salesperson</p>")
    expect(edited).toContain("font-family: Georgia, serif")
    expect(edited).toContain(`class="${CONTENT_CLASS_NAME}"`)
  })

  it("falls back to the default font when the stored value is unrecognised", async () => {
    // getEmailBrandingSettings coerces on read; this guards the render path if it ever doesn't.
    settingsMocks.getEmailBrandingSettings.mockResolvedValue({
      ...DEFAULT_BRANDING,
      email_font_family: undefined,
      email_font_size: undefined,
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(composed.bodyHtml).toContain("font-family: Arial, sans-serif")
    expect(composed.bodyHtml).toContain("font-size: 16px")
  })

  it("renders the sender's signature outside the content slot when senderProfileId is given", async () => {
    signatureMocks.resolveEmailSignature.mockResolvedValue({
      profileId: "profile-1",
      brandId: "brand-sa-rail",
      fullName: "Leonie Burke",
      jobTitle: "Tour Operating Consultant",
      tel: "+27 (0)21 100 3596",
      cell: null,
      fax: null,
      email: "reservations2@sa-rail.co.za",
      website: "www.sa-rail.co.za",
      brand: {
        id: "brand-sa-rail",
        slug: "sa-rail",
        name: "SA Rail",
        bannerUrl: null,
        bannerWidth: null,
        bannerHeight: null,
        badges: [],
        companyLine: "SA-Rail is a division of Luxus Travel & Tours.",
        registrationLine: "Registered in South Africa CK2007/049324/23",
        tradingHours: "Trading Hours: Mon – Fri 08h30 to 16h00",
        divisionsLine: "DIVISIONS OF LUXUS TRAVEL & TOURS",
        confidentiality: "CONFIDENTIALITY CAUTION: ...",
        officeAddress: null,
      },
    })

    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {}, senderProfileId: "profile-1" },
    )

    expect(signatureMocks.resolveEmailSignature).toHaveBeenCalledWith("profile-1", undefined)
    expect(composed.bodyHtml).toContain("Leonie Burke")
    expect(composed.bodyHtml).toContain("Tour Operating Consultant")
    expect(composed.signatureProfileId).toBe("profile-1")
    expect(composed.signatureBrandId).toBe("brand-sa-rail")
    // The signature must sit after the slot markers, not inside them — the
    // send preview only lets the salesperson edit the slotted content.
    const contentEnd = composed.bodyHtml.indexOf(CONTENT_SLOT_END)
    const signatureIndex = composed.bodyHtml.indexOf("Leonie Burke")
    expect(signatureIndex).toBeGreaterThan(contentEnd)
  })

  it("renders no signature block when senderProfileId is omitted", async () => {
    const composed = await composeFromTemplate(
      { subject: "Hi", bodyHtml: "<p>Body</p>" },
      { tokens: {} },
    )

    expect(signatureMocks.resolveEmailSignature).toHaveBeenCalledWith(undefined, undefined)
    expect(composed.bodyHtml).not.toContain("Kind regards")
    expect(composed.signatureProfileId).toBeNull()
    expect(composed.signatureBrandId).toBeNull()
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
    settingsMocks.getEmailBrandingSettings.mockResolvedValue({ ...DEFAULT_BRANDING })
    settingsMocks.getDocumentBrandForEmail.mockResolvedValue({
      brand: {
        heading: "SA RAIL",
        subheading: "THE BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
        logoUrl: null,
      },
      position: "bottom",
    })
    signatureMocks.resolveEmailSignature.mockResolvedValue(null)
  })

  function makeSupabase(row: { key: string; subject: string; body_html: string } | null) {
    return {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
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
