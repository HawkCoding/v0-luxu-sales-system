// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiSessionRecovery } from "@/components/api-session-recovery"

const refreshSession = vi.fn()

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({ auth: { refreshSession } }),
}))

const ORIGIN = "http://localhost:3000"
// Node's Request has no base URL to resolve a relative path against, unlike a browser's.
const api = (path: string): string => `${ORIGIN}${path}`

const replace = vi.fn()
const baseFetch = vi.fn()
const originalFetch = window.fetch
const originalLocation = window.location

function respond(status: number): Response {
  return new Response("{}", { status })
}

beforeEach(() => {
  refreshSession.mockReset()
  replace.mockReset()
  baseFetch.mockReset()
  window.fetch = baseFetch as unknown as typeof window.fetch
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: ORIGIN, replace },
  })
})

afterEach(() => {
  cleanup()
  window.fetch = originalFetch
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation })
})

describe("ApiSessionRecovery", () => {
  it("passes non-401 responses straight through", async () => {
    baseFetch.mockResolvedValue(respond(200))
    render(<ApiSessionRecovery />)
    const response = await window.fetch(api("/api/jobs"))
    expect(response.status).toBe(200)
    expect(refreshSession).not.toHaveBeenCalled()
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it("refreshes the session once and replays a 401 request with its body", async () => {
    baseFetch.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(200))
    refreshSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null })
    render(<ApiSessionRecovery />)

    const response = await window.fetch(api("/api/quotes"), { method: "POST", body: JSON.stringify({ a: 1 }) })

    expect(response.status).toBe(200)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(baseFetch).toHaveBeenCalledTimes(2)
    const replayed = baseFetch.mock.calls[1][0] as Request
    expect(replayed.method).toBe("POST")
    expect(await replayed.text()).toBe(JSON.stringify({ a: 1 }))
    expect(replace).not.toHaveBeenCalled()
  })

  it("shares one refresh between parallel 401s", async () => {
    const seen = new Set<string>()
    baseFetch.mockImplementation(async (request: Request) => {
      if (seen.has(request.url)) return respond(200)
      seen.add(request.url)
      return respond(401)
    })
    refreshSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null })
    render(<ApiSessionRecovery />)

    await Promise.all([window.fetch(api("/api/a")), window.fetch(api("/api/b"))])

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it("sends the user to login when the refresh fails", async () => {
    baseFetch.mockResolvedValue(respond(401))
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("expired") })
    render(<ApiSessionRecovery />)

    const response = await window.fetch(api("/api/jobs"))

    expect(response.status).toBe(401)
    expect(replace).toHaveBeenCalledWith("/login?error=session-ended")
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it("sends the user to login when the replay still answers 401", async () => {
    baseFetch.mockResolvedValue(respond(401))
    refreshSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null })
    render(<ApiSessionRecovery />)

    await window.fetch(api("/api/jobs"))

    expect(baseFetch).toHaveBeenCalledTimes(2)
    expect(replace).toHaveBeenCalledWith("/login?error=session-ended")
  })

  it("leaves auth routes and other origins alone", async () => {
    baseFetch.mockResolvedValue(respond(401))
    render(<ApiSessionRecovery />)

    await window.fetch(api("/api/auth/callback"))
    await window.fetch(api("/api/logout"), { method: "POST" })
    await window.fetch("https://example.com/api/jobs")

    expect(refreshSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it("restores the original fetch on unmount", () => {
    render(<ApiSessionRecovery />).unmount()
    expect(window.fetch).toBe(baseFetch)
  })
})
