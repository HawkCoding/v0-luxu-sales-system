import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))
const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getEmailFromAddress: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/email/transport", () => ({
  sendEmail: emailMocks.sendEmail,
}))

vi.mock("@/lib/email/from", () => ({
  getEmailFromAddress: emailMocks.getEmailFromAddress,
}))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function buildAuth() {
  const correspondenceInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          id: "cor-1",
          booking_id: BOOKING_ID,
          channel: "email",
          subject: "Hello",
          body_html: null,
          status: "sent",
          sent_at: "2026-05-01T00:00:00.000Z",
          error: null,
          provider_message_id: "pmid",
        },
        error: null,
      })),
    })),
  }))

  const followUpInsert = vi.fn(async () => ({ error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { stage: "quote_sent", customer: { email: "c@example.com" } },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        }
      }
      if (table === "correspondences") {
        let calls = 0
        return {
          insert: vi.fn((...args: unknown[]) => {
            calls += 1
            if (calls === 1) return correspondenceInsert(...(args as []))
            return followUpInsert()
          }),
        }
      }
      if (table === "audit_logs") return { insert: vi.fn(async () => ({ error: null })) }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Jane Doe", name: "Jane", surname: "Doe", email: "u@example.com" },
    },
  })

  return { correspondenceInsert, followUpInsert }
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/correspondence", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/correspondence", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    emailMocks.sendEmail.mockReset()
    emailMocks.getEmailFromAddress.mockReset()
    emailMocks.getEmailFromAddress.mockResolvedValue("noreply@example.com")
    emailMocks.sendEmail.mockResolvedValue({
      success: true,
      provider: "mailpit",
      providerMessageId: "pmid",
      error: null,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hi" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hi" }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when bookingId/jobId missing", async () => {
    buildAuth()
    const res = await POST(postJson({ subject: "Hi" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when moveStage is not a known stage", async () => {
    buildAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hi", moveStage: "not_a_stage" }))
    expect(res.status).toBe(400)
  })

  it("sends the email and inserts correspondence on success", async () => {
    buildAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, subject: "Hello" }))
    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@example.com", subject: "Hello" }),
    )
  })
})
