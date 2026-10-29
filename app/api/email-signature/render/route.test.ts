import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
}))

const signatureMocks = vi.hoisted(() => ({
  resolveEmailSignature: vi.fn(),
}))

vi.mock("@/lib/email/signature", () => ({
  resolveEmailSignature: signatureMocks.resolveEmailSignature,
}))

import { POST } from "./route"

const SELF_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_ID = "00000000-0000-4000-8000-000000000002"
const BRAND_ID = "00000000-0000-4000-8000-000000000099"

function makeAuth(clearanceLevel: string) {
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase: {},
      user: { id: SELF_ID, email: "consultant@example.com" },
      profile: { clearanceLevel, actorName: "Consultant", name: "C", surname: "L", email: "c@example.com" },
    },
  })
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/email-signature/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const SAMPLE_SIGNATURE = {
  profileId: SELF_ID,
  brandId: BRAND_ID,
  fullName: "Leonie Burke",
  jobTitle: null,
  tel: null,
  cell: null,
  fax: null,
  email: null,
  website: null,
  brand: {
    id: BRAND_ID,
    slug: "sa-rail",
    name: "SA Rail",
    bannerUrl: null,
    bannerWidth: null,
    bannerHeight: null,
    badges: [],
    companyLine: null,
    registrationLine: null,
    tradingHours: null,
    divisionsLine: null,
    confidentiality: null,
    officeAddress: null,
  },
}

describe("POST /api/email-signature/render", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    signatureMocks.resolveEmailSignature.mockReset()
  })

  it("returns the auth failure response when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(makeRequest({ brandId: BRAND_ID }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid input", async () => {
    makeAuth("consultant")
    const res = await POST(makeRequest({ brandId: "not-a-uuid" }))
    expect(res.status).toBe(400)
  })

  it("403s a consultant requesting another profile's signature", async () => {
    makeAuth("consultant")
    const res = await POST(makeRequest({ brandId: BRAND_ID, profileId: OTHER_ID }))
    expect(res.status).toBe(403)
    expect(signatureMocks.resolveEmailSignature).not.toHaveBeenCalled()
  })

  it("200s an admin requesting another profile's signature", async () => {
    makeAuth("admin")
    signatureMocks.resolveEmailSignature.mockResolvedValue(SAMPLE_SIGNATURE)

    const res = await POST(makeRequest({ brandId: BRAND_ID, profileId: OTHER_ID }))
    expect(res.status).toBe(200)
    expect(signatureMocks.resolveEmailSignature).toHaveBeenCalledWith(OTHER_ID, BRAND_ID)
  })

  it("defaults profileId to the caller and returns the rendered fragment", async () => {
    makeAuth("consultant")
    signatureMocks.resolveEmailSignature.mockResolvedValue(SAMPLE_SIGNATURE)

    const res = await POST(makeRequest({ brandId: BRAND_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(signatureMocks.resolveEmailSignature).toHaveBeenCalledWith(SELF_ID, BRAND_ID)
    expect(body.html).toContain("Leonie Burke")
  })

  it("renders unsaved draft overrides, sanitized the same way the brand PATCH does", async () => {
    makeAuth("admin")
    signatureMocks.resolveEmailSignature.mockResolvedValue(SAMPLE_SIGNATURE)

    const res = await POST(
      makeRequest({
        brandId: BRAND_ID,
        draft: { companyLine: "<p>Draft co</p><script>bad()</script>", tradingHours: null },
      }),
    )

    expect(res.status).toBe(200)
    expect(signatureMocks.resolveEmailSignature).toHaveBeenCalledWith(SELF_ID, BRAND_ID, {
      company_line: "<p>Draft co</p>",
      trading_hours: null,
    })
  })

  it("400s a draft field over the brand PATCH length limit", async () => {
    makeAuth("admin")
    const res = await POST(makeRequest({ brandId: BRAND_ID, draft: { companyLine: "x".repeat(2001) } }))
    expect(res.status).toBe(400)
    expect(signatureMocks.resolveEmailSignature).not.toHaveBeenCalled()
  })

  it("still 403s a consultant previewing another profile with a draft", async () => {
    makeAuth("consultant")
    const res = await POST(makeRequest({ brandId: BRAND_ID, profileId: OTHER_ID, draft: { companyLine: "x" } }))
    expect(res.status).toBe(403)
  })

  it("returns an empty fragment when the signature cannot be resolved", async () => {
    makeAuth("consultant")
    signatureMocks.resolveEmailSignature.mockResolvedValue(null)

    const res = await POST(makeRequest({ brandId: BRAND_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.html).toBe("")
  })
})
