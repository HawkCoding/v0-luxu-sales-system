import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { logError } from "@/lib/error-log"

/**
 * Sink for browser-measured slow API requests. Hosting (Vercel Hobby) keeps runtime logs for only
 * an hour, so a "the system was laggy on Friday" report can't be investigated afterwards. These
 * rows are the durable trail: stored in error_logs as resolved Info rows (source
 * "perf:slow-request") so they never touch the unresolved-errors badge.
 */
const clientPerfSchema = z.object({
  path: z.string().trim().min(1).max(500),
  method: z.string().trim().min(1).max(10),
  status: z.number().int().min(0).max(599),
  durationMs: z.number().int().min(0).max(600_000),
  inFlight: z.number().int().min(0).max(1000).optional(),
  page: z.string().max(500).optional(),
  vercelId: z.string().max(200).optional(),
  connection: z.string().max(20).optional(),
  appVersion: z.string().max(50).optional(),
})

export async function POST(request: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = clientPerfSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid perf report" }, { status: 400 })
  }

  const { path, method, status, durationMs } = parsed.data

  await logError({
    severity: "Info",
    source: "perf:slow-request",
    message: `${method} ${path} took ${durationMs}ms (HTTP ${status})`,
    resolved: true,
    details: {
      userId: user.id,
      path,
      method,
      status,
      durationMs,
      inFlight: parsed.data.inFlight ?? null,
      page: parsed.data.page ?? null,
      vercelId: parsed.data.vercelId ?? null,
      connection: parsed.data.connection ?? null,
      appVersion: parsed.data.appVersion ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
