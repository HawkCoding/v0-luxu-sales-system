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

  it("returns an empty fragment when the signature cannot be resolved", async () => {
    makeAuth("consultant")
    signatureMocks.resolveEmailSignature.mockResolvedValue(null)

    const res = await POST(makeRequest({ brandId: BRAND_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.html).toBe("")
  })
})
