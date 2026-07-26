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

const GLOBAL_DEFAULTS = {
  signature_enabled: "true",
  signature_company_line: "SA-Rail is a division of Luxus Travel & Tours.",
  signature_registration_line: "Registered in South Africa CK2007/049324/23",
  signature_trading_hours: "Trading Hours: Mon – Fri 08h30 to 16h00",
  signature_divisions_line: "DIVISIONS OF LUXUS TRAVEL & TOURS",
  signature_confidentiality: "CONFIDENTIALITY CAUTION: ...",
  signature_office_address: "",
}

const SA_RAIL_BRAND = {
  id: "brand-sa-rail",
  slug: "sa-rail",
  name: "SA Rail",
  banner_url: "https://cdn.example.com/banner.png",
  banner_width: 480,
  banner_height: 120,
  badges: [],
  enabled: true,
  sort_order: 0,
  company_line: null,
  registration_line: null,
  trading_hours: null,
  divisions_line: null,
  confidentiality: null,
  office_address: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const LUXUS_BRAND = {
  ...SA_RAIL_BRAND,
  id: "brand-luxus",
  slug: "luxus-travel",
  name: "Luxus Travel & Tours",
  banner_url: null,
  sort_order: 1,
}

interface TableResponses {
  email_signatures?: unknown
  profiles?: unknown
  salesperson_credentials?: unknown
  signature_brands?: unknown[]
}

function makeSupabase(responses: TableResponses) {
  return {
    from: vi.fn((table: string) => {
      if (table === "signature_brands") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: { data: unknown; error: null }) => void) =>
            resolve({ data: responses.signature_brands ?? [], error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: responses[table as keyof TableResponses] ?? null,
          error: null,
        })),
      }
    }),
  }
}

describe("resolveEmailSignature", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsMocks.getEmailSignatureSettings.mockResolvedValue({ ...GLOBAL_DEFAULTS })
  })

  it("returns null when no profile id is given", async () => {
    expect(await resolveEmailSignature(null)).toBeNull()
    expect(await resolveEmailSignature(undefined)).toBeNull()
    expect(serviceClientMocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("returns null when signatures are disabled globally", async () => {
    settingsMocks.getEmailSignatureSettings.mockResolvedValue({
      ...GLOBAL_DEFAULTS,
      signature_enabled: "false",
    })
    serviceClientMocks.createServiceClient.mockReturnValue(makeSupabase({}))

    expect(await resolveEmailSignature("profile-1")).toBeNull()
  })

  it("returns null when no brands exist", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Leonie Burke" },
        signature_brands: [],
      }),
    )

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
        signature_brands: [SA_RAIL_BRAND],
      }),
    )

    const signature = await resolveEmailSignature("profile-1")

    expect(signature).not.toBeNull()
    expect(signature?.fullName).toBe("Leonie Burke")
    expect(signature?.email).toBe("reservations2@sa-rail.co.za")
    expect(signature?.brand.divisionsLine).toBe("DIVISIONS OF LUXUS TRAVEL & TOURS")
  })

  it("falls back to the profile name and credential email when no signature row exists", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: null,
        profiles: { name: "Leonie", surname: "Burke", email: "leonie@luxustravel.co.za" },
        salesperson_credentials: { email_address: "leonie@sa-rail.co.za" },
        signature_brands: [SA_RAIL_BRAND],
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
        signature_brands: [SA_RAIL_BRAND],
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
        signature_brands: [SA_RAIL_BRAND],
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
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Leonie Burke" },
        signature_brands: [{ ...SA_RAIL_BRAND, banner_url: "https://cdn.example.com/banner.svg" }],
      }),
    )

    const signature = await resolveEmailSignature("profile-1")
    expect(signature?.brand.bannerUrl).toBeNull()
  })

  it("uses the explicit brandId when it matches an enabled brand", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Leonie Burke" },
        signature_brands: [SA_RAIL_BRAND, LUXUS_BRAND],
      }),
    )

    const signature = await resolveEmailSignature("profile-1", "brand-luxus")
    expect(signature?.brandId).toBe("brand-luxus")
    expect(signature?.brand.name).toBe("Luxus Travel & Tours")
  })

  it("falls back to the first enabled brand when brandId is unknown, not to null", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Leonie Burke" },
        signature_brands: [SA_RAIL_BRAND, LUXUS_BRAND],
      }),
    )

    const signature = await resolveEmailSignature("profile-1", "does-not-exist")
    expect(signature).not.toBeNull()
    expect(signature?.brandId).toBe("brand-sa-rail")
  })

  it("falls back to the first brand when brandId is omitted", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Leonie Burke" },
        signature_brands: [SA_RAIL_BRAND, LUXUS_BRAND],
      }),
    )

    const signature = await resolveEmailSignature("profile-1")
    expect(signature?.brandId).toBe("brand-sa-rail")
  })
})
