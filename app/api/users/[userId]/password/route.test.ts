import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
  createServiceClient: supabaseMocks.createServiceClient,
}))

vi.mock("@/lib/email/transport", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }))
vi.mock("@/lib/email/from", () => ({ getEmailFromAddress: vi.fn(async () => "noreply@t.com") }))
vi.mock("@/lib/email/resolve-sender", () => ({
  resolveSalespersonSender: vi.fn(async () => ({ fromAddress: null, salespersonCredentialId: null })),
}))

import { POST } from "./route"

const ADMIN_ID = "00000000-0000-4000-8000-000000000001"
const TARGET_ID = "00000000-0000-4000-8000-000000000002"

function makeSessionClient(role: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: role !== null ? { id: ADMIN_ID } : null },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: role
              ? { name: "Carmen", surname: "de Jager", clearance_level: role, email: "c@t.com" }
              : null,
            error: null,
          })),
        })),
      })),
    })),
  }
}

function passwordRequest() {
  return POST(
    new Request(`http://localhost/api/users/${TARGET_ID}/password`, {
      method: "POST",
      body: JSON.stringify({ newPassword: "SufficientlyLong1" }),
    }),
    { params: Promise.resolve({ userId: TARGET_ID }) }
  )
}

describe("POST /api/users/[userId]/password — auth contract (F02-8)", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    supabaseMocks.createServiceClient.mockReset()
  })

  it("returns 401 for an unauthenticated caller", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient(null))
    const res = await passwordRequest()
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 403 for an authenticated non-admin", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("manager"))
    const res = await passwordRequest()
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" })
  })
})
