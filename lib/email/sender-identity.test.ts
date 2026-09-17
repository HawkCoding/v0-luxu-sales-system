import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceClientMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: serviceClientMocks.createServiceClient,
}))

import { formatFromHeader, resolveSenderDisplayName } from "./sender-identity"

interface TableResponses {
  email_signatures?: unknown
  profiles?: unknown
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

const SA_RAIL_BRAND = { id: "brand-sa-rail", name: "SA Rail" }
const LUXUS_BRAND = { id: "brand-luxus", name: "Luxus Travel & Tours" }

describe("resolveSenderDisplayName", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when no profile id is given", async () => {
    expect(await resolveSenderDisplayName(null)).toBeNull()
    expect(await resolveSenderDisplayName(undefined)).toBeNull()
    expect(serviceClientMocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("combines the signature full name with the default brand", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Carmen De Jongh" },
        signature_brands: [SA_RAIL_BRAND, LUXUS_BRAND],
      }),
    )

    expect(await resolveSenderDisplayName("profile-1")).toBe("Carmen De Jongh - SA Rail")
  })

  it("uses the explicit brandId when it matches an enabled brand", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Carmen De Jongh" },
        signature_brands: [SA_RAIL_BRAND, LUXUS_BRAND],
      }),
    )

    expect(await resolveSenderDisplayName("profile-1", "brand-luxus")).toBe(
      "Carmen De Jongh - Luxus Travel & Tours",
    )
  })

  it("falls back to the first enabled brand when brandId is unknown", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Carmen De Jongh" },
        signature_brands: [SA_RAIL_BRAND, LUXUS_BRAND],
      }),
    )

    expect(await resolveSenderDisplayName("profile-1", "does-not-exist")).toBe(
      "Carmen De Jongh - SA Rail",
    )
  })

  it("falls back to the profile name when no email_signatures row exists", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: null,
        profiles: { name: "Carmen", surname: "De Jongh" },
        signature_brands: [SA_RAIL_BRAND],
      }),
    )

    expect(await resolveSenderDisplayName("profile-1")).toBe("Carmen De Jongh - SA Rail")
  })

  it("returns the name alone when no brands exist", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: { full_name: "Carmen De Jongh" },
        signature_brands: [],
      }),
    )

    expect(await resolveSenderDisplayName("profile-1")).toBe("Carmen De Jongh")
  })

  it("returns null when neither the signature row nor the profile carries a name", async () => {
    serviceClientMocks.createServiceClient.mockReturnValue(
      makeSupabase({
        email_signatures: null,
        profiles: { name: null, surname: null },
        signature_brands: [SA_RAIL_BRAND],
      }),
    )

    expect(await resolveSenderDisplayName("profile-1")).toBeNull()
  })

  it("never throws — returns null when the lookup fails", async () => {
    serviceClientMocks.createServiceClient.mockImplementation(() => {
      throw new Error("boom")
    })

    await expect(resolveSenderDisplayName("profile-1")).resolves.toBeNull()
  })
})

describe("formatFromHeader", () => {
  it("returns the bare address when no name is given", () => {
    expect(formatFromHeader(null, "reservations@sa-rail.co.za")).toBe(
      "reservations@sa-rail.co.za",
    )
    expect(formatFromHeader(undefined, "reservations@sa-rail.co.za")).toBe(
      "reservations@sa-rail.co.za",
    )
    expect(formatFromHeader("  ", "reservations@sa-rail.co.za")).toBe(
      "reservations@sa-rail.co.za",
    )
  })

  it("quotes the display name", () => {
    expect(formatFromHeader("Carmen De Jongh - SA Rail", "reservations@sa-rail.co.za")).toBe(
      '"Carmen De Jongh - SA Rail" <reservations@sa-rail.co.za>',
    )
  })

  it("escapes embedded quotes and backslashes in the name", () => {
    expect(formatFromHeader('Carmen "CJ" De Jongh', "reservations@sa-rail.co.za")).toBe(
      '"Carmen \\"CJ\\" De Jongh" <reservations@sa-rail.co.za>',
    )
  })
})
