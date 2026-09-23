import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetUser = vi.fn()
const mockCanUserViewReporting = vi.fn()
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}))

vi.mock("@/lib/reports/access", () => ({
  canUserViewReporting: (...args: unknown[]) => mockCanUserViewReporting(...args),
}))

import ReportingLayout from "./layout"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ReportingLayout (server guard)", () => {
  it("redirects an unauthenticated visitor to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(ReportingLayout({ children: "page" })).rejects.toThrow("NEXT_REDIRECT:/login")
    expect(mockCanUserViewReporting).not.toHaveBeenCalled()
  })

  it("redirects a user without the reporting grant to the dashboard", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockCanUserViewReporting.mockResolvedValue(false)

    await expect(ReportingLayout({ children: "page" })).rejects.toThrow("NEXT_REDIRECT:/app")
    expect(mockCanUserViewReporting).toHaveBeenCalledWith(expect.anything(), "u1")
  })

  it("renders the page for a user with the grant", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockCanUserViewReporting.mockResolvedValue(true)

    await expect(ReportingLayout({ children: "page" })).resolves.toBe("page")
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
