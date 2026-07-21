import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceClientMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: serviceClientMocks.createServiceClient,
}))

const settingsMocks = vi.hoisted(() => ({
  getEmailSignatureSettings: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getEmailSignatureSettings: settingsMocks.getEmailSignatureSettings,
}))

import { resolveEmailSignature } from "./signature"

const COMPANY_SETTINGS = {
  signature_enabled: "true",
  signature_banner_url: "https://cdn.example.com/banner.png",
  signature_company_line: "SA-Rail is a division of Luxus Travel & Tours.",
  signature_registration_line: "Registered in South Africa CK2007/049324/23",
  signature_trading_hours: "Trading Hours: Mon – Fri 08h30 to 16h00",
  signature_divisions_line: "DIVISIONS OF LUXUS TRAVEL & TOURS",
  signature_confidentiality: "CONFIDENTIALITY CAUTION: ...",
}

interface TableResponses {
  email_signatures?: unknown
  profiles?: unknown
  salesperson_credentials?: unknown
}

function makeSupabase(responses: TableResponses) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: responses[table as keyof TableResponses] ?? null,
        error: null,
      })),
    })),
  }
}

describe("resolveEmailSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsMocks.getEmailSignatureSettings.mockResolvedValue({ ...COMPANY_SETTINGS })
  })

  it("returns null when no profile id is given", async () => {
    expect(await resolveEmailSignature(null)).toBeNull()
    expect(await resolveEmailSignature(undefined)).toBeNull()
    expect(serviceClientMocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("returns null when signatures are disabled company-wide", async () => {
    settingsMocks.getEmailSignatureSettings.mockResolvedValue({
      ...COMPANY_SETTINGS,
      signature_enabled: "false",
    })
    serviceClientMocks.createServiceClient.mockReturnValue(makeSupabase({}))

    expect(await resolveEmailSignature("profile-1")).toBeNull()
  })

  it("prefers the email_signatures row over the profile/credential fallback", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: {
          full_name: "Leonie Burke",
          job_title: "Tour Operating Consultant",
          tel: "+27 (0)21 100 3596",
          cell: "+27 (0)81 580 6471",
          fax: null,
          email: "reservations2@sa-rail.co.za",
          website: "www.sa-rail.co.za",
        },
        profiles: { name: "Leonie", surname: "Burke", email: "leonie@luxustravel.co.za" },
        salesperson_credentials: { email_address: "leonie@sa-rail.co.za" },
      }),
    )

    const signature = await resolveEmailSignature("profile-1")

    expect(signature).not.toBeNull()
    expect(signature?.fullName).toBe("Leonie Burke")
    expect(signature?.email).toBe("reservations2@sa-rail.co.za")
    expect(signature?.company.signature_divisions_line).toBe("DIVISIONS OF LUXUS TRAVEL & TOURS")
  })

  it("falls back to the profile name and credential email when no signature row exists", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: null,
        profiles: { name: "Leonie", surname: "Burke", email: "leonie@luxustravel.co.za" },
        salesperson_credentials: { email_address: "leonie@sa-rail.co.za" },
      }),
    )

    const signature = await resolveEmailSignature("profile-1")

    expect(signature?.fullName).toBe("Leonie Burke")
    expect(signature?.email).toBe("leonie@sa-rail.co.za")
  })

  it("falls back to the profile email when no credential exists either", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: null,
        profiles: { name: "Leonie", surname: "Burke", email: "leonie@luxustravel.co.za" },
        salesperson_credentials: null,
      }),
    )

    const signature = await resolveEmailSignature("profile-1")

    expect(signature?.email).toBe("leonie@luxustravel.co.za")
  })

  it("returns null when neither the signature row nor the profile carries a name", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: null,
        profiles: { name: null, surname: null, email: "leonie@luxustravel.co.za" },
        salesperson_credentials: null,
      }),
    )

    expect(await resolveEmailSignature("profile-1")).toBeNull()
  })

  it("never throws — returns null when the lookup fails", async () => {
    serviceClientMocks.createServiceClient.mockImplementation(() => {
      throw new Error("boom")
    })

    await expect(resolveEmailSignature("profile-1")).resolves.toBeNull()
  })

  it("blanks out an SVG banner URL — email clients can't render it", async () => {
    settingsMocks.getEmailSignatureSettings.mockResolvedValue({
      ...COMPANY_SETTINGS,
      signature_banner_url: "https://cdn.example.com/banner.svg",
    })
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Leonie Burke" },
      }),
    )

    const signature = await resolveEmailSignature("profile-1")
    expect(signature?.company.signature_banner_url).toBe("")
  })
})
