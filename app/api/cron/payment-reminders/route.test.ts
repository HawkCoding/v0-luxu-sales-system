import { beforeEach, describe, expect, it, vi } from "vitest"

const workerMocks = vi.hoisted(() => ({
  runPaymentRemindersWorker: vi.fn(),
}))

vi.mock("@/lib/invoices/payment-reminders-worker", () => ({
  runPaymentRemindersWorker: workerMocks.runPaymentRemindersWorker,
}))

const supabaseMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: supabaseMocks.createServiceClient,
  createSessionClient: vi.fn(),
}))

import { GET } from "./route"

const CRON_SECRET = "test-cron-secret-abc"

function makeRequest(secret?: string) {
  return new Request("http://localhost/api/cron/payment-reminders", {
    method: "GET",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

describe("GET /api/cron/payment-reminders", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET)
    supabaseMocks.createServiceClient.mockResolvedValue({ from: vi.fn() })
    workerMocks.runPaymentRemindersWorker.mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    })
  })

  it("returns 401 without authorization header", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 401 with wrong secret", async () => {
    const res = await GET(makeRequest("wrong-secret"))
    expect(res.status).toBe(401)
  })

  it("returns 200 and calls runPaymentRemindersWorker with valid secret", async () => {
    workerMocks.runPaymentRemindersWorker.mockResolvedValue({
      processed: 3,
      sent: 2,
      skipped: 1,
      failed: 0,
    })

    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; result: Record<string, number> }
    expect(body.ok).toBe(true)
    expect(body.result).toMatchObject({ processed: 3, sent: 2, skipped: 1, failed: 0 })
    expect(workerMocks.runPaymentRemindersWorker).toHaveBeenCalledOnce()
  })

  it("returns 500 when worker throws", async () => {
    workerMocks.runPaymentRemindersWorker.mockRejectedValue(new Error("DB connection failed"))

    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("DB connection failed")
  })
})
