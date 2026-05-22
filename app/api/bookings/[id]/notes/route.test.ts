import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireUser: vi.fn(),
}))
vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: authMocks.requireUser,
}))

import { GET, POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const USER_ID = "00000000-0000-4000-8000-000000000001"
const params = Promise.resolve({ id: BOOKING_ID })

interface NoteRow {
  id: string
  booking_id: string
  author_id: string | null
  body: string
  created_at: string
  updated_at: string
}

function setupListAuth(notes: NoteRow[]) {
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "booking_notes") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(async () => ({ data: notes, error: null })),
                })),
              })),
            }
          }
          if (table === "profiles") {
            return {
              select: vi.fn(() => ({
                in: vi.fn(async () => ({
                  data: [
                    { user_id: USER_ID, name: "Jane", surname: "Doe", email: "j@x" },
                  ],
                  error: null,
                })),
              })),
            }
          }
          throw new Error(`Unexpected table: ${table}`)
        }),
      },
      user: { id: USER_ID },
      profile: { actorName: "Jane Doe", clearanceLevel: "consultant" },
    },
  })
}

function setupPostAuth(bookingFound: boolean, insertResult: { data: NoteRow | null; error: unknown }) {
  const insertChain = vi.fn(() => ({
    select: vi.fn(() => ({ single: vi.fn(async () => insertResult) })),
  }))
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "bookings") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: bookingFound ? { id: BOOKING_ID } : null,
                    error: null,
                  })),
                })),
              })),
            }
          }
          if (table === "booking_notes") return { insert: insertChain }
          throw new Error(`Unexpected table: ${table}`)
        }),
      },
      user: { id: USER_ID },
      profile: { actorName: "Jane Doe", clearanceLevel: "consultant" },
    },
  })
  return { insertChain }
}

function jsonReq(body: unknown): Request {
  return new Request(`http://localhost/api/bookings/${BOOKING_ID}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/bookings/[id]/notes", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(401)
  })

  it("returns notes with author display names", async () => {
    setupListAuth([
      {
        id: "n1",
        booking_id: BOOKING_ID,
        author_id: USER_ID,
        body: "Hello",
        created_at: "2026-04-15T10:00:00Z",
        updated_at: "2026-04-15T10:00:00Z",
      },
    ])
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { notes: Array<{ authorName: string; body: string }> }
    expect(body.notes).toHaveLength(1)
    expect(body.notes[0].authorName).toBe("Jane Doe")
    expect(body.notes[0].body).toBe("Hello")
  })
})

describe("POST /api/bookings/[id]/notes", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 403 when readonly", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(jsonReq({ body: "hi" }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 for empty body", async () => {
    setupPostAuth(true, { data: null, error: null })
    const res = await POST(jsonReq({ body: "" }), { params })
    expect(res.status).toBe(400)
  })

  it("returns 404 when booking missing", async () => {
    setupPostAuth(false, { data: null, error: null })
    const res = await POST(jsonReq({ body: "hello" }), { params })
    expect(res.status).toBe(404)
  })

  it("creates a note and returns 201", async () => {
    setupPostAuth(true, {
      data: {
        id: "n2",
        booking_id: BOOKING_ID,
        author_id: USER_ID,
        body: "hello",
        created_at: "2026-05-18T12:00:00Z",
        updated_at: "2026-05-18T12:00:00Z",
      },
      error: null,
    })
    const res = await POST(jsonReq({ body: "hello" }), { params })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; body: string }
    expect(body.id).toBe("n2")
    expect(body.body).toBe("hello")
  })
})
