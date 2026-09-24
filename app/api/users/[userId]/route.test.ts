import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
  createServiceClient: supabaseMocks.createServiceClient,
}))

import { DELETE, PATCH } from "./route"

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

interface ServiceOptions {
  linkedBookings?: Array<{ booking_number: string }>
  deleteError?: { message: string } | null
}

function makeServiceClient({ linkedBookings = [], deleteError = null }: ServiceOptions = {}) {
  const auditInsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }))
  const deleteUser = vi.fn(async () => ({ error: deleteError }))

  const client = {
    auth: { admin: { deleteUser } },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  user_id: TARGET_ID,
                  email: "target@t.com",
                  name: "Target",
                  surname: "User",
                },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: linkedBookings, error: null })),
            })),
          })),
        }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { client, auditInsert, deleteUser }
}

function deleteRequest() {
  return DELETE(new Request(`http://localhost/api/users/${TARGET_ID}`, { method: "DELETE" }), {
    params: Promise.resolve({ userId: TARGET_ID }),
  })
}

describe("DELETE /api/users/[userId] — admin gate", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    supabaseMocks.createServiceClient.mockReset()
  })

  it("returns 401 for an unauthenticated caller", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient(null))
    const res = await deleteRequest()
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 403 for an authenticated non-admin", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("manager"))
    const res = await deleteRequest()
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" })
  })
})

describe("DELETE /api/users/[userId] — bookings still assigned (F02-2)", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    supabaseMocks.createServiceClient.mockReset()
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
  })

  it("returns 409 without attempting the delete", async () => {
    const { client, deleteUser, auditInsert } = makeServiceClient({
      linkedBookings: [{ booking_number: "LTT-2026-0025" }],
    })
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await deleteRequest()
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/still assigned to bookings/i)
    expect(body.details.references).toEqual(["LTT-2026-0025"])
    expect(deleteUser).not.toHaveBeenCalled()
    expect(auditInsert).not.toHaveBeenCalled()
  })

  it("deletes and audits when no booking references the user", async () => {
    const { client, deleteUser, auditInsert } = makeServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await deleteRequest()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ID)
    expect(auditInsert).toHaveBeenCalledTimes(1)
    expect(auditInsert.mock.calls[0][0]).toMatchObject({ action: "user_deleted" })
  })
})

interface PatchServiceOptions {
  currentCanViewReporting?: boolean
  updateError?: { message: string } | null
}

function makePatchServiceClient({
  currentCanViewReporting = false,
  updateError = null,
}: PatchServiceOptions = {}) {
  const auditInsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }))
  const profileUpdate = vi.fn((_row: Record<string, unknown>) => ({
    eq: vi.fn(async () => ({ error: updateError })),
  }))
  const updateUserById = vi.fn(async () => ({ error: null }))

  const client = {
    auth: { admin: { updateUserById } },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  user_id: TARGET_ID,
                  email: "target@t.com",
                  name: "Target",
                  surname: "User",
                  is_active: true,
                  clearance_level: "consultant",
                  can_view_reporting: currentCanViewReporting,
                },
                error: null,
              })),
            })),
          })),
          update: profileUpdate,
        }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { client, auditInsert, profileUpdate, updateUserById }
}

function patchRequest(body: unknown, userId = TARGET_ID) {
  return PATCH(
    new Request(`http://localhost/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ userId }) },
  )
}

describe("PATCH /api/users/[userId] — reporting access", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    supabaseMocks.createServiceClient.mockReset()
  })

  it("returns 401 for an unauthenticated caller", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient(null))
    const res = await patchRequest({ canViewReporting: true })
    expect(res.status).toBe(401)
    expect(supabaseMocks.createServiceClient).not.toHaveBeenCalled()
  })

  it.each(["manager", "consultant"])("returns 403 for a %s", async (role) => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient(role))
    const res = await patchRequest({ canViewReporting: true })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" })
    expect(supabaseMocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("returns 400 for a non-boolean value", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
    const res = await patchRequest({ canViewReporting: "yes" })
    expect(res.status).toBe(400)
    expect(supabaseMocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("grants access, writes it with the service client and audits previous/next", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
    const { client, auditInsert, profileUpdate } = makePatchServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await patchRequest({ canViewReporting: true })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, canViewReporting: true })
    expect(profileUpdate).toHaveBeenCalledWith({ can_view_reporting: true })
    expect(auditInsert).toHaveBeenCalledTimes(1)
    expect(auditInsert.mock.calls[0][0]).toMatchObject({
      action: "reporting_access_changed",
      actor_user_id: ADMIN_ID,
      entity_type: "user",
      entity_id: TARGET_ID,
      meta_json: {
        target_email: "target@t.com",
        previous_can_view_reporting: false,
        next_can_view_reporting: true,
      },
    })
  })

  it("lets an admin switch their own reporting access (unlike role changes)", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
    const { client, profileUpdate } = makePatchServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await patchRequest({ canViewReporting: true }, ADMIN_ID)

    expect(res.status).toBe(200)
    expect(profileUpdate).toHaveBeenCalledWith({ can_view_reporting: true })
  })

  it("still blocks an admin changing their own role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
    const res = await patchRequest({ clearanceLevel: "consultant" }, ADMIN_ID)
    expect(res.status).toBe(400)
  })

  it("does not audit a no-op (value unchanged)", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
    const { client, auditInsert } = makePatchServiceClient({ currentCanViewReporting: true })
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await patchRequest({ canViewReporting: true })

    expect(res.status).toBe(200)
    expect(auditInsert).not.toHaveBeenCalled()
  })

  it("returns 500 without auditing when the update fails", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
    const { client, auditInsert } = makePatchServiceClient({
      updateError: { message: "Reporting access can only be changed by an administrator" },
    })
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await patchRequest({ canViewReporting: false })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: "Failed to update user profile" })
    expect(auditInsert).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/users/[userId] — failed delete (F02-3)", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    supabaseMocks.createServiceClient.mockReset()
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
  })

  it("does not write an audit row and does not leak the driver message", async () => {
    const { client, auditInsert } = makeServiceClient({
      deleteError: { message: "Database error deleting user" },
    })
    supabaseMocks.createServiceClient.mockReturnValue(client)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await deleteRequest()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: "Failed to delete user" })
    expect(auditInsert).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
