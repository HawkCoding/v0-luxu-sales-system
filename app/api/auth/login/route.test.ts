import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: mocks.createServiceClient }))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function serviceClient(profile: { is_active: boolean } | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
        })),
      })),
    })),
  }
}

function loginRequest(body: unknown = { email: "user@luxustravel.co.za", password: "secret" }) {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    })
  )
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    mocks.createClient.mockReturnValue({
      auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
    })
    mocks.createServiceClient.mockReturnValue(serviceClient({ is_active: true }))
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("returns the session tokens on success", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: USER_ID },
        session: { access_token: "access-1", refresh_token: "refresh-1" },
      },
      error: null,
    })

    const res = await loginRequest()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    })
  })

  it("answers a banned account exactly like a wrong password (F02-6)", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "user_banned", message: "User is banned" },
    })
    const bannedRes = await loginRequest()
    const bannedBody = await bannedRes.text()

    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    })
    const wrongRes = await loginRequest()
    const wrongBody = await wrongRes.text()

    expect(bannedRes.status).toBe(wrongRes.status)
    expect(bannedRes.status).toBe(400)
    expect(bannedBody).toBe(wrongBody)
    expect(bannedBody).not.toMatch(/banned/i)
  })

  it("uses the same response for an invalid payload", async () => {
    const res = await loginRequest({ email: "not-an-email", password: "" })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "Invalid email or password." })
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it("withholds tokens when the profile is deactivated even if auth succeeded", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: USER_ID },
        session: { access_token: "access-1", refresh_token: "refresh-1" },
      },
      error: null,
    })
    mocks.createServiceClient.mockReturnValue(serviceClient({ is_active: false }))

    const res = await loginRequest()

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "Invalid email or password." })
    expect(mocks.signOut).toHaveBeenCalled()
  })

  it("withholds tokens when no profile row exists", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: USER_ID },
        session: { access_token: "access-1", refresh_token: "refresh-1" },
      },
      error: null,
    })
    mocks.createServiceClient.mockReturnValue(serviceClient(null))

    const res = await loginRequest()

    expect(res.status).toBe(400)
    expect(mocks.signOut).toHaveBeenCalled()
  })
})
