import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/inbound-email/crypto", () => ({
  encryptCredential: vi.fn((value: string) => `enc:${value}`),
}))

vi.mock("@/lib/settings-access", () => ({
  requireSettingsWrite: vi.fn(),
}))

import { GET, PATCH } from "./route"

const CREDENTIAL_ROW = {
  id: "cred-1",
  profile_id: "consultant-1",
  email_address: "carmen@example.com",
  smtp_host: "smtp.example.com",
  smtp_port: 465,
  smtp_encryption: "ssl",
  imap_host: "imap.example.com",
  imap_port: 993,
  imap_encryption: "ssl",
  imap_sent_folder: "Sent",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

interface SupabaseMockOptions {
  /** profile_id of the row returned by the consultant ownership lookup. */
  ownerProfileId?: string | null
}

function makeSupabase({ ownerProfileId = "consultant-1" }: SupabaseMockOptions = {}) {
  const credentialUpdate = vi.fn()
  const credentialLookupEq = vi.fn()
  const signatureUpsert = vi.fn(async () => ({ error: null }))

  const from = vi.fn((table: string) => {
    if (table === "salesperson_credentials") {
      return {
        // Ownership lookup: select("profile_id").eq("id", id).maybeSingle()
        // GET: select(SAFE_COLUMNS).eq("id", id)[.eq("profile_id", uid)].single()
        select: vi.fn(() => {
          const chain = {
            eq: vi.fn((...args: unknown[]) => {
              credentialLookupEq(...args)
              return chain
            }),
            maybeSingle: vi.fn(async () => ({
              data: ownerProfileId === null ? null : { profile_id: ownerProfileId },
              error: null,
            })),
            single: vi.fn(async () => ({ data: CREDENTIAL_ROW, error: null })),
          }
          return chain
        }),
        update: vi.fn((updates: unknown) => {
          credentialUpdate(updates)
          const chain = {
            eq: vi.fn(() => chain),
            select: vi.fn(() => chain),
            single: vi.fn(async () => ({ data: CREDENTIAL_ROW, error: null })),
          }
          return chain
        }),
      }
    }
    if (table === "email_signatures") {
      return {
        upsert: signatureUpsert,
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [{ profile_id: CREDENTIAL_ROW.profile_id, full_name: "Carmen", job_title: null, tel: null, cell: null, fax: null, email: null, website: null }],
            error: null,
          })),
        })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { supabase: { from }, credentialUpdate, credentialLookupEq, signatureUpsert }
}

function signIn(role: string, userId: string, supabase: unknown) {
  authMocks.requireRole.mockImplementation(async (roles: readonly string[]) => {
    if (!roles.includes(role)) {
      return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
    }
    return {
      ok: true,
      value: {
        supabase,
        user: { id: userId, email: `${userId}@example.com` },
        profile: { clearanceLevel: role, isActive: true, actorName: userId, name: null, surname: null, email: null },
      },
    }
  })
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/settings/salesperson-credentials/cred-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const params = () => Promise.resolve({ id: "cred-1" })

describe("PATCH /api/settings/salesperson-credentials/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("401s when not signed in", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(patchRequest({ full_name: "X" }), { params: params() })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
  })

  it("lets an admin edit any row, including someone else's signature", async () => {
    const mock = makeSupabase({ ownerProfileId: "someone-else" })
    signIn("admin", "admin-1", mock.supabase)

    const res = await PATCH(patchRequest({ smtp_host: "smtp.new.com", full_name: "Carmen De Jongh" }), { params: params() })

    expect(res.status).toBe(200)
    // Admins skip the ownership lookup entirely.
    expect(mock.credentialLookupEq).not.toHaveBeenCalled()
    expect(mock.credentialUpdate).toHaveBeenCalledWith(expect.objectContaining({ smtp_host: "smtp.new.com" }))
    expect(mock.signatureUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "consultant-1", full_name: "Carmen De Jongh" }),
    )
    const body = await res.json()
    expect(body.credential.signature.full_name).toBe("Carmen")
  })

  it("lets a manager edit any row", async () => {
    const mock = makeSupabase({ ownerProfileId: "someone-else" })
    signIn("manager", "manager-1", mock.supabase)

    const res = await PATCH(patchRequest({ job_title: "Sales" }), { params: params() })
    expect(res.status).toBe(200)
  })

  it("lets a consultant edit their own row", async () => {
    const mock = makeSupabase({ ownerProfileId: "consultant-1" })
    signIn("consultant", "consultant-1", mock.supabase)

    const res = await PATCH(patchRequest({ full_name: "Carmen", tel: "021 000 0000" }), { params: params() })

    expect(res.status).toBe(200)
    expect(mock.credentialLookupEq).toHaveBeenCalledWith("id", "cred-1")
    expect(mock.signatureUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: "consultant-1", full_name: "Carmen", tel: "021 000 0000" }),
    )
  })

  it("403s a consultant editing someone else's row", async () => {
    const mock = makeSupabase({ ownerProfileId: "someone-else" })
    signIn("consultant", "consultant-1", mock.supabase)

    const res = await PATCH(patchRequest({ full_name: "Hijack" }), { params: params() })

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Forbidden" })
    expect(mock.credentialUpdate).not.toHaveBeenCalled()
    expect(mock.signatureUpsert).not.toHaveBeenCalled()
  })

  it("403s a consultant when the row doesn't exist", async () => {
    const mock = makeSupabase({ ownerProfileId: null })
    signIn("consultant", "consultant-1", mock.supabase)

    const res = await PATCH(patchRequest({ full_name: "X" }), { params: params() })
    expect(res.status).toBe(403)
  })

  it("403s a role outside admin/manager/consultant", async () => {
    const mock = makeSupabase()
    signIn("viewer", "viewer-1", mock.supabase)

    const res = await PATCH(patchRequest({ full_name: "X" }), { params: params() })
    expect(res.status).toBe(403)
  })

  it("400s an invalid body without writing anything", async () => {
    const mock = makeSupabase()
    signIn("admin", "admin-1", mock.supabase)

    const res = await PATCH(patchRequest({ smtp_port: 99999, email: "not-an-email" }), { params: params() })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Invalid request payload")
    expect(mock.credentialUpdate).not.toHaveBeenCalled()
  })

  it("400s malformed JSON", async () => {
    const mock = makeSupabase()
    signIn("admin", "admin-1", mock.supabase)

    const res = await PATCH(patchRequest("{not json"), { params: params() })
    expect(res.status).toBe(400)
  })

  it("clears the signature when every signature field is sent blank", async () => {
    const mock = makeSupabase()
    signIn("admin", "admin-1", mock.supabase)

    const res = await PATCH(
      patchRequest({ full_name: "", job_title: "", tel: "", cell: "", fax: "", email: "", website: "" }),
      { params: params() },
    )

    expect(res.status).toBe(200)
    expect(mock.signatureUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: "consultant-1",
        full_name: null,
        job_title: null,
        tel: null,
        cell: null,
        fax: null,
        email: null,
        website: null,
      }),
    )
  })

  it("leaves the signature untouched on a mailbox-only edit", async () => {
    const mock = makeSupabase()
    signIn("admin", "admin-1", mock.supabase)

    const res = await PATCH(patchRequest({ smtp_host: "smtp.other.com" }), { params: params() })

    expect(res.status).toBe(200)
    expect(mock.signatureUpsert).not.toHaveBeenCalled()
  })
})

describe("GET /api/settings/salesperson-credentials/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("401s when not signed in", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await GET(new Request("http://localhost"), { params: params() })
    expect(res.status).toBe(401)
  })

  it("scopes a consultant's read to their own row", async () => {
    const mock = makeSupabase()
    signIn("consultant", "consultant-1", mock.supabase)

    const res = await GET(new Request("http://localhost"), { params: params() })

    expect(res.status).toBe(200)
    expect(mock.credentialLookupEq).toHaveBeenCalledWith("profile_id", "consultant-1")
  })

  it("does not scope an admin's read", async () => {
    const mock = makeSupabase()
    signIn("admin", "admin-1", mock.supabase)

    const res = await GET(new Request("http://localhost"), { params: params() })

    expect(res.status).toBe(200)
    expect(mock.credentialLookupEq).not.toHaveBeenCalledWith("profile_id", expect.anything())
  })
})
