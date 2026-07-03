import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: supabaseMocks.createServiceClient,
}))

const errorLogMocks = vi.hoisted(() => ({
  logError: vi.fn(async () => {}),
}))
vi.mock("@/lib/error-log", () => ({ logError: errorLogMocks.logError }))

import { POST } from "./route"

const SECRET = "test-webhook-secret"

function makeServiceClient(insertError: unknown = null) {
  const insertedRows: Array<Record<string, unknown>> = []
  return {
    client: {
      from: vi.fn(() => ({
        insert: vi.fn(async (row: Record<string, unknown>) => {
          insertedRows.push(row)
          return { error: insertError }
        }),
      })),
    },
    insertedRows,
  }
}

function makeRequest({
  secret,
  body = { form_id: "3", "1": "Jane" },
  rawBody,
}: { secret?: string; body?: unknown; rawBody?: string } = {}) {
  const headers: Record<string, string> = {}
  if (secret !== undefined) headers["x-webhook-secret"] = secret
  return new Request("http://localhost/api/webhooks/gravity-forms", {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body),
  })
}

describe("POST /api/webhooks/gravity-forms", () => {
  beforeEach(() => {
    supabaseMocks.createServiceClient.mockReset()
    errorLogMocks.logError.mockReset()
    vi.stubEnv("GRAVITY_FORMS_WEBHOOK_SECRET", SECRET)
  })

  it("returns 401 when the secret header is missing", async () => {
    const res = await POST(makeRequest({ secret: undefined }))
    expect(res.status).toBe(401)
  })

  it("returns 401 when the secret header is wrong", async () => {
    const res = await POST(makeRequest({ secret: "wrong-secret" }))
    expect(res.status).toBe(401)
  })

  it("returns 401 when GRAVITY_FORMS_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("GRAVITY_FORMS_WEBHOOK_SECRET", "")
    const res = await POST(makeRequest({ secret: SECRET }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for malformed JSON body", async () => {
    const res = await POST(makeRequest({ secret: SECRET, rawBody: "{not json" }))
    expect(res.status).toBe(400)
  })

  it("stores the raw payload and returns 200 on a valid request", async () => {
    const { client, insertedRows } = makeServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await POST(makeRequest({ secret: SECRET, body: { form_id: "3", "1": "Jane" } }))

    expect(res.status).toBe(200)
    const responseBody = await res.json()
    expect(responseBody).toEqual({ received: true })
    expect(client.from).toHaveBeenCalledWith("gravity_forms_submissions")
    expect(insertedRows).toEqual([{ form_id: "3", payload: { form_id: "3", "1": "Jane" } }])
  })

  it("stores a null form_id when the payload has none", async () => {
    const { client, insertedRows } = makeServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    await POST(makeRequest({ secret: SECRET, body: { "1": "Jane" } }))

    expect(insertedRows).toEqual([{ form_id: null, payload: { "1": "Jane" } }])
  })

  it("returns 500 and logs Critical error when the insert fails", async () => {
    const { client } = makeServiceClient({ message: "db error" })
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await POST(makeRequest({ secret: SECRET }))

    expect(res.status).toBe(500)
    expect(errorLogMocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "Critical", source: "gravity-forms-webhook" }),
    )
  })
})
